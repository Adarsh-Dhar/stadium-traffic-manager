import type { GateStatus, SimulationState } from "./types.js";

// ── Gate definitions ───────────────────────────────────────────────────────
const GATES: GateStatus[] = [
  { id: "gate-a", name: "Gate A — North",  status: "open", throughput: 0 },
  { id: "gate-b", name: "Gate B — South",  status: "open", throughput: 0 },
  { id: "gate-c", name: "Gate C — East",   status: "open", throughput: 0 },
  { id: "gate-d", name: "Gate D — West",   status: "open", throughput: 0 },
  { id: "gate-e", name: "Gate E — VIP",    status: "open", throughput: 0 },
  { id: "gate-f", name: "Gate F — Press",  status: "open", throughput: 0 },
];

export let gateStates = GATES.map((g) => ({ ...g }));

export function resetGateStates(): void {
  gateStates = GATES.map((g) => ({ ...g }));
}

// ── Simulation stage configs ────────────────────────────────────────────────
const STAGE_CONFIGS: Record<string, { vus: number[]; name: string; nextStage: string | null }[]> = {
  low: [
    { vus: [0,   200],  name: "Warmup",           nextStage: "Gradual Increase" },
    { vus: [200, 500],  name: "Gradual Increase",  nextStage: "Sustained" },
    { vus: [500, 500],  name: "Sustained",         nextStage: null },
  ],
  medium: [
    { vus: [0,    500],  name: "Warmup",           nextStage: "Gradual Increase" },
    { vus: [500,  1500], name: "Gradual Increase",  nextStage: "Peak" },
    { vus: [1500, 1500], name: "Peak",              nextStage: null },
  ],
  high: [
    { vus: [0,    1000], name: "Warmup",           nextStage: "Gradual Increase" },
    { vus: [1000, 3000], name: "Gradual Increase",  nextStage: "Peak Load" },
    { vus: [3000, 4000], name: "Peak Load",         nextStage: "Sustained Peak" },
    { vus: [4000, 4000], name: "Sustained Peak",    nextStage: null },
  ],
  surge: [
    { vus: [0,    2000], name: "Warmup",           nextStage: "Crowd Rush" },
    { vus: [2000, 5000], name: "Crowd Rush",        nextStage: "Peak Surge" },
    { vus: [5000, 8000], name: "Peak Surge",        nextStage: "Sustained Surge" },
    { vus: [8000, 8000], name: "Sustained Surge",   nextStage: "Cooldown" },
    { vus: [8000, 0],    name: "Cooldown",          nextStage: null },
  ],
};

// ── Simulation state ───────────────────────────────────────────────────────
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

// ── Simulation tick function ───────────────────────────────────────────────
function runSimulationTick(
  state: { cpuUsage: number },
  addAlert: (severity: "info" | "warning" | "critical", title: string, message: string, aiAction?: string | null) => void
): void {
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

// ── Public API ─────────────────────────────────────────────────────────────
export function startSimulation(
  intensity: "low" | "medium" | "high" | "surge",
  durationSeconds = 120,
  state: { cpuUsage: number },
  addAlert: (severity: "info" | "warning" | "critical", title: string, message: string, aiAction?: string | null) => void
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
  addAlert("info", `Simulation Started — ${intensity.toUpperCase()}`, `Crowd surge simulation initiated.`);
  simulationInterval = setInterval(() => runSimulationTick(state, addAlert), 500);
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
  const elapsedSeconds = simulation.startedAt ? Math.round((Date.now() - simulation.startedAt) / 1000) : 0;
  return { ...simulation, elapsedSeconds } as any;
}
