/**
 * stadium-traffic-manager — RPS Prediction Agent
 *
 * Data sources collected every cycle:
 *   [1] Redis          — live tickets_scanned counter (ticketing velocity)
 *   [2] PostgreSQL     — historical baseline + severity_multiplier for this game type
 *   [3] Open-Meteo     — live weather (rain, temperature, wind) — no API key needed
 *   [4] Transit.land   — upcoming trains to the stadium (or mock if key absent)
 *   [5] TomTom         — road congestion (or mock if key absent)
 *   [6] Prometheus     — live rate(http_requests_total[1m]) from the cluster
 *   [7] API Server     — current system metrics + active alerts
 *   [8] Dynatrace      — problems + events (optional)
 *
 * The agent sends all of this to Gemini Flash and asks it to predict
 * the RPS for the NEXT interval, then optionally acts on the recommendation.
 */

import dotenv from "dotenv";
import fetch from "node-fetch";
import dynatrace from "./dynatrace-client.js";
import actions from "./actions.js";

dotenv.config();

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE     = process.env.AI_AGENT_API_BASE    || `http://localhost:${process.env.PORT || 5000}/api/fifa`;
const INTERVAL     = Number(process.env.AGENT_CHECK_INTERVAL || 15_000);
const DRY_RUN      = (process.env.AI_AGENT_DRY_RUN   || "false") === "true";

// Gemini — uses the current stable generateContent endpoint
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GENERATIVE_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL   = process.env.GEMINI_MODEL   || "gemini-2.0-flash";
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// External APIs
const STADIUM_LAT      = process.env.STADIUM_LAT      || "40.8128";
const STADIUM_LON      = process.env.STADIUM_LON      || "-74.0742";
const TRANSITLAND_KEY  = process.env.TRANSITLAND_KEY  || "";
const TRANSIT_STOP_ID  = process.env.TRANSIT_STOP_ID  || "s-dr5rjy-pennstation";
const TOMTOM_KEY       = process.env.TOMTOM_API_KEY   || "";
const ROAD_LAT         = process.env.ROAD_LAT         || STADIUM_LAT;
const ROAD_LON         = process.env.ROAD_LON         || STADIUM_LON;
const REDIS_URL        = process.env.REDIS_URL        || "redis://localhost:6379";
const DATABASE_URL     = process.env.DATABASE_URL     || "";
const PROMETHEUS_URL   = process.env.PROMETHEUS_URL   || "http://localhost:9090";
const GAME_TYPE        = process.env.GAME_TYPE        || "regular_game";

// ── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function safeFetch(label, fn) {
  try {
    const value = await fn();
    return { ok: true, label, value };
  } catch (err) {
    return { ok: false, label, error: String(err) };
  }
}

// ── [1] Redis — ticketing velocity ──────────────────────────────────────────
// Uses raw Redis resp3 protocol over TCP; no npm redis client needed.
async function fetchRedisTickets() {
  // Parse redis://[user:pass@]host:port/db
  const url = new URL(REDIS_URL);
  const host = url.hostname || "localhost";
  const port = parseInt(url.port) || 6379;

  return new Promise(async (resolve, reject) => {
    const net = await import("net").then(m => m.default || m);
    const client = new net.Socket();
    let buf = "";
    const timeout = setTimeout(() => { client.destroy(); reject(new Error("Redis timeout")); }, 3000);

    client.connect(port, host, () => {
      client.write("*2\r\n$3\r\nGET\r\n$15\r\ntickets_scanned\r\n");
    });
    client.on("data", d => {
      buf += d.toString();
      if (buf.includes("\r\n")) {
        clearTimeout(timeout);
        client.destroy();
        // Redis bulk string: $digits\r\nvalue\r\n  or  :integer\r\n  or $-1\r\n (null)
        const line = buf.split("\r\n")[0];
        if (line.startsWith(":")) resolve(parseInt(line.slice(1)));
        else if (line.startsWith("$") && !line.startsWith("$-")) {
          const val = buf.split("\r\n")[1];
          resolve(val ? parseInt(val) : 0);
        } else resolve(0);
      }
    });
    client.on("error", err => { clearTimeout(timeout); reject(err); });
  });
}

// ── [2] PostgreSQL — historical baseline ─────────────────────────────────────
// Uses a minimal TCP Postgres wire protocol query — no pg npm required.
// Fallback: returns hardcoded defaults for the three game types.
const HISTORY_FALLBACK = {
  low_stakes_game: { peak_rps: 120,  severity_multiplier: 0.7,  avg_arrival_rate: 800  },
  regular_game:    { peak_rps: 340,  severity_multiplier: 1.0,  avg_arrival_rate: 1800 },
  playoff_game:    { peak_rps: 780,  severity_multiplier: 1.6,  avg_arrival_rate: 3200 },
};

async function fetchHistoricalBaseline() {
  if (!DATABASE_URL) {
    console.log("[data] PostgreSQL URL not set — using hardcoded fallback baseline");
    return HISTORY_FALLBACK[GAME_TYPE] || HISTORY_FALLBACK.regular_game;
  }
  try {
    // Dynamic import so the agent doesn't crash if pg is absent
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    const res = await client.query(
      "SELECT peak_rps, severity_multiplier, avg_arrival_rate FROM game_history WHERE game_type = $1 LIMIT 1",
      [GAME_TYPE]
    );
    await client.end();
    if (res.rows.length > 0) return res.rows[0];
    return HISTORY_FALLBACK[GAME_TYPE] || HISTORY_FALLBACK.regular_game;
  } catch (err) {
    console.warn(`[data] PostgreSQL unavailable (${err.message}) — using fallback baseline`);
    return HISTORY_FALLBACK[GAME_TYPE] || HISTORY_FALLBACK.regular_game;
  }
}

// ── [3] Open-Meteo — weather ─────────────────────────────────────────────────
async function fetchWeather() {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${STADIUM_LAT}&longitude=${STADIUM_LON}` +
    `&current=temperature_2m,precipitation,rain,wind_speed_10m,weather_code` +
    `&wind_speed_unit=mph&timezone=auto`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const j = await r.json();
  const c = j.current || {};
  return {
    temperature_c: c.temperature_2m,
    precipitation_mm: c.precipitation,
    rain_mm: c.rain,
    wind_mph: c.wind_speed_10m,
    weather_code: c.weather_code,
    is_raining: (c.rain || 0) > 0.1 || (c.precipitation || 0) > 0.1,
  };
}

// ── [4] Transit — upcoming trains ────────────────────────────────────────────
async function fetchTransit() {
  if (!TRANSITLAND_KEY) {
    // Deterministic mock: simulate 1-3 trains arriving in next 10 minutes
    const count = 1 + Math.floor(Math.random() * 3);
    return {
      source: "mock",
      trains_arriving_soon: count,
      estimated_passengers: count * 400 + Math.floor(Math.random() * 200),
    };
  }
  const url = `https://transit.land/api/v2/rest/stops/${TRANSIT_STOP_ID}/departures?apikey=${TRANSITLAND_KEY}&per_page=10`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Transit.land ${r.status}`);
  const j = await r.json();
  const departures = j.stops?.[0]?.departures || [];
  const nowSec = Date.now() / 1000;
  const soon = departures.filter(d => {
    const t = d.departure?.scheduled_utc;
    if (!t) return false;
    const diff = (new Date(t).getTime() / 1000) - nowSec;
    return diff >= 0 && diff <= 600; // within 10 minutes
  });
  return {
    source: "transit.land",
    trains_arriving_soon: soon.length,
    estimated_passengers: soon.length * 380,
  };
}

// ── [5] TomTom — road congestion ─────────────────────────────────────────────
async function fetchTraffic() {
  if (!TOMTOM_KEY) {
    // Randomized mock — occasionally injects a jam
    const jam = Math.random() < 0.25;
    return {
      source: "mock",
      traffic_jam_detected: jam,
      congestion_level: jam ? (0.6 + Math.random() * 0.4).toFixed(2) : (Math.random() * 0.3).toFixed(2),
    };
  }
  const url =
    `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` +
    `?key=${TOMTOM_KEY}&point=${ROAD_LAT},${ROAD_LON}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`TomTom ${r.status}`);
  const j = await r.json();
  const fsd = j.flowSegmentData || {};
  const ratio = fsd.currentSpeed && fsd.freeFlowSpeed
    ? fsd.currentSpeed / fsd.freeFlowSpeed : 1;
  return {
    source: "tomtom",
    traffic_jam_detected: ratio < 0.4,
    congestion_level: (1 - ratio).toFixed(2),
    current_speed_kmh: fsd.currentSpeed,
    free_flow_speed_kmh: fsd.freeFlowSpeed,
  };
}

// ── [6] Prometheus — live RPS from cluster ───────────────────────────────────
async function fetchPrometheusRPS() {
  const query = encodeURIComponent('rate(http_requests_total[1m])');
  const url = `${PROMETHEUS_URL}/api/v1/query?query=${query}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`Prometheus ${r.status}`);
  const j = await r.json();
  const results = j.data?.result || [];
  if (!results.length) return { rps: 0, series: 0 };
  const total = results.reduce((sum, s) => sum + parseFloat(s.value?.[1] || 0), 0);
  return { rps: parseFloat(total.toFixed(2)), series: results.length };
}

// ── [7] API Server — system metrics + alerts ─────────────────────────────────
async function fetchApiMetrics() {
  const [mRes, aRes] = await Promise.all([
    fetch(`${API_BASE}/metrics/current`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
    fetch(`${API_BASE}/metrics/alerts`,  { signal: AbortSignal.timeout(5000) }).then(r => r.json()),
  ]);
  return { metrics: mRes, alerts: aRes };
}

// ── Gather all context ────────────────────────────────────────────────────────
async function gatherAllContext() {
  const [
    redisResult,
    baselineResult,
    weatherResult,
    transitResult,
    trafficResult,
    prometheusResult,
    apiResult,
    dtProblems,
    dtEvents,
  ] = await Promise.all([
    safeFetch("Redis tickets_scanned",   fetchRedisTickets),
    safeFetch("PostgreSQL baseline",     fetchHistoricalBaseline),
    safeFetch("Open-Meteo weather",      fetchWeather),
    safeFetch("Transit trains",          fetchTransit),
    safeFetch("Traffic congestion",      fetchTraffic),
    safeFetch("Prometheus RPS",          fetchPrometheusRPS),
    safeFetch("API server metrics",      fetchApiMetrics),
    safeFetch("Dynatrace problems",      () => dynatrace.fetchProblems()),
    safeFetch("Dynatrace events",        () => dynatrace.fetchEvents()),
  ]);

  // ── Verification table ────────────────────────────────────────────────────
  const sources = [
    redisResult, baselineResult, weatherResult, transitResult,
    trafficResult, prometheusResult, apiResult, dtProblems, dtEvents,
  ];
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║          DATA SOURCE HEALTH CHECK                   ║");
  console.log("╠══════════════════════════════════════════════════════╣");
  for (const s of sources) {
    const status = s.ok ? "✅ OK  " : "⚠️  FAIL";
    const detail = s.ok
      ? JSON.stringify(s.value).slice(0, 60)
      : s.error?.slice(0, 60);
    console.log(`║ ${status}  ${s.label.padEnd(28)} ${detail}`);
  }
  console.log("╚══════════════════════════════════════════════════════╝\n");

  return {
    ticketsScanned:  redisResult.ok    ? redisResult.value    : null,
    baseline:        baselineResult.ok ? baselineResult.value : HISTORY_FALLBACK[GAME_TYPE],
    weather:         weatherResult.ok  ? weatherResult.value  : null,
    transit:         transitResult.ok  ? transitResult.value  : null,
    traffic:         trafficResult.ok  ? trafficResult.value  : null,
    prometheus:      prometheusResult.ok ? prometheusResult.value : null,
    apiMetrics:      apiResult.ok      ? apiResult.value.metrics : null,
    apiAlerts:       apiResult.ok      ? apiResult.value.alerts  : [],
    dtProblems:      dtProblems.ok     ? dtProblems.value     : null,
    dtEvents:        dtEvents.ok       ? dtEvents.value       : null,
  };
}

// ── Build the Gemini prompt ───────────────────────────────────────────────────
function buildPrompt(ctx) {
  const now = new Date().toISOString();
  const openAlerts = Array.isArray(ctx.apiAlerts)
    ? ctx.apiAlerts.filter(a => !a.resolved).slice(0, 5)
    : [];

  return `You are an expert Site Reliability Engineer and traffic forecasting agent for a FIFA World Cup 2026 stadium operations platform.

Your job is to analyse ALL of the following real-time data sources and predict the HTTP Requests-Per-Second (RPS) that the API server will receive during the NEXT ${Math.round(INTERVAL / 1000)}-second interval. Then recommend any infrastructure actions needed.

=== TIMESTAMP ===
${now}

=== [1] TICKETING VELOCITY (Redis) ===
tickets_scanned so far: ${ctx.ticketsScanned ?? "unavailable"}
(Each scan = one fan entering a gate; spikes here precede RPS spikes by 2-5 minutes)

=== [2] HISTORICAL BASELINE (PostgreSQL) — game_type: ${GAME_TYPE} ===
${JSON.stringify(ctx.baseline, null, 2)}
(peak_rps = historical peak for this event class; severity_multiplier scales the expected curve)

=== [3] WEATHER (Open-Meteo — live) ===
${ctx.weather ? JSON.stringify(ctx.weather, null, 2) : "unavailable"}
(Rain sharply increases app usage as fans check gates/maps indoors)

=== [4] TRANSIT (upcoming trains to stadium) ===
${ctx.transit ? JSON.stringify(ctx.transit, null, 2) : "unavailable"}
(Each arriving train delivers ~300-500 fans; RPS spike follows ~8 minutes later)

=== [5] ROAD CONGESTION (TomTom / mock) ===
${ctx.traffic ? JSON.stringify(ctx.traffic, null, 2) : "unavailable"}
(Traffic jam = delayed fan arrival = flat RPS now, then steep spike when jam clears)

=== [6] PROMETHEUS — LIVE CLUSTER RPS ===
${ctx.prometheus ? JSON.stringify(ctx.prometheus, null, 2) : "unavailable"}
(rate(http_requests_total[1m]) — the current observed RPS in the cluster)

=== [7] API SERVER — CURRENT SYSTEM METRICS ===
${ctx.apiMetrics ? JSON.stringify(ctx.apiMetrics, null, 2) : "unavailable"}

=== [7b] OPEN ALERTS (unresolved) ===
${openAlerts.length ? JSON.stringify(openAlerts, null, 2) : "none"}

=== [8] DYNATRACE ===
Problems: ${ctx.dtProblems?.json ? JSON.stringify(ctx.dtProblems.json).slice(0, 400) : "unavailable or no problems"}
Events:   ${ctx.dtEvents?.json  ? JSON.stringify(ctx.dtEvents.json).slice(0, 400)  : "unavailable"}

=== YOUR TASK ===
Using ALL of the above signals together, respond ONLY with a valid JSON object (no markdown, no prose) matching this exact shape:

{
  "predicted_rps": <number — your best estimate of RPS for the next interval>,
  "confidence": <number 0.0-1.0>,
  "trend": "rising" | "stable" | "falling",
  "reasoning": "<1-3 sentence explanation citing specific data points>",
  "dominant_signals": ["<signal1>", "<signal2>"],
  "actions": ["<action_string>"],
  "serversAdded": <integer — how many extra servers to spin up (0 if none needed)>,
  "analysis": "<brief SRE summary>"
}

Valid action strings: "add-server", "remove-server", "clear-cache", "restart-service", "ai-analyze"
Only recommend "add-server" if predicted_rps > ${ctx.baseline?.peak_rps ? Math.round(ctx.baseline.peak_rps * 0.75) : 250} or CPU > 80%.
Only recommend "remove-server" if predicted_rps < ${ctx.baseline?.peak_rps ? Math.round(ctx.baseline.peak_rps * 0.2) : 70} AND active servers > 1.`;
}

// ── Call Gemini ───────────────────────────────────────────────────────────────
async function callGemini(promptText) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set in .env");

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 20_000);
    try {
      const body = {
        contents: [{ role: "user", parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 1024 },
      };
      const resp = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "<no body>");
        console.warn(`[gemini] HTTP ${resp.status}: ${txt.slice(0, 200)}`);
        if ([429, 502, 503, 504].includes(resp.status) && attempt < 3) {
          await sleep(600 * attempt); continue;
        }
        throw new Error(`Gemini ${resp.status}`);
      }
      const json = await resp.json();
      // Extract text from generateContent response shape
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return text;
    } catch (err) {
      clearTimeout(tid);
      if (err?.name === "AbortError") {
        console.warn(`[gemini] Timeout attempt ${attempt}`);
        if (attempt < 3) { await sleep(500 * attempt); continue; }
      }
      if (attempt < 3) { await sleep(500 * attempt); continue; }
      throw err;
    }
  }
  throw new Error("Gemini failed after 3 attempts");
}

// ── Parse model output ────────────────────────────────────────────────────────
function parseModelOutput(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) {}
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
  return null;
}

// ── Main run-once cycle ───────────────────────────────────────────────────────
async function runOnce() {
  console.log(`\n[agent] ── Cycle start ${new Date().toISOString()} ──`);

  const ctx = await gatherAllContext();
  const prompt = buildPrompt(ctx);

  console.log("[agent] Sending prompt to Gemini …");
  let raw, parsed;
  try {
    raw = await callGemini(prompt);
    console.log("[gemini] Raw output:", raw?.slice(0, 600));
    parsed = parseModelOutput(raw);
  } catch (err) {
    console.error(`[gemini] Call failed: ${err}`);
    return;
  }

  if (!parsed) {
    console.warn("[agent] Could not parse model JSON — no actions taken");
    return;
  }

  // ── Print prediction ──────────────────────────────────────────────────────
  console.log("\n┌─── RPS PREDICTION ──────────────────────────────────────────");
  console.log(`│  Predicted RPS : ${parsed.predicted_rps}`);
  console.log(`│  Trend         : ${parsed.trend}`);
  console.log(`│  Confidence    : ${(parsed.confidence * 100).toFixed(0)}%`);
  console.log(`│  Dominant      : ${(parsed.dominant_signals || []).join(", ")}`);
  console.log(`│  Reasoning     : ${parsed.reasoning}`);
  console.log(`│  Actions       : ${(parsed.actions || []).join(", ") || "none"}`);
  console.log(`│  Servers+      : ${parsed.serversAdded || 0}`);
  console.log("└────────────────────────────────────────────────────────────\n");

  // ── Execute actions ───────────────────────────────────────────────────────
  const actionsList = Array.isArray(parsed.actions) ? parsed.actions.map(String) : [];
  if (DRY_RUN) {
    console.log(`[agent] DRY_RUN=true — skipping ${actionsList.length} action(s):`, actionsList);
  } else {
    for (const act of actionsList) {
      try {
        const res = await actions.executeAction(act);
        console.log(`[agent] Executed "${act}":`, res);
      } catch (err) {
        console.error(`[agent] Action "${act}" failed: ${err}`);
      }
    }
  }

  return parsed;
}

// ── Main loop ─────────────────────────────────────────────────────────────────
async function mainLoop() {
  console.log(`[agent] Starting RPS Prediction Agent`);
  console.log(`[agent]   Model    : ${GEMINI_MODEL}`);
  console.log(`[agent]   API Base : ${API_BASE}`);
  console.log(`[agent]   Game     : ${GAME_TYPE}`);
  console.log(`[agent]   Interval : ${INTERVAL}ms`);
  console.log(`[agent]   Dry Run  : ${DRY_RUN}`);
  if (!GEMINI_API_KEY) console.warn("[agent] ⚠️  GEMINI_API_KEY is not set — predictions will fail");

  while (true) {
    try { await runOnce(); } catch (err) { console.error("[agent] Unexpected error:", err); }
    await sleep(INTERVAL);
  }
}

if (process.env.NODE_ENV !== "test") {
  mainLoop().catch(err => console.error("Agent crashed:", err));
}

export { runOnce, gatherAllContext, buildPrompt, parseModelOutput };