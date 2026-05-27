import fetch from "node-fetch";

const CLUSTER_URL = process.env.DYNATRACE_CLUSTER_URL || process.env.DYNATRACE_BASE_URL || null;
const TOKEN = process.env.DYNATRACE_API_TOKEN || null;

function notConfigured() {
  return { ok: false, error: "Dynatrace not configured (missing DYNATRACE_CLUSTER_URL or DYNATRACE_API_TOKEN)" };
}

async function req(path, opts = {}) {
  if (!CLUSTER_URL || !TOKEN) return notConfigured();
  const url = `${CLUSTER_URL.replace(/\/$/, "")}${path}`;
  const headers = { Authorization: `Api-Token ${TOKEN}`, Accept: "application/json" };
  try {
    const resp = await fetch(url, { headers, ...opts });
    const text = await resp.text();
    try { return { ok: resp.ok, status: resp.status, json: JSON.parse(text) }; } catch (e) { return { ok: resp.ok, status: resp.status, text }; }
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function fetchProblems() {
  // Dynatrace problems API
  return req('/api/v2/problems');
}

export async function fetchEvents() {
  return req('/api/v2/events');
}

export async function fetchTimeseries(query) {
  // Simple wrapper for timeseries queries; caller provides full query string
  const path = `/api/v2/metrics/query?query=${encodeURIComponent(query)}`;
  return req(path);
}

export default { fetchProblems, fetchEvents, fetchTimeseries };
