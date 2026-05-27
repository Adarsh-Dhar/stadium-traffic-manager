// In-memory simulation state for the FIFA ticketing system

export interface SystemMetrics {
  avgLatency: number;
  cpuUsage: number;
  memoryUsage: number;
  activeServers: number;
  requestsPerSecond: number;
  errorRate: number;
  totalRequests: number;
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

  // Record history
  const snapshot: MetricsSnapshot = {
    timestamp: now,
    avgLatency: Math.round(state.avgLatency),
    cpuUsage: Math.round(state.cpuUsage * 10) / 10,
    memoryUsage: Math.round(state.memoryUsage * 10) / 10,
    activeServers: state.activeServers,
    requestsPerSecond: state.requestsPerSecond,
    errorRate: Math.round(state.errorRate * 10) / 10,
    totalRequests: state.totalRequests,
  };
  metricsHistory.push(snapshot);
  // Keep 5 minutes of history at 2-second intervals = 150 samples
  if (metricsHistory.length > 150) metricsHistory.shift();
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
  return {
    avgLatency: Math.round(state.avgLatency),
    cpuUsage: Math.round(state.cpuUsage * 10) / 10,
    memoryUsage: Math.round(state.memoryUsage * 10) / 10,
    activeServers: state.activeServers,
    requestsPerSecond: state.requestsPerSecond,
    errorRate: Math.round(state.errorRate * 10) / 10,
    totalRequests: state.totalRequests,
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
  alerts = [];
  metricsHistory = [];
  gateStates = GATES.map((g) => ({ ...g }));
  addAlert("info", "System Reset", "All metrics and simulation state cleared.");
}

export function aiAnalyze(): {
  analysis: string;
  actions: string[];
  confidence: number;
  serversAdded: number;
} {
  const metrics = getCurrentMetrics();
  const actions: string[] = [];
  let serversAdded = 0;
  let analysis = "";
  let confidence = 0.95;

  if (metrics.cpuUsage > 85) {
    const serversNeeded = Math.ceil((metrics.cpuUsage - 70) / 15);
    for (let i = 0; i < serversNeeded; i++) {
      state.activeServers++;
      serversAdded++;
    }
    actions.push(
      `Scaled up ${serversNeeded} server instance(s) — CPU pressure at ${metrics.cpuUsage.toFixed(0)}%`,
    );
    analysis = `Detected severe CPU bottleneck (${metrics.cpuUsage.toFixed(0)}%). Latency spike of ${metrics.avgLatency.toFixed(0)}ms confirms queue build-up at ticket validation layer. Auto-scaled to ${state.activeServers} servers with projected 40% load reduction.`;
    resolveAlerts("critical");
    addAlert(
      "info",
      "AI Auto-Heal Applied",
      `AI added ${serversNeeded} servers to resolve CPU bottleneck. Expected recovery in 15-30s.`,
      `Added ${serversNeeded} server(s), resolved critical alerts`,
    );
  } else if (metrics.avgLatency > 800) {
    actions.push(`Increased connection pool limits to handle ${metrics.requestsPerSecond} RPS`);
    actions.push("Applied request queuing to smooth burst traffic");
    analysis = `Latency at ${metrics.avgLatency.toFixed(0)}ms with CPU at ${metrics.cpuUsage.toFixed(0)}% suggests I/O bottleneck. Optimizing connection pooling for ${metrics.requestsPerSecond} RPS throughput.`;
    confidence = 0.88;
    resolveAlerts("warning");
    addAlert(
      "info",
      "AI Optimization Applied",
      "Connection pooling tuned. Latency reduction expected within 10s.",
      "Tuned connection pool and request queuing",
    );
  } else if (metrics.errorRate > 5) {
    actions.push("Enabled circuit breaker pattern on ticket validation");
    actions.push("Routing traffic through healthy server instances");
    analysis = `Error rate at ${metrics.errorRate.toFixed(1)}% — circuit breaker pattern engaged. Unhealthy instances isolated, traffic redistributed.`;
    confidence = 0.92;
    resolveAlerts("warning");
  } else {
    actions.push("System operating within normal parameters");
    actions.push("Predictive scaling: no intervention needed");
    analysis = `All metrics healthy. CPU ${metrics.cpuUsage.toFixed(0)}%, latency ${metrics.avgLatency.toFixed(0)}ms, error rate ${metrics.errorRate.toFixed(1)}%. System can handle up to ${Math.round(simulation.virtualUsers * 1.4)} concurrent users at current scale.`;
    confidence = 0.99;
    addAlert("info", "AI Analysis Complete", "System healthy — no intervention required.");
  }

  return { analysis, actions, confidence, serversAdded };
}

// Start background metrics collection
metricsInterval = setInterval(updateMetrics, 2000);
addAlert("info", "System Online", "FIFA AI Traffic Management System initialized. Ready to handle 80,000 fans.");
