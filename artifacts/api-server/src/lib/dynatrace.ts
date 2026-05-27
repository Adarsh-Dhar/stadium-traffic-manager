/**
 * Dynatrace metrics ingest client (local copy for api-server project)
 *
 * Pushes stadium metrics to Dynatrace via:
 *   POST {DYNATRACE_CLUSTER_URL}/api/v2/metrics/ingest
 */

const CLUSTER_URL = (process.env.DYNATRACE_CLUSTER_URL ?? "").replace(/\/$/, "");
const API_TOKEN = process.env.DYNATRACE_API_TOKEN ?? "";
const ENV_ID = process.env.DYNATRACE_ENV_ID ?? "unknown";

export function isConfigured(): boolean {
  return Boolean(CLUSTER_URL && API_TOKEN);
}

export interface StadiumMetrics {
  avgLatency: number;
  p95Latency: number;
  p99Latency: number;
  cpuUsage: number;
  memoryUsage: number;
  activeServers: number;
  requestsPerSecond: number;
  errorRate: number;
  totalRequests: number;
  virtualUsers?: number;
}

function buildMintLines(metrics: StadiumMetrics, timestampMs: number): string {
  const dim = `env=${ENV_ID}`;
  const ts = timestampMs;

  const lines: [string, number][] = [
    ["fifa.ticketing.latency.avg_ms", metrics.avgLatency],
    ["fifa.ticketing.latency.p95_ms", metrics.p95Latency],
    ["fifa.ticketing.latency.p99_ms", metrics.p99Latency],
    ["fifa.ticketing.cpu.usage_pct", metrics.cpuUsage],
    ["fifa.ticketing.memory.usage_pct", metrics.memoryUsage],
    ["fifa.ticketing.servers.active", metrics.activeServers],
    ["fifa.ticketing.requests.per_sec", metrics.requestsPerSecond],
    ["fifa.ticketing.errors.rate_pct", metrics.errorRate],
    ["fifa.ticketing.requests.total", metrics.totalRequests],
  ];

  if (metrics.virtualUsers !== undefined) {
    lines.push(["fifa.ticketing.simulation.virtual_users", metrics.virtualUsers]);
  }

  return lines.map(([key, value]) => `${key},${dim} gauge,${value} ${ts}`).join("\n");
}

export async function pushMetrics(metrics: StadiumMetrics, timestampMs = Date.now()): Promise<boolean> {
  if (!isConfigured()) return false;

  const url = `${CLUSTER_URL}/api/v2/metrics/ingest`;
  const body = buildMintLines(metrics, timestampMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Api-Token ${API_TOKEN}`,
        "Content-Type": "text/plain; charset=utf-8",
      },
      body,
      signal: AbortSignal.timeout(8000),
    });

    if (resp.status === 202) return true;

    const text = await resp.text().catch(() => "");
    console.warn(`[dynatrace] Ingest returned ${resp.status}: ${text.slice(0, 200)}`);
    return false;
  } catch (err: any) {
    console.warn(`[dynatrace] Ingest failed: ${err?.message ?? err}`);
    return false;
  }
}

export async function pushEvent(
  title: string,
  description: string,
  severity: "INFO" | "CUSTOM_ALERT" | "ERROR_EVENT" = "INFO",
): Promise<boolean> {
  if (!isConfigured()) return false;

  const url = `${CLUSTER_URL}/api/v2/events/ingest`;
  const body = JSON.stringify({
    eventType: "CUSTOM_INFO",
    title,
    properties: { description, source: "fifa-ai-traffic-manager" },
    severity,
    startTime: Date.now(),
    endTime: Date.now() + 60_000,
  });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Api-Token ${API_TOKEN}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body,
      signal: AbortSignal.timeout(8000),
    });

    return resp.status === 201 || resp.status === 200;
  } catch (err: any) {
    console.warn(`[dynatrace] Event ingest failed: ${err?.message ?? err}`);
    return false;
  }
}
