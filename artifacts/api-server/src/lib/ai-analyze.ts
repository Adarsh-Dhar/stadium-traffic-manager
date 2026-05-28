import { getCurrentMetrics, addAlert, resolveAlerts, scaleServer } from "./stadium-state.js";
import { logger } from "./logger.js";

export async function aiAnalyze(): Promise<{
  analysis: string;
  actions: string[];
  confidence: number;
  serversAdded: number;
}> {
  const metrics = getCurrentMetrics();
  const defaultActions: string[] = [];
  let serversAdded = 0;
  let analysis = "";
  let confidence = 0.95;

  const modelPrompt = `You are an SRE assistant. Analyze the following JSON metrics and provide a JSON object with keys: analysis (string), actions (array of short strings), confidence (number between 0 and 1), serversAdded (integer). Metrics: ${JSON.stringify(
    metrics,
  )}\n\nKeep the response as valid JSON so it can be parsed programmatically.`;

  const apiKey = process.env.GEMINI_API_KEY || process.env.GENERATIVE_API_KEY || process.env.GOOGLE_API_KEY;
  const apiUrl = process.env.GEMINI_API_URL ||
    "https://us-models.googleapis.com/v1/models/gemini-2.5-flash:generateText";

  async function callModel(promptText: string): Promise<string> {
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

        const body = JSON.stringify({
          prompt: { text: promptText },
          temperature: 0.2,
          maxOutputTokens: 512,
        });

        const url = apiKey && !headers["Authorization"] ? `${apiUrl}?key=${apiKey}` : apiUrl;
        const resp = await fetch(url, { method: "POST", headers, body, signal: controller.signal as any });
        clearTimeout(timeout);
        if (!resp.ok) {
          const text = await resp.text().catch(() => "<no body>");
          logger.warn({ attempt, status: resp.status, body: text }, "Generative API returned non-OK");
          if ([429, 502, 503, 504].includes(resp.status) && attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 500 * attempt));
            continue;
          }
          throw new Error(`Generative API error ${resp.status}: ${text}`);
        }

        const json = await resp.json().catch(() => null);
        // Try to extract the best text candidate from common shapes
        const j: any = json;
        let out = "";
        if (!j) out = "";
        else if (Array.isArray(j.candidates) && j.candidates[0]) out = j.candidates[0].content ?? JSON.stringify(j.candidates[0]);
        else if (j.candidates?.[0]?.output) out = j.candidates[0].output;
        else if (j.output?.[0]?.content) out = j.output[0].content;
        else if (typeof j.result === "string") out = j.result;
        else out = JSON.stringify(j);

        return out;
      } catch (err: any) {
        clearTimeout(timeout);
        if (err?.name === "AbortError") {
          logger.warn({ attempt }, "Generative API request timed out");
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
            continue;
          }
        }
        logger.error({ err, attempt }, "Generative API call failed");
        if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 400 * attempt));
        else throw err;
      }
    }
    throw new Error("Generative API failed after retries");
  }

  try {
    const raw = await callModel(modelPrompt);
    logger.info({ raw: raw?.slice(0, 800) }, "AI raw response");

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
        } catch (e) {
          parsed = null;
        }
      }
    }

    if (parsed) {
      analysis = typeof parsed.analysis === "string" ? parsed.analysis : raw;
      if (Array.isArray(parsed.actions)) defaultActions.push(...parsed.actions.map(String));
      confidence = typeof parsed.confidence === "number" ? parsed.confidence : confidence;
      serversAdded = typeof parsed.serversAdded === "number" ? parsed.serversAdded : 0;
    } else {
      // Fallback: simple heuristic (previous local logic)
      logger.info({ raw }, "Falling back to local heuristic for AI analysis");
      if (metrics.cpuUsage > 85) {
        const serversNeeded = Math.ceil((metrics.cpuUsage - 70) / 15);
        serversAdded = serversNeeded;
        defaultActions.push(`Scaled up ${serversNeeded} server instance(s) — CPU pressure at ${metrics.cpuUsage.toFixed(0)}%`);
        analysis = `Detected severe CPU bottleneck (${metrics.cpuUsage.toFixed(0)}%). Latency ${metrics.avgLatency.toFixed(0)}ms. Recommended scaling by ${serversNeeded} instance(s).`;
        confidence = 0.9;
        resolveAlerts("critical");
        addAlert("info", "AI Auto-Heal Applied (fallback)", `AI recommended ${serversNeeded} servers (fallback).`);
      } else if (metrics.avgLatency > 800) {
        defaultActions.push(`Increase connection pool limits for ${metrics.requestsPerSecond} RPS`);
        analysis = `High latency (${metrics.avgLatency.toFixed(0)}ms) suggests I/O bottleneck. Recommend tuning connection pools and request queuing.`;
        confidence = 0.78;
        resolveAlerts("warning");
        addAlert("info", "AI Optimization Applied (fallback)", "Connection pooling tuned (fallback).");
      } else if (metrics.errorRate > 5) {
        defaultActions.push("Enable circuit breaker and isolate unhealthy instances");
        analysis = `Error rate ${metrics.errorRate.toFixed(1)}% — circuit breaker recommended.`;
        confidence = 0.85;
        resolveAlerts("warning");
      } else {
        defaultActions.push("System operating within normal parameters");
        analysis = `All metrics healthy. CPU ${metrics.cpuUsage.toFixed(0)}%, latency ${metrics.avgLatency.toFixed(0)}ms, error rate ${metrics.errorRate.toFixed(1)}%.`;
        confidence = 0.99;
        addAlert("info", "AI Analysis Complete", "System healthy — no intervention required.");
      }
    }
  } catch (err) {
    logger.error({ err }, "AI analysis failed entirely — using local heuristic");
    // local fallback if model call completely fails
    if (metrics.cpuUsage > 85) {
      const serversNeeded = Math.ceil((metrics.cpuUsage - 70) / 15);
      serversAdded = serversNeeded;
      defaultActions.push(`Scaled up ${serversNeeded} server instance(s) — CPU pressure at ${metrics.cpuUsage.toFixed(0)}%`);
      analysis = `Detected severe CPU bottleneck (${metrics.cpuUsage.toFixed(0)}%). Latency ${metrics.avgLatency.toFixed(0)}ms. Recommended scaling by ${serversNeeded} instance(s).`;
      confidence = 0.8;
      resolveAlerts("critical");
      addAlert("info", "AI Auto-Heal Applied (fallback)", `AI recommended ${serversNeeded} servers (fallback).`);
    } else {
      defaultActions.push("System operating within normal parameters");
      analysis = `All metrics healthy (fallback). CPU ${metrics.cpuUsage.toFixed(0)}%`;
      confidence = 0.9;
      addAlert("info", "AI Analysis Fallback", "Used local fallback analysis.");
    }
  }

  // Apply any scaling suggested
  if (serversAdded > 0) {
    for (let i = 0; i < serversAdded; i++) {
      try { scaleServer("add-server"); } catch (e) { /* ignore */ }
    }
    addAlert(
      "info",
      "AI Auto-Heal Applied",
      `AI added ${serversAdded} servers to resolve resource pressure. Expected improvement in 15-30s.`,
      `Added ${serversAdded} server(s) via AI`,
    );
  }

  const finalActions = defaultActions.length > 0 ? defaultActions : [];
  return { analysis, actions: finalActions, confidence, serversAdded };
}
