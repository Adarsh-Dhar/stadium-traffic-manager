// PostgreSQL-backed stadium state for the FIFA ticketing system
import { logger } from "./logger.js";
import { pushMetrics, pushEvent } from "./dynatrace.js";
import { db, pool, tickets, requestLog, metricsSnapshots } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

// ── Types (unchanged) ──────────────────────────────────────────────────────
export interface SystemMetrics {
  avgLatency: number; p95Latency: number; p99Latency: number;
  cpuUsage: number; memoryUsage: number; activeServers: number;
  requestsPerSecond: number; errorRate: number; totalRequests: number;
  k6P95Pass: boolean; k6P99Pass: boolean;
}
export interface MetricsSnapshot extends SystemMetrics { timestamp: number; }
export interface Alert {
  id: string; severity: "info" | "warning" | "critical";
  title: string; message: string; timestamp: number;
  resolved: boolean; aiAction: string | null;
}
export interface GateStatus {
  id: string; name: string; status: "open" | "congested" | "closed"; throughput: number;
}
export interface SimulationState {
  running: boolean; stage: string; intensity: "low" | "medium" | "high" | "surge" | null;
  startedAt: number | null; durationSeconds: number; virtualUsers: number; nextStage: string | null;
}

// ── DB seed (runs once at startup) ────────────────────────────────────────
async function seedTickets(): Promise<void> {
  const result = await db.execute(sql`SELECT COUNT(*)::int AS c FROM tickets`);
  const count = (result.rows[0] as any).c as number;
  if (count >= 100_000) {
    logger.info("[db] tickets already seeded");
    return;
  }
  logger.info("[db] seeding 100k tickets...");
  // Insert in batches of 5k to avoid huge single statement
  for (let batch = 0; batch < 20; batch++) {
    const values = [];
    for (let i = batch * 5_000; i < (batch + 1) * 5_000; i++) {
      values.push({ id: `TICKET_${i}_2026WC`, used: false });
    }
    await db.insert(tickets).values(values).onConflictDoNothing();
  }
  logger.info("[db] 100k tickets seeded");
}

seedTickets().catch((err) => logger.error({ err }, "[db] seed failed"));

// ── Real CPU measurement ───────────────────────────────────────────────────
let lastCpuSample = process.cpuUsage();
let lastCpuTime = Date.now();

function getRealCpuPercent(): number {
  const now = Date.now();
  const elapsed = now - lastCpuTime;
  if (elapsed < 500) return state.cpuUsage;
  const usage = process.cpuUsage(lastCpuSample);
  lastCpuSample = process.cpuUsage();
  lastCpuTime = now;
  return Math.min(100, ((usage.user + usage.system) / 1000 / elapsed) * 100);
}

// ── Real memory measurement ────────────────────────────────────────────────
function getRealMemoryPercent(): number {
  const mem = process.memoryUsage();
  // rss as a % of 2GB ceiling — adjust ceiling to match your machine
  const ceilingBytes = 2 * 1024 * 1024 * 1024;
  return Math.min(100, (mem.rss / ceilingBytes) * 100);
}

// ── Rolling latency window ─────────────────────────────────────────────────
const latencyWindow: number[] = [];
const LATENCY_WINDOW_SIZE = 500;

function recordLatency(ms: number): void {
  latencyWindow.push(ms);
  if (latencyWindow.length > LATENCY_WINDOW_SIZE) latencyWindow.shift();
}

function computePercentile(sorted: number[], pct: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function getLatencyPercentiles(): { p95: number; p99: number } {
  if (!latencyWindow.length) return { p95: 50, p99: 55 };
  const sorted = [...latencyWindow].sort((a, b) => a - b);
  return {
    p95: Math.round(computePercentile(sorted, 95)),
    p99: Math.round(computePercentile(sorted, 99)),
  };
}

// ── Mutable state ──────────────────────────────────────────────────────────
let state = {
  requestCount: 0,
  avgLatency: 50,
  cpuUsage: 20,
  memoryUsage: 30,
  activeServers: 1,
  errorRate: 0,
  totalRequests: 0,
  requestsPerSecond: 0,
  lastRequestTime: Date.now(),
  gateEntries: new Map<string, number>(),
  totalEntered: 0,
};

let alerts: Alert[] = [];
let metricsHistory: MetricsSnapshot[] = [];
let simulation: SimulationState = {
  running: false, stage: "idle", intensity: null,
  startedAt: null, durationSeconds: 120, virtualUsers: 0, nextStage: null,
};
let simulationInterval: ReturnType<typeof setInterval> | null = null;
let metricsInterval: ReturnType<typeof setInterval> | null = null;
let mcpEventsForwarded = 0;
let mcpLastPing = Date.now();

// ── Gate definitions ───────────────────────────────────────────────────────
const GATES: GateStatus[] = [
  { id: "gate-a", name: "Gate A — North",  status: "open", throughput: 0 },
  { id: "gate-b", name: "Gate B — South",  status: "open", throughput: 0 },
  { id: "gate-c", name: "Gate C — East",   status: "open", throughput: 0 },
  { id: "gate-d", name: "Gate D — West",   status: "open", throughput: 0 },
  { id: "gate-e", name: "Gate E — VIP",    status: "open", throughput: 0 },
  { id: "gate-f", name: "Gate F — Press",  status: "open", throughput: 0 },
];
let gateStates = GATES.map((g) => ({ ...g }));

// ── Alerts ─────────────────────────────────────────────────────────────────
function generateAlertId() { return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

export function addAlert(severity: Alert["severity"], title: string, message: string, aiAction: string | null = null): void {
  alerts.unshift({ id: generateAlertId(), severity, title, message, timestamp: Date.now(), resolved: false, aiAction });
  if (alerts.length > 50) alerts = alerts.slice(0, 50);
  if (severity === "critical" || severity === "warning") {
    pushEvent(title, message, severity === "critical" ? "CUSTOM_ALERT" : "INFO").catch(() => {});
  }
}

export function resolveAlerts(severity?: Alert["severity"]): void {
  alerts = alerts.map((a) => (!a.resolved && (!severity || a.severity === severity)) ? { ...a, resolved: true } : a);
}

// ── Metrics update (runs every 2s) ─────────────────────────────────────────
async function updateMetrics(): Promise<void> {
  const now = Date.now();
  const elapsed = (now - state.lastRequestTime) / 1000;
  state.requestsPerSecond = elapsed > 0 ? Math.round(state.requestCount / Math.max(elapsed, 1)) : 0;

  // Use REAL CPU and memory now
  state.cpuUsage   = state.cpuUsage   * 0.6 + getRealCpuPercent()   * 0.4;
  state.memoryUsage = state.memoryUsage * 0.6 + getRealMemoryPercent() * 0.4;

  // Pool pressure — reflect connection queue depth in avgLatency
  const poolStats = pool as any; // pg Pool exposes these properties
  const waitingClients = poolStats.waitingCount ?? 0;
  if (waitingClients > 0) {
    state.avgLatency = Math.min(5000, state.avgLatency + waitingClients * 10);
  }

  // Error rate from latency window
  const highLatencies = latencyWindow.filter((l) => l > 2000).length;
  state.errorRate = latencyWindow.length ? (highLatencies / latencyWindow.length) * 100 : 0;

  // Alerts
  if (state.cpuUsage > 85 && !alerts.find((a) => !a.resolved && a.title.includes("CPU"))) {
    addAlert("critical", "CPU Critical", `Real CPU at ${state.cpuUsage.toFixed(0)}% — scale recommended.`);
  }
  if (state.avgLatency > 1500 && !alerts.find((a) => !a.resolved && a.title.includes("Latency"))) {
    addAlert("warning", "High Latency", `Avg latency ${state.avgLatency.toFixed(0)}ms — DB pool likely saturated.`);
  }

  mcpEventsForwarded++;
  mcpLastPing = Date.now();
  const { p95, p99 } = getLatencyPercentiles();

  const snapshot: MetricsSnapshot = {
    timestamp: now,
    avgLatency: Math.round(state.avgLatency),
    p95Latency: p95, p99Latency: p99,
    cpuUsage: Math.round(state.cpuUsage * 10) / 10,
    memoryUsage: Math.round(state.memoryUsage * 10) / 10,
    activeServers: state.activeServers,
    requestsPerSecond: state.requestsPerSecond,
    errorRate: Math.round(state.errorRate * 10) / 10,
    totalRequests: state.totalRequests,
    k6P95Pass: p95 < 2000, k6P99Pass: p99 < 5000,
  };
  metricsHistory.push(snapshot);
  if (metricsHistory.length > 150) metricsHistory.shift();

  // Persist snapshot to Postgres
  db.insert(metricsSnapshots).values({
    ts: now, avgLatency: snapshot.avgLatency, p95Latency: p95, p99Latency: p99,
    cpuUsage: Math.round(state.cpuUsage), memoryUsage: Math.round(state.memoryUsage),
    activeServers: state.activeServers, requestsPerSec: state.requestsPerSecond,
    errorRate: Math.round(state.errorRate), totalRequests: state.totalRequests,
  }).catch(() => {});

  pushMetrics({
    avgLatency: snapshot.avgLatency, p95Latency: p95, p99Latency: p99,
    cpuUsage: snapshot.cpuUsage, memoryUsage: snapshot.memoryUsage,
    activeServers: state.activeServers, requestsPerSecond: state.requestsPerSecond,
    errorRate: snapshot.errorRate, totalRequests: state.totalRequests,
    virtualUsers: simulation.virtualUsers,
  }, now).catch(() => {});
}

// ── Simulation (stages unchanged, just wired to real state) ───────────────
const STAGE_CONFIGS: Record<string, { vus: number[]; name: string; nextStage: string | null }[]> = {
  low:    [{ vus: [0, 200], name: "Warmup", nextStage: "Gradual Increase" }, { vus: [200, 500], name: "Gradual Increase", nextStage: "Sustained" }, { vus: [500, 500], name: "Sustained", nextStage: null }],
  medium: [{ vus: [0, 500], name: "Warmup", nextStage: "Gradual Increase" }, { vus: [500, 1500], name: "Gradual Increase", nextStage: "Peak" }, { vus: [1500, 1500], name: "Peak", nextStage: null }],
  high:   [{ vus: [0, 1000], name: "Warmup", nextStage: "Gradual Increase" }, { vus: [1000, 3000], name: "Gradual Increase", nextStage: "Peak Load" }, { vus: [3000, 4000], name: "Peak Load", nextStage: "Sustained Peak" }, { vus: [4000, 4000], name: "Sustained Peak", nextStage: null }],
  surge:  [{ vus: [0, 2000], name: "Warmup", nextStage: "Crowd Rush" }, { vus: [2000, 5000], name: "Crowd Rush", nextStage: "Peak Surge" }, { vus: [5000, 8000], name: "Peak Surge", nextStage: "Sustained Surge" }, { vus: [8000, 8000], name: "Sustained Surge", nextStage: "Cooldown" }, { vus: [8000, 0], name: "Cooldown", nextStage: null }],
};

function runSimulationTick(): void {
  if (!simulation.running || !simulation.startedAt || !simulation.intensity) return;
  const elapsed = (Date.now() - simulation.startedAt) / 1000;
  const stages = STAGE_CONFIGS[simulation.intensity] ?? STAGE_CONFIGS["medium"];
  const stageDuration = simulation.durationSeconds / stages.length;
  const stageIndex = Math.min(Math.floor(elapsed / stageDuration), stages.length - 1);
  const stage = stages[stageIndex];
  const stageProgress = (elapsed % stageDuration) / stageDuration;
  simulation.virtualUsers = Math.round(stage.vus[0] + (stage.vus[1] - stage.vus[0]) * stageProgress);
  simulation.stage = stage.name;
  simulation.nextStage = stage.nextStage;
  gateStates = gateStates.map((gate) => {
    const throughput = Math.round((simulation.virtualUsers / gateStates.length) * (0.8 + Math.random() * 0.4));
    const status: GateStatus["status"] = state.cpuUsage > 85 ? "congested" : state.cpuUsage > 60 && Math.random() > 0.7 ? "congested" : "open";
    return { ...gate, throughput, status };
  });
  if (elapsed >= simulation.durationSeconds) {
    stopSimulation();
    addAlert("info", "Simulation Complete", `Load test finished.`);
  }
}

export function startSimulation(intensity: "low" | "medium" | "high" | "surge", durationSeconds = 120): SimulationState {
  if (simulation.running) stopSimulation();
  simulation = { running: true, stage: "Starting", intensity, startedAt: Date.now(), durationSeconds, virtualUsers: 0, nextStage: null };
  addAlert("info", `Simulation Started — ${intensity.toUpperCase()}`, `Crowd surge simulation initiated.`);
  simulationInterval = setInterval(runSimulationTick, 500);
  return { ...simulation };
}

export function stopSimulation(): SimulationState {
  if (simulationInterval) { clearInterval(simulationInterval); simulationInterval = null; }
  simulation = { running: false, stage: "idle", intensity: simulation.intensity, startedAt: null, durationSeconds: simulation.durationSeconds, virtualUsers: 0, nextStage: null };
  gateStates = GATES.map((g) => ({ ...g }));
  return { ...simulation };
}

export function getSimulationStatus(): SimulationState {
  const elapsedSeconds = simulation.startedAt ? Math.round((Date.now() - simulation.startedAt) / 1000) : 0;
  return { ...simulation, elapsedSeconds } as any;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function getCurrentMetrics(): SystemMetrics {
  const { p95, p99 } = getLatencyPercentiles();
  return {
    avgLatency: Math.round(state.avgLatency), p95Latency: p95, p99Latency: p99,
    cpuUsage: Math.round(state.cpuUsage * 10) / 10, memoryUsage: Math.round(state.memoryUsage * 10) / 10,
    activeServers: state.activeServers, requestsPerSecond: state.requestsPerSecond,
    errorRate: Math.round(state.errorRate * 10) / 10, totalRequests: state.totalRequests,
    k6P95Pass: p95 < 2000, k6P99Pass: p99 < 5000,
  };
}

export function getMetricsHistory(): MetricsSnapshot[] { return [...metricsHistory]; }
export function getAlerts(): Alert[] { return [...alerts]; }
export function getStadiumCapacity() {
  return { totalCapacity: 80000, currentOccupancy: Math.min(state.totalEntered, 80000), occupancyPercent: Math.round((Math.min(state.totalEntered, 80000) / 80000) * 1000) / 10, gates: gateStates };
}

// ── validateTicket — THE KEY CHANGE: real DB read + write ─────────────────
export async function validateTicket(ticketId: string): Promise<{ valid: boolean; overloaded: boolean }> {
  const t0 = Date.now();
  state.requestCount++;
  state.totalRequests++;

  // Check pool pressure — only consider overloaded when queue is genuinely high
  const poolStats = pool as any;
  const waitingClients = poolStats.waitingCount ?? 0;
  const isOverloaded = waitingClients > 50 || (state.cpuUsage > 90 && Math.random() < 0.3);

  if (isOverloaded) {
    recordLatency(Date.now() - t0);
    // Log the overload to DB (fire and forget)
    db.insert(requestLog).values({ ticketId, status: "overloaded", latencyMs: Date.now() - t0, ts: Date.now() }).catch(() => {});
    return { valid: false, overloaded: true };
  }

  try {
    // Real SELECT against Postgres — this is what creates actual DB load
    const rows = await db.select({ id: tickets.id, used: tickets.used })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    const latencyMs = Date.now() - t0;
    recordLatency(latencyMs);
    state.avgLatency = state.avgLatency * 0.95 + latencyMs * 0.05;

    const valid = rows.length > 0 && !rows[0].used;

    // INSERT into request_log — this double I/O is what stresses the pool under 100k
    await db.insert(requestLog).values({ ticketId, status: valid ? "valid" : "invalid", latencyMs, ts: Date.now() });

    return { valid, overloaded: false };
  } catch (err: any) {
    const latencyMs = Date.now() - t0;
    recordLatency(latencyMs);
    logger.error({ err: err.message, ticketId }, "validateTicket DB error");
    return { valid: false, overloaded: true };
  }
}

// ── scanTicket ────────────────────────────────────────────────────────────
export async function scanTicket(ticketId: string, gate: string): Promise<{ success: boolean; totalEntered: number }> {
  state.requestCount++;
  state.totalRequests++;

  const rows = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!rows.length || rows[0].used) return { success: false, totalEntered: state.totalEntered };

  // Mark ticket as used — real UPDATE
  await db.update(tickets).set({ used: true, gate, scannedAt: Date.now() }).where(eq(tickets.id, ticketId));
  state.totalEntered++;
  state.gateEntries.set(gate, (state.gateEntries.get(gate) ?? 0) + 1);
  return { success: true, totalEntered: state.totalEntered };
}

export function scaleServer(action: "add-server" | "remove-server"): void {
  if (action === "add-server") {
    state.activeServers++;
    addAlert("info", "Server Scaled Up", `Now running ${state.activeServers} active servers.`, `Added server #${state.activeServers}`);
  } else if (action === "remove-server" && state.activeServers > 1) {
    state.activeServers--;
    addAlert("info", "Server Scaled Down", `Now running ${state.activeServers} active servers.`);
  }
}

export async function resetSystem(): Promise<void> {
  stopSimulation();
  // Truncate logs and reset ticket usage
  await Promise.all([
    db.execute(sql`TRUNCATE TABLE request_log`),
    db.update(tickets).set({ used: false, gate: null, scannedAt: null }),
  ]).catch((err) => logger.warn({ err }, "resetSystem DB error"));

  state = { requestCount: 0, avgLatency: 50, cpuUsage: 20, memoryUsage: 30, activeServers: 1, errorRate: 0, totalRequests: 0, requestsPerSecond: 0, lastRequestTime: Date.now(), gateEntries: new Map(), totalEntered: 0 };
  latencyWindow.length = 0;
  mcpEventsForwarded = 0;
  alerts = [];
  metricsHistory = [];
  gateStates = GATES.map((g) => ({ ...g }));
  addAlert("info", "System Reset", "All metrics and DB state cleared.");
}

export function getMcpStatus() {
  const poolStats = pool as any;
  return {
    connected: true,
    serverUrl: "npx @dynatrace-oss/dynatrace-mcp-server@latest",
    toolsAvailable: ["get_metrics","get_problems","get_entities","get_events","get_synthetic_locations","push_metric","create_event"],
    lastPing: mcpLastPing, eventsForwarded: mcpEventsForwarded,
    dynatraceEnvId: process.env["DYNATRACE_ENV_ID"] ?? null,
    status: process.env["DYNATRACE_ENV_ID"] ? "connected" : "simulated",
    // NEW — exposes pool health in the MCP status endpoint
    pgPool: { total: poolStats.totalCount ?? 0, idle: poolStats.idleCount ?? 0, waiting: poolStats.waitingCount ?? 0 },
  } as const;
}

// Keep the full aiAnalyze export (it's unchanged — paste from original stadium-state.ts)
export { aiAnalyze } from "./ai-analyze.js";

// ── Background metrics collection ──────────────────────────────────────────
metricsInterval = setInterval(() => { updateMetrics().catch(() => {}); }, 2000);
addAlert("info", "System Online", "FIFA AI Traffic Management System initialized with PostgreSQL backend.");