// In-memory simulation state for the FIFA ticketing system
import { logger } from "./logger.js";
import { pushMetrics, pushEvent } from "./dynatrace.js";

export interface SystemMetrics {
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  cpuUsage: number;
  memoryUsage: number;
  activeServers: number;
  requestsPerSecond: number;
  errorRate: number;
  totalRequests: number;
  k6P95Pass: boolean;
  k6P99Pass: boolean;
}

export interface MetricsSnapshot extends SystemMetrics {
  timestamp: number;
}

export interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  timestamp: number;
  resolved: boolean;
  aiAction: string | null;
}

export interface GateStatus {
  id: string;
  name: string;
  status: "open" | "congested" | "closed";
  throughput: number;
}

export interface SimulationState {
  running: boolean;
  stage: string;
  intensity: "low" | "medium" | "high" | "surge" | null;
  startedAt: number | null;
  durationSeconds: number;
  virtualUsers: number;
  nextStage: string | null;
}

// Valid ticket pool
const validTickets = new Set<string>();
for (let i = 0; i < 100000; i++) {
  validTickets.add(`TICKET_${i}_2026WC`);
}

// Rolling latency window for percentile computation (last 200 samples)
const latencyWindow: number[] = [];
const LATENCY_WINDOW_SIZE = 200;
// MCP bridge simulated state
let mcpEventsForwarded = 0;
let mcpLastPing = Date.now();

function recordLatency(ms: number): void {
  latencyWindow.push(ms);
  if (latencyWindow.length > LATENCY_WINDOW_SIZE) latencyWindow.shift();
}

function computePercentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function getLatencyPercentiles(): { p95: number; p99: number } {
  if (latencyWindow.length === 0) return { p95: 50, p99: 55 };
  const sorted = [...latencyWindow].sort((a, b) => a - b);
  return {
    p95: Math.round(computePercentile(sorted, 95)),
    p99: Math.round(computePercentile(sorted, 99)),
  };
}

// Mutable state
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
  running: false,
  stage: "idle",
  intensity: null,
  startedAt: null,
  durationSeconds: 120,
  virtualUsers: 0,
  nextStage: null,
};

let simulationInterval: ReturnType<typeof setInterval> | null = null;
let metricsInterval: ReturnType<typeof setInterval> | null = null;

// Gate definitions
const GATES: GateStatus[] = [
  { id: "gate-a", name: "Gate A — North", status: "open", throughput: 0 },
  { id: "gate-b", name: "Gate B — South", status: "open", throughput: 0 },
  { id: "gate-c", name: "Gate C — East", status: "open", throughput: 0 },
  { id: "gate-d", name: "Gate D — West", status: "open", throughput: 0 },
  { id: "gate-e", name: "Gate E — VIP", status: "open", throughput: 0 },
  { id: "gate-f", name: "Gate F — Press", status: "open", throughput: 0 },
];

let gateStates = GATES.map((g) => ({ ...g }));

function generateAlertId(): string {
  return `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addAlert(
  severity: Alert["severity"],
  title: string,
  message: string,
  aiAction: string | null = null,
): void {
  const alert: Alert = {
    id: generateAlertId(),
    severity,
    title,
    message,
    timestamp: Date.now(),
    resolved: false,
    aiAction,
  };
  alerts.unshift(alert);
  // Keep max 50 alerts
  if (alerts.length > 50) alerts = alerts.slice(0, 50);

  // Forward critical/warning alerts to Dynatrace events
  if (severity === "critical" || severity === "warning") {
    const dtSeverity = severity === "critical" ? "CUSTOM_ALERT" : "INFO";
    pushEvent(title, message, dtSeverity).catch(() => {/* silent */});
  }
}

function resolveAlerts(severity?: Alert["severity"]): void {
  alerts = alerts.map((a) =>
    !a.resolved && (!severity || a.severity === severity)
      ? { ...a, resolved: true }
      : a,
  );
}

// Compute derived state
function getBaseLatency(): number {
  if (!simulation.running) return 50 + Math.random() * 10;
  const vu = simulation.virtualUsers;
  const factor = vu / 1000;
  const bottleneck = Math.min(factor * 500, 4000);
  const perServerReduction = (state.activeServers - 1) * 0.3;
  return Math.max(40, 50 + bottleneck * (1 - perServerReduction));
}

function updateMetrics(): void {
  const now = Date.now();
  const elapsed = (now - state.lastRequestTime) / 1000;
  state.requestsPerSecond =
    elapsed > 0 ? Math.round(state.requestCount / Math.max(elapsed, 1)) : 0;

  // Derive CPU/memory from virtual users and servers
  if (simulation.running) {
    const vu = simulation.virtualUsers;
    const targetCpu = Math.min(98, 20 + (vu / 100) / state.activeServers);
    const targetMem = Math.min(95, 30 + (vu / 150) / state.activeServers);
    state.cpuUsage = state.cpuUsage * 0.7 + targetCpu * 0.3;
    state.memoryUsage = state.memoryUsage * 0.7 + targetMem * 0.3;
    state.avgLatency = getBaseLatency();
    state.errorRate =
      state.cpuUsage > 85 ? Math.min(25, (state.cpuUsage - 85) * 1.5) : 0;
  } else {
    // Gradually recover
    state.cpuUsage = Math.max(18, state.cpuUsage * 0.92 + 18 * 0.08);
    state.memoryUsage = Math.max(25, state.memoryUsage * 0.93 + 25 * 0.07);
    state.avgLatency = Math.max(45, state.avgLatency * 0.9 + 50 * 0.1);
    state.errorRate = Math.max(0, state.errorRate * 0.8);
  }

  // Check thresholds and fire alerts
  if (state.cpuUsage > 85 && !alerts.find((a) => !a.resolved && a.title.includes("CPU"))) {
    addAlert("critical", "CPU Critical", `CPU at ${state.cpuUsage.toFixed(0)}% — service degradation imminent. Scale recommended.`);
  }
  if (state.avgLatency > 1500 && !alerts.find((a) => !a.resolved && a.title.includes("Latency"))) {
    addAlert("warning", "High Latency Detected", `Avg latency at ${state.avgLatency.toFixed(0)}ms — fans experiencing delays at gates.`);
  }

  // Seed percentile window from simulated latency distribution
  if (simulation.running) {
    const base = state.avgLatency;
    recordLatency(base * (0.8 + Math.random() * 0.4));
    recordLatency(base * (1.0 + Math.random() * 0.6));
    recordLatency(base * (1.2 + Math.random() * 1.0));
  }
  mcpEventsForwarded++;
  mcpLastPing = Date.now();

  const { p95, p99 } = getLatencyPercentiles();

  // Record history
  const snapshot: MetricsSnapshot = {
    timestamp: now,
    avgLatency: Math.round(state.avgLatency),
    p95Latency: p95,
    p99Latency: p99,
    cpuUsage: Math.round(state.cpuUsage * 10) / 10,
    memoryUsage: Math.round(state.memoryUsage * 10) / 10,
    activeServers: state.activeServers,
    requestsPerSecond: state.requestsPerSecond,
    errorRate: Math.round(state.errorRate * 10) / 10,
    totalRequests: state.totalRequests,
    k6P95Pass: p95 < 2000,
    k6P99Pass: p99 < 5000,
  };
  metricsHistory.push(snapshot);
  // Keep 5 minutes of history at 2-second intervals = 150 samples
  if (metricsHistory.length > 150) metricsHistory.shift();

  // Push to Dynatrace (silent no-op when credentials not set)
  pushMetrics({
    avgLatency:        snapshot.avgLatency,
    p95Latency:        snapshot.p95Latency,
    p99Latency:        snapshot.p99Latency,
    cpuUsage:          snapshot.cpuUsage,
    memoryUsage:       snapshot.memoryUsage,
    activeServers:     snapshot.activeServers,
    requestsPerSecond: snapshot.requestsPerSecond,
    errorRate:         snapshot.errorRate,
    totalRequests:     snapshot.totalRequests,
    virtualUsers:      simulation.virtualUsers,
  }, now).catch(() => {/* silent */});
}

// Simulation stages
const STAGE_CONFIGS: Record<
  string,
  { vus: number[]; name: string; nextStage: string | null }[]
> = {
  low: [
    { vus: [0, 200], name: "Warmup", nextStage: "Gradual Increase" },
    { vus: [200, 500], name: "Gradual Increase", nextStage: "Sustained" },
    { vus: [500, 500], name: "Sustained", nextStage: null },
  ],
  medium: [
    { vus: [0, 500], name: "Warmup", nextStage: "Gradual Increase" },
    { vus: [500, 1500], name: "Gradual Increase", nextStage: "Peak" },
    { vus: [1500, 1500], name: "Peak", nextStage: null },
  ],
  high: [
    { vus: [0, 1000], name: "Warmup", nextStage: "Gradual Increase" },
    { vus: [1000, 3000], name: "Gradual Increase", nextStage: "Peak Load" },
    { vus: [3000, 4000], name: "Peak Load", nextStage: "Sustained Peak" },
    { vus: [4000, 4000], name: "Sustained Peak", nextStage: null },
  ],
  surge: [
    { vus: [0, 2000], name: "Warmup", nextStage: "Crowd Rush" },
    { vus: [2000, 5000], name: "Crowd Rush", nextStage: "Peak Surge" },
    { vus: [5000, 8000], name: "Peak Surge", nextStage: "Sustained Surge" },
    { vus: [8000, 8000], name: "Sustained Surge", nextStage: "Cooldown" },
    { vus: [8000, 0], name: "Cooldown", nextStage: null },
  ],
};

function runSimulationTick(): void {
  if (!simulation.running || !simulation.startedAt || !simulation.intensity) return;

  const elapsed = (Date.now() - simulation.startedAt) / 1000;
  const totalDuration = simulation.durationSeconds;
  const stages = STAGE_CONFIGS[simulation.intensity] ?? STAGE_CONFIGS["medium"];
  const stageDuration = totalDuration / stages.length;
  const stageIndex = Math.min(
    Math.floor(elapsed / stageDuration),
    stages.length - 1,
  );
  const stage = stages[stageIndex];
  const stageProgress = (elapsed % stageDuration) / stageDuration;

  simulation.virtualUsers = Math.round(
    stage.vus[0] + (stage.vus[1] - stage.vus[0]) * stageProgress,
  );
  simulation.stage = stage.name;
  simulation.nextStage = stage.nextStage;

  // Update gate throughput based on VUs
  gateStates = gateStates.map((gate, i) => {
    const base = simulation.virtualUsers / gateStates.length;
    const throughput = Math.round(base * (0.8 + Math.random() * 0.4));
    const status: GateStatus["status"] =
      state.cpuUsage > 85
        ? "congested"
        : state.cpuUsage > 60
          ? Math.random() > 0.7
            ? "congested"
            : "open"
          : "open";
    return { ...gate, throughput, status };
  });

  // End simulation
  if (elapsed >= totalDuration) {
    stopSimulation();
    addAlert(
      "info",
      "Simulation Complete",
      `Load test finished. Peak ${simulation.virtualUsers} virtual users handled across ${state.activeServers} servers.`,
    );
  }
}

export function startSimulation(
  intensity: "low" | "medium" | "high" | "surge",
  durationSeconds = 120,
): SimulationState {
  if (simulation.running) stopSimulation();

  simulation = {
    running: true,
    stage: "Starting",
    intensity,
    startedAt: Date.now(),
    durationSeconds,
    virtualUsers: 0,
    nextStage: null,
  };

  addAlert(
    "info",
    `Simulation Started — ${intensity.toUpperCase()}`,
    `Crowd surge simulation initiated with ${intensity} intensity. Monitoring for bottlenecks.`,
  );

  simulationInterval = setInterval(runSimulationTick, 500);
  return { ...simulation };
}

export function stopSimulation(): SimulationState {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  simulation = {
    running: false,
    stage: "idle",
    intensity: simulation.intensity,
    startedAt: null,
    durationSeconds: simulation.durationSeconds,
    virtualUsers: 0,
    nextStage: null,
  };
  gateStates = GATES.map((g) => ({ ...g }));
  return { ...simulation };
}

export function getSimulationStatus(): SimulationState {
  const elapsedSeconds = simulation.startedAt
    ? Math.round((Date.now() - simulation.startedAt) / 1000)
    : 0;
  return { ...simulation, elapsedSeconds } as SimulationState & {
    elapsedSeconds: number;
  };
}

export function getCurrentMetrics(): SystemMetrics {
  const { p95, p99 } = getLatencyPercentiles();
  return {
    avgLatency: Math.round(state.avgLatency),
    p95Latency: p95,
    p99Latency: p99,
    cpuUsage: Math.round(state.cpuUsage * 10) / 10,
    memoryUsage: Math.round(state.memoryUsage * 10) / 10,
    activeServers: state.activeServers,
    requestsPerSecond: state.requestsPerSecond,
    errorRate: Math.round(state.errorRate * 10) / 10,
    totalRequests: state.totalRequests,
    k6P95Pass: p95 < 2000,
    k6P99Pass: p99 < 5000,
  };
}

export function getMetricsHistory(): MetricsSnapshot[] {
  return [...metricsHistory];
}

export function getAlerts(): Alert[] {
  return [...alerts];
}

export function getStadiumCapacity() {
  const totalCapacity = 80000;
  const currentOccupancy = Math.min(state.totalEntered, totalCapacity);
  return {
    totalCapacity,
    currentOccupancy,
    occupancyPercent: Math.round((currentOccupancy / totalCapacity) * 1000) / 10,
    gates: gateStates,
  };
}

export function validateTicket(ticketId: string): {
  valid: boolean;
  overloaded: boolean;
} {
  state.requestCount++;
  state.totalRequests++;

  const isOverloaded = state.cpuUsage > 90 && Math.random() < 0.15;
  if (isOverloaded) {
    state.errorRate = Math.min(25, state.errorRate + 0.5);
    return { valid: false, overloaded: true };
  }

  return { valid: validTickets.has(ticketId), overloaded: false };
}

export function scanTicket(
  ticketId: string,
  gate: string,
): { success: boolean; totalEntered: number } {
  state.requestCount++;
  state.totalRequests++;
  const isValid = validTickets.has(ticketId);
  if (isValid) {
    state.totalEntered++;
    const prev = state.gateEntries.get(gate) ?? 0;
    state.gateEntries.set(gate, prev + 1);
  }
  return { success: isValid, totalEntered: state.totalEntered };
}

export function scaleServer(action: "add-server" | "remove-server"): void {
  if (action === "add-server") {
    state.activeServers++;
    addAlert(
      "info",
      "Server Scaled Up",
      `Server instance added. Now running ${state.activeServers} active servers.`,
      `Auto-scale: added server instance #${state.activeServers}`,
    );
  } else if (action === "remove-server" && state.activeServers > 1) {
    state.activeServers--;
    addAlert(
      "info",
      "Server Scaled Down",
      `Server instance removed. Now running ${state.activeServers} active servers.`,
    );
  }
}

export function resetSystem(): void {
  stopSimulation();
  state = {
    requestCount: 0,
    avgLatency: 50,
    cpuUsage: 20,
    memoryUsage: 30,
    activeServers: 1,
    errorRate: 0,
    totalRequests: 0,
    requestsPerSecond: 0,
    lastRequestTime: Date.now(),
    gateEntries: new Map(),
    totalEntered: 0,
  };
  latencyWindow.length = 0;
  mcpEventsForwarded = 0;
  alerts = [];
  metricsHistory = [];
  gateStates = GATES.map((g) => ({ ...g }));
  addAlert("info", "System Reset", "All metrics and simulation state cleared.");
}

export function getMcpStatus() {
  return {
    connected: true,
    serverUrl: "npx @dynatrace-oss/dynatrace-mcp-server@latest",
    toolsAvailable: [
      "get_metrics",
      "get_problems",
      "get_entities",
      "get_events",
      "get_synthetic_locations",
      "push_metric",
      "create_event",
    ],
    lastPing: mcpLastPing,
    eventsForwarded: mcpEventsForwarded,
    dynatraceEnvId: process.env["DYNATRACE_ENV_ID"] ?? null,
    status: process.env["DYNATRACE_ENV_ID"] ? "connected" : "simulated",
  } as const;
}

export async function aiAnalyze(): Promise<{
  analysis: string;
  actions: string[];
  confidence: number;
  serversAdded: number;
}> {
  const metrics = getCurrentMetrics();
  const defaultActions: string[] = [];
  let serversAdded = 0;
  let analysis = "";
  let confidence = 0.95;

  const modelPrompt = `You are an SRE assistant. Analyze the following JSON metrics and provide a JSON object with keys: analysis (string), actions (array of short strings), confidence (number between 0 and 1), serversAdded (integer). Metrics: ${JSON.stringify(
    metrics,
  )}\n\nKeep the response as valid JSON so it can be parsed programmatically.`;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GENERATIVE_API_KEY || process.env.GOOGLE_API_KEY;
  const apiUrl = process.env.GEMINI_API_URL ||
    "https://us-models.googleapis.com/v1/models/gemini-2.5-flash:generateText";

  async function callModel(promptText: string): Promise<string> {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

        const body = JSON.stringify({
          prompt: { text: promptText },
          temperature: 0.2,
          maxOutputTokens: 512,
        });

        const url = apiKey && !headers["Authorization"] ? `${apiUrl}?key=${apiKey}` : apiUrl;
        const resp = await fetch(url, { method: "POST", headers, body, signal: controller.signal as any });
        clearTimeout(timeout);
        if (!resp.ok) {
          const text = await resp.text().catch(() => "<no body>");
          logger.warn({ attempt, status: resp.status, body: text }, "Generative API returned non-OK");
          if ([429, 502, 503, 504].includes(resp.status) && attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          throw new Error(`Generative API error ${resp.status}: ${text}`);
        }

        const json = await resp.json().catch(() => null);
        // Try to extract the best text candidate from common shapes
        const j: any = json;
        let out = "";
        if (!j) out = "";
        else if (Array.isArray(j.candidates) && j.candidates[0]) out = j.candidates[0].content ?? JSON.stringify(j.candidates[0]);
        else if (j.candidates?.[0]?.output) out = j.candidates[0].output;
        else if (j.output?.[0]?.content) out = j.output[0].content;
        else if (typeof j.result === "string") out = j.result;
        else out = JSON.stringify(j);

        return out;
      } catch (err: any) {
        clearTimeout(timeout);
        if (err?.name === "AbortError") {
          logger.warn({ attempt }, "Generative API request timed out");
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
            continue;
          }
        }
        logger.error({ err, attempt }, "Generative API call failed");
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 400 * attempt));
        else throw err;
      }
    }
    throw new Error("Generative API failed after retries");
  }

  try {
    const raw = await callModel(modelPrompt);
    logger.info({ raw: raw?.slice(0, 800) }, "AI raw response");

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (e) {
          parsed = null;
        }
      }
    }

    if (parsed) {
      analysis = typeof parsed.analysis === "string" ? parsed.analysis : raw;
      if (Array.isArray(parsed.actions)) defaultActions.push(...parsed.actions.map(String));
      confidence = typeof parsed.confidence === "number" ? parsed.confidence : confidence;
      serversAdded = typeof parsed.serversAdded === "number" ? parsed.serversAdded : 0;
    } else {
      // Fallback: simple heuristic (previous local logic)
      logger.info({ raw }, "Falling back to local heuristic for AI analysis");
      if (metrics.cpuUsage > 85) {
        const serversNeeded = Math.ceil((metrics.cpuUsage - 70) / 15);
        serversAdded = serversNeeded;
        defaultActions.push(`Scaled up ${serversNeeded} server instance(s) — CPU pressure at ${metrics.cpuUsage.toFixed(0)}%`);
        analysis = `Detected severe CPU bottleneck (${metrics.cpuUsage.toFixed(0)}%). Latency ${metrics.avgLatency.toFixed(0)}ms. Recommended scaling by ${serversNeeded} instance(s).`;
        confidence = 0.9;
        resolveAlerts("critical");
        addAlert("info", "AI Auto-Heal Applied (fallback)", `AI recommended ${serversNeeded} servers (fallback).`);
      } else if (metrics.avgLatency > 800) {
        defaultActions.push(`Increase connection pool limits for ${metrics.requestsPerSecond} RPS`);
        analysis = `High latency (${metrics.avgLatency.toFixed(0)}ms) suggests I/O bottleneck. Recommend tuning connection pools and request queuing.`;
        confidence = 0.78;
        resolveAlerts("warning");
        addAlert("info", "AI Optimization Applied (fallback)", "Connection pooling tuned (fallback).");
      } else if (metrics.errorRate > 5) {
        defaultActions.push("Enable circuit breaker and isolate unhealthy instances");
        analysis = `Error rate ${metrics.errorRate.toFixed(1)}% — circuit breaker recommended.`;
        confidence = 0.85;
        resolveAlerts("warning");
      } else {
        defaultActions.push("System operating within normal parameters");
        analysis = `All metrics healthy. CPU ${metrics.cpuUsage.toFixed(0)}%, latency ${metrics.avgLatency.toFixed(0)}ms, error rate ${metrics.errorRate.toFixed(1)}%.`;
        confidence = 0.99;
        addAlert("info", "AI Analysis Complete", "System healthy — no intervention required.");
      }
    }
  } catch (err) {
    logger.error({ err }, "AI analysis failed entirely — using local heuristic");
    // local fallback if model call completely fails
    if (metrics.cpuUsage > 85) {
      const serversNeeded = Math.ceil((metrics.cpuUsage - 70) / 15);
      serversAdded = serversNeeded;
      defaultActions.push(`Scaled up ${serversNeeded} server instance(s) — CPU pressure at ${metrics.cpuUsage.toFixed(0)}%`);
      analysis = `Detected severe CPU bottleneck (${metrics.cpuUsage.toFixed(0)}%). Latency ${metrics.avgLatency.toFixed(0)}ms. Recommended scaling by ${serversNeeded} instance(s).`;
      confidence = 0.8;
      resolveAlerts("critical");
      addAlert("info", "AI Auto-Heal Applied (fallback)", `AI recommended ${serversNeeded} servers (fallback).`);
    } else {
      defaultActions.push("System operating within normal parameters");
      analysis = `All metrics healthy (fallback). CPU ${metrics.cpuUsage.toFixed(0)}%`;
      confidence = 0.9;
      addAlert("info", "AI Analysis Fallback", "Used local fallback analysis.");
    }
  }

  // Apply any scaling suggested
  if (serversAdded > 0) {
    for (let i = 0; i < serversAdded; i++) {
      state.activeServers++;
    }
    addAlert(
      "info",
      "AI Auto-Heal Applied",
      `AI added ${serversAdded} servers to resolve resource pressure. Expected improvement in 15-30s.`,
      `Added ${serversAdded} server(s) via AI`,
    );
  }

  const finalActions = defaultActions.length > 0 ? defaultActions : [];
  return { analysis, actions: finalActions, confidence, serversAdded };
}

// Start background metrics collection
metricsInterval = setInterval(updateMetrics, 2000);
addAlert("info", "System Online", "FIFA AI Traffic Management System initialized. Ready to handle 80,000 fans.");