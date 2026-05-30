import fetch from "node-fetch";
import { API_BASE, DRY_RUN } from "./config.js";

async function post(path, body = {}) {
  const url = `${API_BASE}${path}`;
  if (DRY_RUN) {
    console.log(`[ai-agent] DRY RUN POST ${url} ->`, JSON.stringify(body));
    return { ok: true, dryRun: true };
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    const json = await resp.json();
    return { ok: resp.ok, status: resp.status, json };
  } catch (e) {
    const text = await resp.text().catch(() => "<no body>");
    return { ok: resp.ok, status: resp.status, text };
  }
}

export async function executeAction(action) {
  switch (action) {
    case "add-server":
      return post("/admin/scale", { action: "add-server" });
    case "remove-server":
      return post("/admin/scale", { action: "remove-server" });
    case "clear-cache":
      return post("/admin/reset", { scope: "cache" });
    case "restart-service":
      return post("/admin/reset", { scope: "service" });
    case "ai-analyze":
      return post("/admin/ai-analyze", {});
    default:
      console.log(`[ai-agent] Unknown action requested: ${action}`);
      return { ok: false, error: "unknown_action" };
  }
}

export default { executeAction };
