// PostgreSQL-backed stadium state for the FIFA ticketing system
import { logger } from "./logger.js";
import { db, pool, tickets, requestLog } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import Redis from 'ioredis';
import type { SystemMetrics, GateStatus } from "./types.js";
import { addAlert, resolveAlerts, getAlerts, resetAlerts } from "./alerts.js";
import { recordLatency, updateMetrics, getCurrentMetrics, getMetricsHistory, clearMetricsHistory, clearLatencyWindow } from "./metrics.js";
import { startSimulation, stopSimulation, getSimulationStatus, gateStates, resetGateStates } from "./simulation.js";

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

// ── DB seed (runs once at startup) ────────────────────────────────────────
async function seedTickets(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    logger.info("[db] Skipping seed in mock mode");
    return;
  }
  const result = await db.execute(sql`SELECT COUNT(*)::int AS c FROM tickets`);
  const count = (result.rows[0] as any).c as number;
  if (count >= 100_000) {
    logger.info("[db] tickets already seeded");
    return;
  }
  logger.info("[db] seeding 100k tickets...");
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

// ── Mutable state ──────────────────────────────────────────────────────────
let state: SystemMetrics = {
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
} as any;

let mcpEventsForwarded = 0;
let mcpLastPing = Date.now();

// ── Public API ─────────────────────────────────────────────────────────────
export function getStadiumCapacity() {
  const CAPACITY = 80_000;
  const occupancy = Math.min(state.totalEntered, CAPACITY);
  return {
    totalCapacity: CAPACITY,
    currentOccupancy: occupancy,
    occupancyPercent: Math.round((occupancy / CAPACITY) * 1000) / 10,
    gates: gateStates,
  };
}

// ── validateTicket — real DB read + write ─────────────────────────────────
export async function validateTicket(ticketId: string): Promise<{ valid: boolean; overloaded: boolean }> {
  const t0 = Date.now();
  state.requestCount++;
  state.totalRequests++;

  const poolStats = pool as any;
  const waitingClients = poolStats.waitingCount ?? 0;
  const isOverloaded = waitingClients > 150 || (state.cpuUsage > 95 && Math.random() < 0.5);

  if (isOverloaded) {
    recordLatency(Date.now() - t0);
    db.insert(requestLog).values({ ticketId, status: "overloaded", latencyMs: Date.now() - t0, ts: Date.now() }).catch(() => {});
    return { valid: false, overloaded: true };
  }

  try {
    const rows = await db.select({ id: tickets.id, used: tickets.used })
      .from(tickets)
      .where(eq(tickets.id, ticketId))
      .limit(1);

    const latencyMs = Date.now() - t0;
    recordLatency(latencyMs);
    state.avgLatency = state.avgLatency * 0.95 + latencyMs * 0.05;

    const valid = rows.length > 0 && !rows[0].used;
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

  await db.update(tickets).set({ used: true, gate, scannedAt: Date.now() }).where(eq(tickets.id, ticketId));
  state.totalEntered++;
  state.gateEntries.set(gate, (state.gateEntries.get(gate) ?? 0) + 1);
  await redis.incr('tickets_scanned');
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
  await Promise.all([
    db.execute(sql`TRUNCATE TABLE request_log`),
    db.update(tickets).set({ used: false, gate: null, scannedAt: null }),
    redis.set('tickets_scanned', '0'),
  ]).catch((err) => logger.warn({ err }, "resetSystem DB error"));

  state = { requestCount: 0, avgLatency: 50, cpuUsage: 20, memoryUsage: 30, activeServers: 1, errorRate: 0, totalRequests: 0, requestsPerSecond: 0, lastRequestTime: Date.now(), gateEntries: new Map(), totalEntered: 0 } as any;
  clearLatencyWindow();
  mcpEventsForwarded = 0;
  mcpLastPing = Date.now();
  resetAlerts();
  clearMetricsHistory();
  resetGateStates();
  addAlert("info", "System Reset", "All metrics and DB state cleared.");
}

export function getMcpStatus() {
  return {
    connected: true,
    serverUrl: "npx @dynatrace-oss/dynatrace-mcp-server@latest",
    toolsAvailable: ["get_metrics","get_problems","get_entities","get_events","get_synthetic_locations","push_metric","create_event"],
    lastPing: mcpLastPing, eventsForwarded: mcpEventsForwarded,
    dynatraceEnvId: process.env["DYNATRACE_ENV_ID"] ?? null,
    status: process.env["DYNATRACE_ENV_ID"] ? "connected" : "simulated",
  } as const;
}

// Re-export functions from split modules
export { aiAnalyze } from "./ai-analyze.js";
export { getCurrentMetrics, getMetricsHistory } from "./metrics.js";
export { getAlerts, resolveAlerts } from "./alerts.js";

// Wrap simulation functions to pass state and addAlert
export function startSimulationWrapper(intensity: "low" | "medium" | "high" | "surge", durationSeconds = 120) {
  return startSimulation(intensity, durationSeconds, state, addAlert);
}
export { stopSimulation, getSimulationStatus } from "./simulation.js";

// ── Background metrics collection ──────────────────────────────────────────
const _metricsInterval = setInterval(async () => {
  mcpEventsForwarded++;
  mcpLastPing = Date.now();
  await updateMetrics(state, { virtualUsers: 0 }, mcpEventsForwarded, mcpLastPing, addAlert, getAlerts());
}, 2000);

addAlert("info", "System Online", "FIFA AI Traffic Management System initialized with PostgreSQL backend.");