import { db, pool, metricsSnapshots } from "@workspace/db";
import { pushMetrics } from "./dynatrace.js";
import type { SystemMetrics, MetricsSnapshot } from "./types.js";

// ── Real CPU measurement ───────────────────────────────────────────────────
let lastCpuSample = process.cpuUsage();
let lastCpuTime = Date.now();

function getRealCpuPercent(): number {
  const now = Date.now();
  const elapsed = now - lastCpuTime;
  if (elapsed < 500) return 0; // Will be set by caller
  const usage = process.cpuUsage(lastCpuSample);
  lastCpuSample = process.cpuUsage();
  lastCpuTime = now;
  return Math.min(100, ((usage.user + usage.system) / 1000 / elapsed) * 100);
}

// ── Real memory measurement ────────────────────────────────────────────────
function getRealMemoryPercent(): number {
  const mem = process.memoryUsage();
  const ceilingBytes = 2 * 1024 * 1024 * 1024;
  return Math.min(100, (mem.rss / ceilingBytes) * 100);
}

// ── Rolling latency window ─────────────────────────────────────────────────
const latencyWindow: number[] = [];
const LATENCY_WINDOW_SIZE = 500;

export function recordLatency(ms: number): void {
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

// ── Metrics history ─────────────────────────────────────────────────────────
let metricsHistory: MetricsSnapshot[] = [];

export function getMetricsHistory(): MetricsSnapshot[] {
  return [...metricsHistory];
}

export function clearMetricsHistory(): void {
  metricsHistory = [];
}

export function clearLatencyWindow(): void {
  latencyWindow.length = 0;
}

// ── Metrics update (runs every 2s) ─────────────────────────────────────────
export async function updateMetrics(
  state: SystemMetrics,
  simulation: { virtualUsers: number },
  mcpEventsForwarded: number,
  mcpLastPing: number,
  addAlert: (severity: "info" | "warning" | "critical", title: string, message: string, aiAction?: string | null) => void,
  alerts: any[]
): Promise<SystemMetrics> {
  const now = Date.now();
  const elapsed = (now - (state as any).lastRequestTime) / 1000;
  const requestCount = (state as any).requestCount || 0;
  (state as any).requestsPerSecond = elapsed > 0 ? Math.round(requestCount / Math.max(elapsed, 1)) : 0;

  // Use REAL CPU and memory now
  state.cpuUsage = state.cpuUsage * 0.6 + getRealCpuPercent() * 0.4;
  state.memoryUsage = state.memoryUsage * 0.6 + getRealMemoryPercent() * 0.4;

  // Pool pressure — reflect connection queue depth in avgLatency
  const poolStats = pool as any;
  const waitingClients = poolStats.waitingCount ?? 0;
  if (waitingClients > 0) {
    state.avgLatency = Math.min(5000, state.avgLatency + waitingClients * 10);
  }

  // Error rate from latency window
  const highLatencies = latencyWindow.filter((l) => l > 2000).length;
  state.errorRate = latencyWindow.length ? (highLatencies / latencyWindow.length) * 100 : 0;

  // Alerts
  if (state.cpuUsage > 85 && !alerts.find((a: any) => !a.resolved && a.title.includes("CPU"))) {
    addAlert("critical", "CPU Critical", `Real CPU at ${state.cpuUsage.toFixed(0)}% — scale recommended.`);
  }
  if (state.avgLatency > 1500 && !alerts.find((a: any) => !a.resolved && a.title.includes("Latency"))) {
    addAlert("warning", "High Latency", `Avg latency ${state.avgLatency.toFixed(0)}ms — DB pool likely saturated.`);
  }

  const { p95, p99 } = getLatencyPercentiles();

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
  if (metricsHistory.length > 150) metricsHistory.shift();

  // Persist snapshot to Postgres
  db.insert(metricsSnapshots).values({
    ts: now,
    avgLatency: snapshot.avgLatency,
    p95Latency: p95,
    p99Latency: p99,
    cpuUsage: Math.round(state.cpuUsage),
    memoryUsage: Math.round(state.memoryUsage),
    activeServers: state.activeServers,
    requestsPerSec: state.requestsPerSecond,
    errorRate: Math.round(state.errorRate),
    totalRequests: state.totalRequests,
  }).catch(() => {});

  pushMetrics(
    {
      avgLatency: snapshot.avgLatency,
      p95Latency: p95,
      p99Latency: p99,
      cpuUsage: snapshot.cpuUsage,
      memoryUsage: snapshot.memoryUsage,
      activeServers: state.activeServers,
      requestsPerSecond: state.requestsPerSecond,
      errorRate: snapshot.errorRate,
      totalRequests: state.totalRequests,
      virtualUsers: simulation.virtualUsers,
    },
    now
  ).catch(() => {});

  return state;
}

export function getCurrentMetrics(state: SystemMetrics): SystemMetrics {
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
