import dotenv from "dotenv";
import fetch from "node-fetch";
import dynatrace from "./dynatrace-client.js";
import actions from "./actions.js";

dotenv.config();

const API_BASE = process.env.AI_AGENT_API_BASE || `http://localhost:${process.env.PORT || 5000}/api/fifa`;
const INTERVAL = Number(process.env.AGENT_CHECK_INTERVAL || process.env.AI_AGENT_CHECK_INTERVAL || 5000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GENERATIVE_API_KEY || process.env.GOOGLE_API_KEY || null;
const GEMINI_API_URL = process.env.GEMINI_API_URL || "https://us-models.googleapis.com/v1/models/gemini-2.5-flash:generateText";
const DRY_RUN = (process.env.AI_AGENT_DRY_RUN || "false") === "true";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callModel(promptText) {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const headers = { "Content-Type": "application/json" };
      if (GEMINI_API_KEY) headers["Authorization"] = `Bearer ${GEMINI_API_KEY}`;

      const body = JSON.stringify({ prompt: { text: promptText }, temperature: 0.2, maxOutputTokens: 512 });
      const url = GEMINI_API_URL;
      const resp = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
      clearTimeout(timeout);
      if (!resp.ok) {
        const text = await resp.text().catch(() => "<no body>");
        console.warn(`[ai-agent] Model returned status ${resp.status}: ${text}`);
        if ([429, 502, 503, 504].includes(resp.status) && attempt < maxAttempts) {
          await sleep(500 * attempt);
          continue;
        }
        throw new Error(`Model request failed ${resp.status}`);
      }

      const json = await resp.json().catch(() => null);
      let out = "";
      if (!json) out = "";
      else if (Array.isArray(json?.candidates) && json.candidates[0]) out = json.candidates[0].content ?? JSON.stringify(json.candidates[0]);
      else if (json?.candidates?.[0]?.output) out = json.candidates[0].output;
      else if (json?.output?.[0]?.content) out = json.output[0].content;
      else if (typeof json?.result === "string") out = json.result;
      else out = JSON.stringify(json);

      return out;
    } catch (err) {
      clearTimeout(timeout);
      if (err?.name === "AbortError") {
        console.warn(`[ai-agent] Model request timed out (attempt ${attempt})`);
        if (attempt < maxAttempts) {
          await sleep(400 * attempt);
          continue;
        }
      }
      console.error(`[ai-agent] Model call failed: ${String(err)}`);
      if (attempt < maxAttempts) await sleep(400 * attempt);
      else throw err;
    }
  }
  throw new Error("Model failed after retries");
}

async function fetchMetrics() {
  try {
    const [currentRes, alertsRes] = await Promise.all([
      fetch(`${API_BASE}/metrics/current`).then((r) => r.json()),
      fetch(`${API_BASE}/metrics/alerts`).then((r) => r.json()),
    ]);
    return { metrics: currentRes, alerts: alertsRes };
  } catch (err) {
    console.error(`[ai-agent] Failed to fetch metrics from API server: ${String(err)}`);
    return { metrics: null, alerts: null };
  }
}

async function gatherContext() {
  const ctx = { api: {}, dynatrace: {} };
  const { metrics, alerts } = await fetchMetrics();
  ctx.api.metrics = metrics;
  ctx.api.alerts = alerts;

  try {
    const problems = await dynatrace.fetchProblems();
    const events = await dynatrace.fetchEvents();
    ctx.dynatrace.problems = problems;
    ctx.dynatrace.events = events;
  } catch (err) {
    ctx.dynatrace.error = String(err);
  }

  return ctx;
}

async function runOnce() {
  const ctx = await gatherContext();
  const metricsSnippet = JSON.stringify(ctx.api.metrics ?? {}, null, 2);
  const dtSummary = ctx.dynatrace.problems?.json ? `Problems:${JSON.stringify(ctx.dynatrace.problems.json, null, 2)}` : ctx.dynatrace.error ? `Dynatrace error: ${ctx.dynatrace.error}` : "No Dynatrace data";

  const prompt = `You are an SRE assistant. Given the following system metrics and Dynatrace summary, return a JSON object with keys: analysis (string), actions (array of short strings), confidence (0..1), serversAdded (integer).\n\nMetrics:\n${metricsSnippet}\n\nDynatrace:\n${dtSummary}\n\nRespond with valid JSON only.`;

  console.log(`[ai-agent] Calling model with metrics snapshot`);
  try {
    const raw = await callModel(prompt);
    console.log(`[ai-agent] Model raw output (truncated):`, raw?.slice(0, 800));

    // Attempt to parse JSON from the model output
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) {
      const match = raw && raw.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch (e) { parsed = null; }
      }
    }

    if (!parsed) {
      console.log(`[ai-agent] Model returned non-JSON; no actions will be taken (dry-run).`);
      return { parsed: null, raw };
    }

    const actionsList = Array.isArray(parsed.actions) ? parsed.actions.map(String) : [];
    console.log(`[ai-agent] Model recommended actions:`, actionsList);

    for (const act of actionsList) {
      try {
        const res = await actions.executeAction(act);
        console.log(`[ai-agent] Executed action ${act}:`, res);
      } catch (err) {
        console.error(`[ai-agent] Action ${act} failed: ${String(err)}`);
      }
    }

    return { parsed, raw };
  } catch (err) {
    console.error(`[ai-agent] Error during model analysis: ${String(err)}`);
    return { error: String(err) };
  }
}

async function mainLoop() {
  console.log(`[ai-agent] Starting agent (API=${API_BASE}) DRY_RUN=${DRY_RUN} interval=${INTERVAL}ms`);
  while (true) {
    try {
      await runOnce();
    } catch (err) {
      console.error(`[ai-agent] Unexpected error in run: ${String(err)}`);
    }
    await sleep(INTERVAL);
  }
}

if (process.env.NODE_ENV !== "test") {
  mainLoop().catch((err) => console.error("Agent crashed:", err));
}