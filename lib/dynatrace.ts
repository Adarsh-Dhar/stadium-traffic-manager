/**
 * Dynatrace metrics ingest client
 *
 * Pushes stadium metrics to Dynatrace via:
 *   POST {DYNATRACE_CLUSTER_URL}/api/v2/metrics/ingest
 *
 * Uses the Dynatrace Metrics Ingestion Protocol (MintLine format):
 *   metric.key,dim1=val1 gauge,value timestamp_ms
 *
 * Docs: https://www.dynatrace.com/support/help/dynatrace-api/environment-api/metric-v2/metric-ingest
 */

const CLUSTER_URL = (process.env.DYNATRACE_CLUSTER_URL ?? "").replace(/\/$/, "");
const API_TOKEN   = process.env.DYNATRACE_API_TOKEN ?? "";
const ENV_ID      = process.env.DYNATRACE_ENV_ID ?? "unknown";

// Only push when credentials are present
export function isConfigured(): boolean {
  return Boolean(CLUSTER_URL && API_TOKEN);
}

export interface StadiumMetrics {
  avgLatency:        number;
  p95Latency:        number;
  p99Latency:        number;
  cpuUsage:          number;
  memoryUsage:       number;
  activeServers:     number;
  requestsPerSecond: number;
  errorRate:         number;
  totalRequests:     number;
  virtualUsers?:     number;
}

/**
 * Convert a metrics snapshot to Dynatrace MintLine format.
 * Each line: metricKey,dim=val gauge,value timestamp_ms
 */
function buildMintLines(metrics: StadiumMetrics, timestampMs: number): string {
  const dim = `env=${ENV_ID}`;
  const ts  = timestampMs;

  const lines: [string, number][] = [
    ["fifa.ticketing.latency.avg_ms",     metrics.avgLatency],
    ["fifa.ticketing.latency.p95_ms",     metrics.p95Latency],
    ["fifa.ticketing.latency.p99_ms",     metrics.p99Latency],
    ["fifa.ticketing.cpu.usage_pct",      metrics.cpuUsage],
    ["fifa.ticketing.memory.usage_pct",   metrics.memoryUsage],
    ["fifa.ticketing.servers.active",     metrics.activeServers],
    ["fifa.ticketing.requests.per_sec",   metrics.requestsPerSecond],
    ["fifa.ticketing.errors.rate_pct",    metrics.errorRate],
    ["fifa.ticketing.requests.total",     metrics.totalRequests],
  ];

  if (metrics.virtualUsers !== undefined) {
    lines.push(["fifa.ticketing.simulation.virtual_users", metrics.virtualUsers]);
  }

  return lines
    .map(([key, value]) => `${key},${dim} gauge,${value} ${ts}`)
    .join("\n");
}

/**
 * Push a metrics snapshot to Dynatrace.
 * Silently no-ops when credentials are not configured.
 * Returns true on success, false on failure (non-throwing).
 */
export async function pushMetrics(
  metrics: StadiumMetrics,
  timestampMs = Date.now(),
): Promise<boolean> {
  if (!isConfigured()) {
    return false; // no-op in local dev without credentials
  }

  const url  = `${CLUSTER_URL}/api/v2/metrics/ingest`;
  const body = buildMintLines(metrics, timestampMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Api-Token ${API_TOKEN}`,
        "Content-Type":  "text/plain; charset=utf-8",
      },
      body,
      // 8-second timeout via AbortController
      signal: AbortSignal.timeout(8000),
    });

    if (resp.status === 202) {
      return true; // Dynatrace accepted (202 = queued for processing)
    }

    // 400 means some lines were invalid — log but don't crash
    const text = await resp.text().catch(() => "");
    console.warn(`[dynatrace] Ingest returned ${resp.status}: ${text.slice(0, 200)}`);
    return false;
  } catch (err: any) {
    // Network errors, timeouts — never crash the api-server
    console.warn(`[dynatrace] Ingest failed: ${err?.message ?? err}`);
    return false;
  }
}

/**
 * Send a custom event (e.g. AI auto-scale action) to Dynatrace Events API.
 * POST /api/v2/events/ingest
 */
export async function pushEvent(
  title: string,
  description: string,
  severity: "INFO" | "CUSTOM_ALERT" | "ERROR_EVENT" = "INFO",
): Promise<boolean> {
  if (!isConfigured()) return false;

  const url  = `${CLUSTER_URL}/api/v2/events/ingest`;
  const body = JSON.stringify({
    eventType:   "CUSTOM_INFO",
    title,
    properties:  { description, source: "fifa-ai-traffic-manager" },
    severity,
    startTime:   Date.now(),
    endTime:     Date.now() + 60_000,
  });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Api-Token ${API_TOKEN}`,
        "Content-Type":  "application/json; charset=utf-8",
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