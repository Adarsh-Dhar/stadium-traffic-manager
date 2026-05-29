/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║         GEMINI RPS PREDICTION AGENT — Stadium Traffic Manager    ║
 * ║                                                                  ║
 * ║  Data sources fused:                                             ║
 * ║  1. Redis     → live tickets_scanned velocity                    ║
 * ║  2. PostgreSQL → historical game data (low/regular/playoff)      ║
 * ║  3. Open-Meteo → real-time weather (rain / temperature)          ║
 * ║  4. Transit.land → incoming train arrivals                       ║
 * ║  5. TomTom / mock → road traffic congestion                      ║
 * ║  6. Prometheus → internal RPS, latency, error-rate               ║
 * ║  7. Stadium API → current metrics snapshot                       ║
 * ║                                                                  ║
 * ║  Model: gemini-2.0-flash (via Generative Language API)           ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────
const CFG = {
  // Gemini
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
  GEMINI_MODEL:   process.env.GEMINI_MODEL   || "gemini-2.0-flash",

  // Stadium API (internal)
  API_BASE: process.env.AI_AGENT_API_BASE || `http://localhost:${process.env.PORT || 5000}/api/fifa`,

  // Redis
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",

  // PostgreSQL
  PG_URL: process.env.DATABASE_URL || process.env.PG_URL || "postgresql://postgres:postgres@localhost:5432/stadium",

  // Open-Meteo (no key needed)
  STADIUM_LAT:  parseFloat(process.env.STADIUM_LAT  || "40.8128"),   // MetLife default
  STADIUM_LON:  parseFloat(process.env.STADIUM_LON  || "-74.0742"),

  // Transit.land
  TRANSITLAND_KEY: process.env.TRANSITLAND_KEY || "",
  TRANSIT_STOP_ID: process.env.TRANSIT_STOP_ID || "s-dr5rjy-pennstation",

  // TomTom
  TOMTOM_KEY:   process.env.TOMTOM_API_KEY || "",
  ROAD_LAT:     parseFloat(process.env.ROAD_LAT || "40.8128"),
  ROAD_LON:     parseFloat(process.env.ROAD_LON || "-74.0742"),

  // Prometheus
  PROMETHEUS_URL: process.env.PROMETHEUS_URL || "http://localhost:9090",

  // Agent loop
  INTERVAL_MS:  parseInt(process.env.AGENT_CHECK_INTERVAL || "15000"),
  DRY_RUN:      (process.env.AI_AGENT_DRY_RUN || "false") === "true",
};

// ─── Utilities ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeJson(resp) {
  return resp.json().catch(() => null);
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const id    = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(id);
    return r;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

// ─── 1. Redis collector ────────────────────────────────────────────────────
/**
 * Reads `tickets_scanned` from Redis and returns velocity (scans / second
 * over the last poll window).  Falls back to null if Redis is unavailable.
 */
async function collectRedisMetrics() {
  // Lazy-import redis so the agent still boots without it installed
  try {
    const { createClient } = await import("redis");
    const client = createClient({ url: CFG.REDIS_URL });
    client.on("error", () => {}); // silence in non-interactive env
    await client.connect();

    const raw     = await client.get("tickets_scanned");
    const prev    = await client.get("tickets_scanned_prev_snapshot");
    const prevTs  = await client.get("tickets_scanned_prev_ts");

    const current   = parseInt(raw || "0");
    const prevCount = parseInt(prev || "0");
    const prevTime  = parseInt(prevTs || String(Date.now() - CFG.INTERVAL_MS));

    const deltaCount = Math.max(0, current - prevCount);
    const deltaSec   = Math.max(1, (Date.now() - prevTime) / 1000);
    const velocity   = parseFloat((deltaCount / deltaSec).toFixed(2));

    // Persist current snapshot for next diff
    await client.set("tickets_scanned_prev_snapshot", String(current));
    await client.set("tickets_scanned_prev_ts",       String(Date.now()));
    await client.disconnect();

    return { ticketsScanned: current, scanVelocityPerSec: velocity };
  } catch (e) {
    console.warn(`[redis] unavailable — ${e.message}`);
    return { ticketsScanned: null, scanVelocityPerSec: null };
  }
}

// ─── 2. PostgreSQL historical baseline ────────────────────────────────────
/**
 * Returns the historical baseline row that best matches today's game type.
 * Game type is read from env GAME_TYPE (low_stakes_game | regular_game | playoff_game).
 */
async function collectHistoricalBaseline() {
  const gameType = process.env.GAME_TYPE || "regular_game";

  // Inline mock so the agent works even without a real Postgres connection
  const MOCK_BASELINES = {
    low_stakes_game: { baseline_rps: 120,  peak_rps: 350,  severity_multiplier: 1.0, avg_fan_arrival_minutes: 45 },
    regular_game:    { baseline_rps: 280,  peak_rps: 820,  severity_multiplier: 1.4, avg_fan_arrival_minutes: 60 },
    playoff_game:    { baseline_rps: 650,  peak_rps: 2100, severity_multiplier: 2.1, avg_fan_arrival_minutes: 90 },
  };

  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: CFG.PG_URL });
    await client.connect();

    const res = await client.query(
      `SELECT game_type, baseline_rps, peak_rps, severity_multiplier, avg_fan_arrival_minutes
         FROM game_history
        WHERE game_type = $1
        LIMIT 1`,
      [gameType]
    );
    await client.end();

    if (res.rows.length) {
      return { source: "postgres", gameType, ...res.rows[0] };
    }
    return { source: "mock-fallback", gameType, ...MOCK_BASELINES[gameType] };
  } catch (e) {
    console.warn(`[postgres] unavailable — ${e.message}`);
    return { source: "mock-fallback", gameType, ...MOCK_BASELINES[gameType] };
  }
}

// ─── 3. Open-Meteo weather ─────────────────────────────────────────────────
async function collectWeather() {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${CFG.STADIUM_LAT}&longitude=${CFG.STADIUM_LON}` +
    `&current=temperature_2m,precipitation,rain,weather_code,wind_speed_10m` +
    `&forecast_days=1`;
  try {
    const resp = await fetchWithTimeout(url, {}, 8000);
    const json = await safeJson(resp);
    const c    = json?.current ?? {};
    return {
      temperatureCelsius: c.temperature_2m ?? null,
      precipitationMm:    c.precipitation  ?? 0,
      rainMm:             c.rain           ?? 0,
      weatherCode:        c.weather_code   ?? null,
      windSpeedKmh:       c.wind_speed_10m ?? null,
      isRaining:          (c.rain ?? 0) > 0.1,
    };
  } catch (e) {
    console.warn(`[weather] fetch failed — ${e.message}`);
    return { temperatureCelsius: null, precipitationMm: null, rainMm: null, isRaining: false };
  }
}

// ─── 4. Transit arrivals ────────────────────────────────────────────────────
/**
 * Queries Transit.land for the next 30 minutes of arrivals at the
 * configured stop.  Falls back to a randomised mock if no API key is set.
 */
async function collectTransit() {
  if (!CFG.TRANSITLAND_KEY) {
    // Mock: random 2–8 trains in the next 30 min
    const incoming = Math.floor(Math.random() * 7) + 2;
    return { incomingTrains30min: incoming, transitSource: "mock", crowdWave: incoming >= 5 };
  }
  try {
    const now  = new Date();
    const plus30 = new Date(now.getTime() + 30 * 60 * 1000);
    const url =
      `https://transit.land/api/v2/rest/stops/${CFG.TRANSIT_STOP_ID}/departures` +
      `?service_date=${now.toISOString().slice(0,10)}` +
      `&start_time=${now.toTimeString().slice(0,8)}` +
      `&end_time=${plus30.toTimeString().slice(0,8)}&limit=50`;

    const resp = await fetchWithTimeout(url, {
      headers: { apikey: CFG.TRANSITLAND_KEY },
    }, 8000);
    const json = await safeJson(resp);
    const arrivals = json?.departures?.length ?? 0;
    return { incomingTrains30min: arrivals, transitSource: "transit.land", crowdWave: arrivals >= 5 };
  } catch (e) {
    console.warn(`[transit] fetch failed — ${e.message}`);
    return { incomingTrains30min: null, transitSource: "error", crowdWave: false };
  }
}

// ─── 5. Traffic congestion ──────────────────────────────────────────────────
async function collectTraffic() {
  // If TomTom key present, use real API
  if (CFG.TOMTOM_KEY) {
    try {
      const url =
        `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
        `?point=${CFG.ROAD_LAT},${CFG.ROAD_LON}&key=${CFG.TOMTOM_KEY}`;
      const resp = await fetchWithTimeout(url, {}, 8000);
      const json = await safeJson(resp);
      const flow = json?.flowSegmentData;
      if (flow) {
        const ratio      = flow.currentSpeed / Math.max(1, flow.freeFlowSpeed);
        const congested  = ratio < 0.6;
        const delayIndex = parseFloat((1 - ratio).toFixed(2));
        return {
          currentSpeedKmh:  flow.currentSpeed,
          freeFlowSpeedKmh: flow.freeFlowSpeed,
          congestionRatio:  parseFloat(ratio.toFixed(2)),
          congestionDelay:  delayIndex,
          trafficJam:       congested,
          trafficSource:    "tomtom",
        };
      }
    } catch (e) {
      console.warn(`[traffic] TomTom error — ${e.message}`);
    }
  }

  // Mock fallback: jam ~ 25% of the time
  const trafficJam = Math.random() < 0.25;
  return {
    currentSpeedKmh:  trafficJam ? 18 : 65,
    freeFlowSpeedKmh: 80,
    congestionRatio:  trafficJam ? 0.22 : 0.81,
    congestionDelay:  trafficJam ? 0.78 : 0.19,
    trafficJam,
    trafficSource:    "mock",
  };
}

// ─── 6. Prometheus internal metrics ────────────────────────────────────────
async function collectPrometheus() {
  async function query(promQL) {
    try {
      const url  = `${CFG.PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(promQL)}`;
      const resp = await fetchWithTimeout(url, {}, 5000);
      const json = await safeJson(resp);
      const val  = json?.data?.result?.[0]?.value?.[1];
      return val !== undefined ? parseFloat(val) : null;
    } catch { return null; }
  }

  const [rps, p95, errRate, cpuPct] = await Promise.all([
    query("rate(http_requests_total[1m])"),
    query("histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[1m])) * 1000"),
    query("rate(http_requests_total{status=~\"5..\"}[1m]) / rate(http_requests_total[1m]) * 100"),
    query("100 - (avg by(instance)(irate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)"),
  ]);

  return {
    prometheusRps:      rps,
    prometheusP95Ms:    p95,
    prometheusErrRate:  errRate,
    prometheusCpuPct:   cpuPct,
    prometheusAvailable: rps !== null,
  };
}

// ─── 7. Stadium API snapshot ────────────────────────────────────────────────
async function collectStadiumApi() {
  try {
    const [metResp, alertResp, capResp] = await Promise.all([
      fetchWithTimeout(`${CFG.API_BASE}/metrics/current`, {}, 5000),
      fetchWithTimeout(`${CFG.API_BASE}/metrics/alerts`,  {}, 5000),
      fetchWithTimeout(`${CFG.API_BASE}/stadium/capacity`,{}, 5000),
    ]);
    const [metrics, alerts, capacity] = await Promise.all([
      safeJson(metResp), safeJson(alertResp), safeJson(capResp),
    ]);
    return { metrics, alerts, capacity };
  } catch (e) {
    console.warn(`[stadium-api] unavailable — ${e.message}`);
    return { metrics: null, alerts: null, capacity: null };
  }
}

// ─── Fuse all data sources ──────────────────────────────────────────────────
async function gatherAllContext() {
  console.log("[rps-agent] Gathering context from all data sources…");

  const [redis, historical, weather, transit, traffic, prometheus, stadium] =
    await Promise.all([
      collectRedisMetrics(),
      collectHistoricalBaseline(),
      collectWeather(),
      collectTransit(),
      collectTraffic(),
      collectPrometheus(),
      collectStadiumApi(),
    ]);

  return { redis, historical, weather, transit, traffic, prometheus, stadium };
}

// ─── Build Gemini prompt ────────────────────────────────────────────────────
function buildPrompt(ctx) {
  const now = new Date().toISOString();

  return `You are an expert Site Reliability Engineer (SRE) AI agent embedded in a FIFA World Cup stadium traffic management system.

Your job is to predict the expected RPS (Requests Per Second) the stadium API servers will receive in the NEXT 5 MINUTES and in the NEXT 30 MINUTES, and to suggest preemptive actions.

## Current Time
${now}

## 1. Ticketing Velocity (Redis)
- Total tickets scanned so far : ${ctx.redis.ticketsScanned ?? "unavailable"}
- Scan velocity right now       : ${ctx.redis.scanVelocityPerSec ?? "unavailable"} scans/sec

## 2. Historical Game Baseline (PostgreSQL)
- Game type               : ${ctx.historical.gameType}
- Historical baseline RPS : ${ctx.historical.baseline_rps}
- Historical peak RPS     : ${ctx.historical.peak_rps}
- Severity multiplier     : ${ctx.historical.severity_multiplier}
- Avg fan arrival window  : ${ctx.historical.avg_fan_arrival_minutes} min before kickoff
- Data source             : ${ctx.historical.source}

## 3. Weather (Open-Meteo)
- Temperature             : ${ctx.weather.temperatureCelsius ?? "N/A"} °C
- Rain right now          : ${ctx.weather.rainMm ?? "N/A"} mm  (is raining: ${ctx.weather.isRaining})
- Wind speed              : ${ctx.weather.windSpeedKmh ?? "N/A"} km/h
- Weather code            : ${ctx.weather.weatherCode ?? "N/A"}

## 4. Transit Arrivals (Transit.land / mock)
- Trains arriving next 30 min : ${ctx.transit.incomingTrains30min ?? "unavailable"}
- Crowd wave expected         : ${ctx.transit.crowdWave}
- Source                      : ${ctx.transit.transitSource}

## 5. Road Traffic (TomTom / mock)
- Current speed : ${ctx.traffic.currentSpeedKmh} km/h (free-flow: ${ctx.traffic.freeFlowSpeedKmh} km/h)
- Congestion    : ${(ctx.traffic.congestionRatio * 100).toFixed(0)}% of free-flow
- Traffic jam   : ${ctx.traffic.trafficJam}
- Source        : ${ctx.traffic.trafficSource}

## 6. Internal System Metrics (Prometheus)
- Live RPS (Prometheus)   : ${ctx.prometheus.prometheusRps ?? "unavailable"}
- p95 latency             : ${ctx.prometheus.prometheusP95Ms?.toFixed(0) ?? "N/A"} ms
- Error rate              : ${ctx.prometheus.prometheusErrRate?.toFixed(2) ?? "N/A"} %
- CPU usage               : ${ctx.prometheus.prometheusCpuPct?.toFixed(1) ?? "N/A"} %
- Prometheus available    : ${ctx.prometheus.prometheusAvailable}

## 7. Stadium API Snapshot
${JSON.stringify(ctx.stadium.metrics ?? {}, null, 2)}

## Active Alerts
${JSON.stringify((ctx.stadium.alerts ?? []).slice(0, 5), null, 2)}

## Stadium Capacity
${JSON.stringify(ctx.stadium.capacity ?? {}, null, 2)}

---

## YOUR TASK
Reason step-by-step through how each data source influences RPS, then return a JSON object (and ONLY the JSON object — no markdown fences, no preamble) with this exact shape:

{
  "reasoning": "string — 3-5 sentence explanation of your prediction logic",
  "predictedRps5min": number,
  "predictedRps30min": number,
  "confidence": number between 0 and 1,
  "riskLevel": "low" | "medium" | "high" | "critical",
  "dominantFactors": ["string", ...],
  "recommendedActions": ["string", ...],
  "shouldScaleNow": boolean,
  "serversToAdd": integer (0 if no scaling needed),
  "alertMessage": "string — one-line human summary"
}`;
}

// ─── Call Gemini API ────────────────────────────────────────────────────────
async function callGemini(promptText) {
  if (!CFG.GEMINI_API_KEY) {
    console.warn("[gemini] No API key set — returning mock prediction");
    return null;
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${CFG.GEMINI_MODEL}:generateContent` +
    `?key=${CFG.GEMINI_API_KEY}`;

  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    generationConfig: {
      temperature:     0.15,
      maxOutputTokens: 1024,
      topP:            0.9,
    },
  });

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body,
      }, 20000);

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "<no body>");
        console.warn(`[gemini] HTTP ${resp.status}: ${txt.slice(0, 300)}`);
        if ([429, 503, 504].includes(resp.status) && attempt < maxAttempts) {
          await sleep(1000 * attempt);
          continue;
        }
        throw new Error(`Gemini HTTP ${resp.status}`);
      }

      const json = await safeJson(resp);
      // Navigate Gemini response structure
      const text =
        json?.candidates?.[0]?.content?.parts?.[0]?.text ||
        json?.candidates?.[0]?.output ||
        JSON.stringify(json);

      return text;
    } catch (e) {
      console.error(`[gemini] attempt ${attempt} failed: ${e.message}`);
      if (attempt < maxAttempts) await sleep(800 * attempt);
      else throw e;
    }
  }
}

// ─── Parse Gemini output ───────────────────────────────────────────────────
function parseGeminiOutput(raw) {
  if (!raw) return null;
  // Strip markdown fences if model wrapped anyway
  const cleaned = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    console.warn("[gemini] Could not parse JSON from response:", raw.slice(0, 400));
    return null;
  }
}

// ─── Execute recommended actions ───────────────────────────────────────────
async function executeActions(prediction) {
  if (CFG.DRY_RUN) {
    console.log("[rps-agent] DRY RUN — would execute:", prediction.recommendedActions);
    return;
  }

  // Scale up servers if Gemini says so
  if (prediction.shouldScaleNow && prediction.serversToAdd > 0) {
    for (let i = 0; i < Math.min(prediction.serversToAdd, 5); i++) {
      try {
        await fetchWithTimeout(`${CFG.API_BASE}/admin/scale`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ action: "add-server" }),
        }, 5000);
        console.log(`[rps-agent] Scaled up server instance ${i + 1}`);
      } catch (e) {
        console.error(`[rps-agent] Scale action failed: ${e.message}`);
      }
    }
  }

  // Trigger AI analyze on the server side too
  if (prediction.riskLevel === "critical" || prediction.riskLevel === "high") {
    try {
      await fetchWithTimeout(`${CFG.API_BASE}/admin/ai-analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }, 8000);
      console.log("[rps-agent] Triggered server-side AI analysis");
    } catch (e) {
      console.warn(`[rps-agent] ai-analyze trigger failed: ${e.message}`);
    }
  }
}

// ─── Pretty print prediction ────────────────────────────────────────────────
function printPrediction(ctx, prediction) {
  const ts = new Date().toLocaleTimeString();
  const line = "─".repeat(65);

  console.log(`\n${line}`);
  console.log(`  🔮 RPS PREDICTION  ${ts}`);
  console.log(line);

  if (!prediction) {
    console.log("  ⚠️  No prediction (Gemini unavailable — check GEMINI_API_KEY)");
    // Still print the raw context summary so dev knows data is flowing
    console.log(`  Scan velocity : ${ctx.redis.scanVelocityPerSec ?? "N/A"} scans/s`);
    console.log(`  Game type     : ${ctx.historical.gameType}  (hist. peak: ${ctx.historical.peak_rps} RPS)`);
    console.log(`  Weather       : ${ctx.weather.isRaining ? "🌧  RAINING" : "☀️  clear"}`);
    console.log(`  Traffic jam   : ${ctx.traffic.trafficJam ? "🚗 YES" : "✅ no"}`);
    console.log(`  Trains/30min  : ${ctx.transit.incomingTrains30min ?? "N/A"}`);
    console.log(line + "\n");
    return;
  }

  const riskEmoji = { low: "🟢", medium: "🟡", high: "🟠", critical: "🔴" };

  console.log(`  ${riskEmoji[prediction.riskLevel] || "⚪"}  Risk : ${prediction.riskLevel?.toUpperCase()}`);
  console.log(`  📈  RPS in 5 min  : ${prediction.predictedRps5min}`);
  console.log(`  📈  RPS in 30 min : ${prediction.predictedRps30min}`);
  console.log(`  🎯  Confidence    : ${(prediction.confidence * 100).toFixed(0)}%`);
  console.log(`  ⚡  Scale now     : ${prediction.shouldScaleNow ? `YES — add ${prediction.serversToAdd} server(s)` : "no"}`);
  console.log(`\n  💬 ${prediction.alertMessage}`);
  console.log(`\n  Reasoning: ${prediction.reasoning}`);

  if (prediction.dominantFactors?.length) {
    console.log(`\n  Key factors:`);
    prediction.dominantFactors.forEach(f => console.log(`    • ${f}`));
  }
  if (prediction.recommendedActions?.length) {
    console.log(`\n  Recommended actions:`);
    prediction.recommendedActions.forEach(a => console.log(`    → ${a}`));
  }
  console.log(line + "\n");
}

// ─── Persist prediction to Redis (optional) ─────────────────────────────────
async function persistPrediction(prediction) {
  if (!prediction) return;
  try {
    const { createClient } = await import("redis");
    const client = createClient({ url: CFG.REDIS_URL });
    client.on("error", () => {});
    await client.connect();
    await client.set("rps_prediction_latest", JSON.stringify({
      ...prediction,
      generatedAt: Date.now(),
    }), { EX: 120 }); // TTL 2 min
    await client.disconnect();
  } catch { /* Redis optional */ }
}

// ─── Main loop ──────────────────────────────────────────────────────────────
async function runOnce() {
  const ctx        = await gatherAllContext();
  const prompt     = buildPrompt(ctx);
  const raw        = await callGemini(prompt).catch(e => {
    console.error(`[gemini] fatal: ${e.message}`);
    return null;
  });
  const prediction = parseGeminiOutput(raw);

  printPrediction(ctx, prediction);

  if (prediction) {
    await Promise.all([
      executeActions(prediction),
      persistPrediction(prediction),
    ]);
  }

  return { ctx, prediction };
}

async function mainLoop() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║       GEMINI RPS PREDICTION AGENT  —  Starting up       ║
╠══════════════════════════════════════════════════════════╣
║  Model    : ${CFG.GEMINI_MODEL.padEnd(43)}║
║  Interval : ${String(CFG.INTERVAL_MS + " ms").padEnd(43)}║
║  Dry run  : ${String(CFG.DRY_RUN).padEnd(43)}║
║  API base : ${CFG.API_BASE.slice(0, 43).padEnd(43)}║
╚══════════════════════════════════════════════════════════╝
`);

  while (true) {
    try {
      await runOnce();
    } catch (err) {
      console.error(`[rps-agent] Unhandled error: ${err.message}`);
    }
    await sleep(CFG.INTERVAL_MS);
  }
}

// Allow importing runOnce in tests without starting the loop
if (process.env.NODE_ENV !== "test") {
  mainLoop().catch(err => {
    console.error("Agent crashed:", err);
    process.exit(1);
  });
}

export { runOnce, gatherAllContext, buildPrompt, parseGeminiOutput };
