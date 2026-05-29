/**
 * Webhook Simulator — mimics a real ticketing vendor
 * Fires POST requests to the stadium API and increments `tickets_scanned` in Redis.
 *
 * Usage:  node webhook-simulator.js [intensity]
 *   intensity: low | medium | high | surge   (default: medium)
 */

import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const API_BASE  = process.env.AI_AGENT_API_BASE || "http://localhost:5000/api/fifa";
const INTENSITY = process.argv[2] || "medium";

// Scans per second per intensity level
const RATE_MAP = { low: 5, medium: 20, high: 60, surge: 150 };
const scansPerSec = RATE_MAP[INTENSITY] ?? 20;
const intervalMs  = Math.round(1000 / scansPerSec);

// Pre-generated ticket pool (same format as stadium DB seed)
const TICKET_POOL_SIZE = 5000;
const tickets = Array.from({ length: TICKET_POOL_SIZE }, (_, i) =>
  `TICKET_${Math.floor(Math.random() * 100000)}_2026WC`
);
const GATES = ["gate-a", "gate-b", "gate-c", "gate-d", "gate-e", "gate-f"];

let scanned = 0;
let redisClient = null;

async function connectRedis() {
  try {
    const { createClient } = await import("redis");
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on("error", () => {});
    await redisClient.connect();
    console.log("[simulator] Redis connected");
  } catch {
    console.warn("[simulator] Redis unavailable — only HTTP mode");
  }
}

async function scan() {
  const ticketId = tickets[Math.floor(Math.random() * tickets.length)];
  const gate     = GATES[Math.floor(Math.random() * GATES.length)];

  // Fire the HTTP scan (async, best-effort)
  fetch(`${API_BASE}/ticket/scan`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ticketId, gate }),
  }).catch(() => {}); // swallow — simulator doesn't care about response

  // Increment Redis counter
  if (redisClient?.isReady) {
    await redisClient.incr("tickets_scanned").catch(() => {});
  }

  scanned++;
  if (scanned % 500 === 0) {
    process.stdout.write(`\r[simulator] ${INTENSITY.toUpperCase()} — ${scanned} scans sent`);
  }
}

async function main() {
  await connectRedis();
  console.log(`[simulator] Firing scans at ${scansPerSec}/sec (intensity: ${INTENSITY})`);
  setInterval(scan, intervalMs);
}

main().catch(console.error);
