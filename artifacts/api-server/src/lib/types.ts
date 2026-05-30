// Type definitions for the FIFA ticketing system
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
