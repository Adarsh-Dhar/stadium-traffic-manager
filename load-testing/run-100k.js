#!/usr/bin/env node
/**
 * FIFA 100K Ticket Surge Simulator — MEMORY STRESS VERSION 🔥
 * -----------------------------------------------------------
 * This version INTENTIONALLY fills your laptop's memory to simulate
 * a real catastrophic surge that crashes the system.
 * 
 * MEMORY MONITORING:
 * 1. Open Activity Monitor (macOS) or htop (Linux)
 * 2. Watch "Memory" tab as you run this script
 * 3. Or run in another terminal: 
 *    - macOS: watch -n 1 'ps aux | grep node'
 *    - Linux: watch -n 1 'free -h'
 */

import { createHash } from "crypto";

const BASE = process.env.API_URL ?? "http://localhost:5000";

// SECURITY_HEADERS: when DT_SECURITY=true and LOAD_TEST_API_KEY is set,
// include the shared secret as an x-api-key header on every request.
const SECURITY_HEADERS =
  process.env.DT_SECURITY === "true" && process.env.LOAD_TEST_API_KEY
    ? { "x-api-key": process.env.LOAD_TEST_API_KEY }
    : {};

// ─── MEMORY STRESS CONFIG ──────────────────────────────────────────────────
// These are the knobs to make your memory go KABOOM ⚡
const TOTAL_TICKETS     = 100_000;
const SURGE_DURATION    = 30;
const POLL_INTERVAL     = 1_000;  // Poll every second for real-time monitoring

// 🔥 EXTREME MEMORY CONFIG — Increased 10-100x from original
const SESSION_POOL_SIZE = 50_000;       // 50k sessions (was 5k) = ~200MB
const BUFFER_SIZE_PER_SESSION = 65_536;  // 64KB per session (was 4KB) = ~3.2GB total
const MAX_MEMORY_CACHE_SIZE = 500_000;   // Cache up to 500k responses = memory leak simulator
const MESSAGE_QUEUE_SIZE = 100_000;      // Queue messages = more memory pressure

// Wave config — push concurrency much harder
const WAVES = [
  { afterTickets:      0, concurrency: 200  },
  { afterTickets: 10_000, concurrency: 500  },
  { afterTickets: 30_000, concurrency: 1200 },
  { afterTickets: 60_000, concurrency: 2000 },
];

// ─── MEMORY POOLS ─────────────────────────────────────────────────────────
console.log("🏗️  Allocating memory pools...");

// Session pool — simulates active fan sessions
const sessionPool = Array.from({ length: SESSION_POOL_SIZE }, (_, i) => {
  const buf = Buffer.alloc(BUFFER_SIZE_PER_SESSION);
  buf.write(`SESSION_FAN_${i}_FIFA2026WC_`, 0);
  return buf;
});
const sessionMemoryMB = (SESSION_POOL_SIZE * BUFFER_SIZE_PER_SESSION) / (1024 * 1024);
console.log(`✅ Session pool: ${sessionMemoryMB.toFixed(0)}MB (${SESSION_POOL_SIZE} x ${BUFFER_SIZE_PER_SESSION/1024}KB)`);

// Response cache — simulates caching without cleanup (memory leak!)
const responseCache = new Map();

// Message queue — simulates in-memory message processing
const messageQueue = [];

// ─── STATE ────────────────────────────────────────────────────────────────
let sent        = 0;
let succeeded   = 0;
let failed503   = 0;
let failedOther = 0;
let currentConcurrency = WAVES[0].concurrency;
let activeWorkers = 0;
let done        = false;
let scaleEvents = [];
const startTime = Date.now();
const latencies = [];

// Memory tracking
let peakMemoryMB = 0;
let startingMemoryMB = 0;

// ─── HELPERS ──────────────────────────────────────────────────────────────
function getMemoryUsageMB() {
  const mem = process.memoryUsage();
  return {
    heapUsed:     mem.heapUsed     / 1024 / 1024,
    heapTotal:    mem.heapTotal    / 1024 / 1024,
    external:     mem.external     / 1024 / 1024,
    rss:          mem.rss          / 1024 / 1024,
    arrayBuffers: (mem.arrayBuffers ?? 0) / 1024 / 1024,
  };
}

function ticketId(n) {
  return `TICKET_${n % 100000}_2026WC`;
}

function elapsed() {
  return ((Date.now() - startTime) / 1000).toFixed(1);
}

function bar(pct, width = 15) {
  const filled = Math.round((Math.min(pct, 100) / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function color(val, warn, crit) {
  const n = parseFloat(val);
  if (n >= crit) return `\x1b[31m${val}\x1b[0m`;  // Red
  if (n >= warn) return `\x1b[33m${val}\x1b[0m`;  // Yellow
  return `\x1b[32m${val}\x1b[0m`;                  // Green
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];
}

// Simulate QR validation + memory-intensive work
function simulateQRValidation(tid) {
  let hash = tid;
  for (let i = 0; i < 50; i++) {
    hash = createHash("sha256").update(hash).digest("hex");
  }
  
  // Touch session buffer
  const session = sessionPool[Math.floor(Math.random() * SESSION_POOL_SIZE)];
  session.writeUInt32LE(Date.now() & 0xffffffff, 0);
  
  // Simulate response caching (memory leak!)
  const cacheKey = `response_${tid}_${Date.now()}`;
  const cachedResponse = {
    ticketId: tid,
    hash,
    timestamp: Date.now(),
    data: Buffer.alloc(16384), // 16KB fake response
    metadata: { fan: tid, processed: true }
  };
  
  if (responseCache.size < MAX_MEMORY_CACHE_SIZE) {
    responseCache.set(cacheKey, cachedResponse);
  }
  
  // Queue message for processing (simulates message broker backlog)
  if (messageQueue.length < MESSAGE_QUEUE_SIZE) {
    messageQueue.push({
      id: cacheKey,
      status: 'pending',
      createdAt: Date.now(),
      largePayload: Buffer.alloc(8192)
    });
  }
  
  return hash;
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
    body:    JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { ...SECURITY_HEADERS } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ─── DASHBOARD WITH MEMORY FOCUS ───────────────────────────────────────────
async function printMetrics() {
  const mem = getMemoryUsageMB();
  const progress = Math.round((sent / TOTAL_TICKETS) * 100);
  const rps = sent / Math.max((Date.now() - startTime) / 1000, 1);
  const totalErr = failed503 + failedOther;
  const errPct = sent ? ((totalErr / sent) * 100).toFixed(1) : "0.0";
  const successPct = sent ? ((succeeded / sent) * 100).toFixed(1) : "0.0";

  // Update peak memory
  if (mem.rss > peakMemoryMB) peakMemoryMB = mem.rss;

  const recentLat = latencies.slice(-1000);
  const p95c = percentile(recentLat, 95);
  const p99c = percentile(recentLat, 99);
  const avgc = recentLat.length
    ? Math.round(recentLat.reduce((a, b) => a + b, 0) / recentLat.length)
    : 0;

  process.stdout.write("\x1b[2J\x1b[H");
  console.log("╔═══════════════════════════════════════════════════════════════════╗");
  console.log("║   FIFA 100K MEMORY STRESS TEST — Live Dashboard 🔥               ║");
  console.log("╚═══════════════════════════════════════════════════════════════════╝");
  console.log(`  ⏱️  Elapsed         : ${elapsed()}s`);
  console.log(`  📊 Progress        : [${bar(progress)}] ${progress}%  (${sent.toLocaleString()} / ${TOTAL_TICKETS.toLocaleString()})`);
  console.log(`  🚀 RPS             : ${rps.toFixed(0)} req/s    Active Workers: ${activeWorkers}/${currentConcurrency}`);
  console.log(`  ✅ Results         : Success: ${succeeded.toLocaleString()} (${successPct}%)   503: ${failed503.toLocaleString()}   Err: ${failedOther.toLocaleString()}`);
  console.log("");

  console.log("╔─ 🧠 MEMORY USAGE (THE REAL STRESS) ────────────────────────────────╗");
  console.log(`║  Heap Used        : ${color(mem.heapUsed.toFixed(0), 500, 1500)} MB  /  Total: ${mem.heapTotal.toFixed(0)} MB`);
  console.log(`║  RSS (Actual Mem) : ${color(mem.rss.toFixed(0), 1000, 2000)} MB  ⚠️  WATCH THIS!`);
  console.log(`║  External Buffers : ${mem.external.toFixed(0)} MB  (Session pools)`);
  console.log(`║  Peak Reached     : ${peakMemoryMB.toFixed(0)} MB`);
  console.log(`║  Response Cache   : ${(responseCache.size * 16384 / (1024*1024)).toFixed(1)} MB  (leak: ${responseCache.size} entries)`);
  console.log(`║  Message Queue    : ${(messageQueue.length * 8192 / (1024*1024)).toFixed(1)} MB  (backlog: ${messageQueue.length} msgs)`);
  console.log("╚──────────────────────────────────────────────────────────────────────╝");

  console.log("");
  console.log(`  ⏱️  Latency        : avg ${avgc}ms   p95 ${p95c}ms   p99 ${p99c}ms`)
  console.log(`  📈 Error Rate     : ${color(errPct, 5, 15)}%`);
  console.log("");

  if (scaleEvents.length) {
    console.log("  ── Events ─────────────────────────────────────────────────────────");
    scaleEvents.slice(-2).forEach(e => console.log(`  ${e}`));
  }

  console.log("");
  if (!done) {
    console.log("  💡 TIPS:");
    console.log("     - Watch Activity Monitor / htop in another terminal");
    console.log("     - macOS: open -a 'Activity Monitor' && search for 'node'");
    console.log("     - Linux: htop -p $(pgrep -f 'surge-100k') OR watch -n 1 free -h");
    console.log("     - Press Ctrl+C to stop");
  }
}

// ─── TICKET SENDER ───────────────────────────────────────────────────────
async function sendOne(n) {
  activeWorkers++;
  const t0 = Date.now();
  try {
    // Simulate QR validation (burns memory)
    simulateQRValidation(ticketId(n));

    const { status } = await post("/api/fifa/ticket/validate", {
      ticketId: ticketId(n),
      userId:   `fan_${n}`,
    });

    const ms = Date.now() - t0;
    latencies.push(ms);
    
    if (latencies.length > 5000) latencies.shift();

    if (status === 200 || status === 401) succeeded++;
    else if (status === 503)              failed503++;
    else                                  failedOther++;
  } catch {
    failedOther++;
  } finally {
    activeWorkers--;
    sent++;

    // Escalate concurrency
    const nextWave = WAVES.findLast(w => sent >= w.afterTickets);
    if (nextWave && nextWave.concurrency !== currentConcurrency) {
      const ts = new Date().toISOString().slice(11, 19);
      scaleEvents.push(`[${ts}] 🌊 Wave: ${currentConcurrency} → ${nextWave.concurrency} workers`);
      // Emit a Dynatrace event via the API (best-effort, do not block)
      post("/api/fifa/admin/log-event", {
        title: `Wave: ${nextWave.concurrency} workers`,
        description: `Wave escalated to ${nextWave.concurrency} workers`,
        severity: "CUSTOM_ALERT",
      }).catch(() => {});

      currentConcurrency = nextWave.concurrency;
    }
  }
}

// ─── WORKER POOL ───────────────────────────────────────────────────────────
async function runWithDynamicConcurrency() {
  let next = 0;
  const inFlight = new Set();

  return new Promise((resolve) => {
    function fill() {
      while (inFlight.size < currentConcurrency && next < TOTAL_TICKETS) {
        const n = next++;
        const p = sendOne(n).then(() => {
          inFlight.delete(p);
          if (next < TOTAL_TICKETS) fill();
          else if (inFlight.size === 0) resolve();
        });
        inFlight.add(p);
      }
    }
    fill();
    const refillTimer = setInterval(() => {
      if (next >= TOTAL_TICKETS) { clearInterval(refillTimer); return; }
      fill();
    }, 100);
  });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  startingMemoryMB = getMemoryUsageMB().rss;

  console.log(`🏟️  Connecting to ${BASE} …`);
  try {
    const h = await get("/api/healthz");
    if (!h || h.status !== "ok") throw new Error("bad response");
    console.log("✅  Server is up.");
  } catch {
    console.error(`❌  Cannot reach ${BASE}/api/healthz`);
    process.exit(1);
  }

  console.log("");
  console.log("🔥 MEMORY STRESS TEST STARTING 🔥");
  console.log(`   Session Pool:        ${sessionMemoryMB.toFixed(0)}MB (fixed)`);
  console.log(`   Response Cache:      Up to ${(MAX_MEMORY_CACHE_SIZE * 16 / 1024).toFixed(0)}MB (leaking)`);
  console.log(`   Message Queue:       Up to ${(MESSAGE_QUEUE_SIZE * 8 / 1024).toFixed(0)}MB (backlog)`);
  console.log(`   Total potential:     ${(sessionMemoryMB + (MAX_MEMORY_CACHE_SIZE * 16 / 1024) + (MESSAGE_QUEUE_SIZE * 8 / 1024)).toFixed(0)}MB`);
  console.log("");
  console.log("🔄  Resetting server...");
  await post("/api/fifa/admin/reset", {});
  await new Promise(r => setTimeout(r, 500));

  console.log(`🚀  Starting surge (${SURGE_DURATION}s)...`);
  await post("/api/fifa/simulation/start", {
    intensity: "surge",
    durationSeconds: SURGE_DURATION,
  });

  const dashInterval = setInterval(() => printMetrics(), POLL_INTERVAL);

  await runWithDynamicConcurrency();

  done = true;
  clearInterval(dashInterval);
  await post("/api/fifa/simulation/stop", {});

  const finalMem = getMemoryUsageMB();
  const totalMs = Date.now() - startTime;
  const allP50  = percentile(latencies, 50);
  const allP95  = percentile(latencies, 95);
  const allP99  = percentile(latencies, 99);

  process.stdout.write("\x1b[2J\x1b[H");
  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║                  FIFA 100K — FINAL REPORT                          ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("📊 TRAFFIC");
  console.log(`   Total Requests   : ${sent.toLocaleString()}`);
  console.log(`   Success (2xx)    : ${succeeded.toLocaleString()}  (${((succeeded/sent)*100).toFixed(1)}%)`);
  console.log(`   Overloaded (503) : ${failed503.toLocaleString()}  (${((failed503/sent)*100).toFixed(1)}%)`);
  console.log(`   Errors           : ${failedOther.toLocaleString()}  (${((failedOther/sent)*100).toFixed(1)}%)`);
  console.log(`   Throughput       : ${(sent / (totalMs / 1000)).toFixed(0)} req/s avg`);
  console.log(`   Duration         : ${(totalMs / 1000).toFixed(1)}s`);
  console.log("");
  console.log("⏱️  LATENCY");
  console.log(`   p50  : ${allP50}ms`);
  console.log(`   p95  : ${allP95}ms`);
  console.log(`   p99  : ${allP99}ms`);
  console.log("");
  console.log("🧠 MEMORY STRESS RESULTS");
  console.log(`   Starting      : ${startingMemoryMB.toFixed(0)}MB`);
  console.log(`   Peak Reached  : ${color(peakMemoryMB.toFixed(0), 1000, 2000)}MB`);
  console.log(`   Final Heap    : ${finalMem.heapUsed.toFixed(0)}MB / ${finalMem.heapTotal.toFixed(0)}MB`);
  console.log(`   Final RSS     : ${color(finalMem.rss.toFixed(0), 1000, 2000)}MB (actual physical memory)`);
  console.log(`   Memory Leaked : ${(responseCache.size * 16384 / (1024*1024)).toFixed(1)}MB (response cache)`);
  console.log(`   Queue Backlog : ${(messageQueue.length * 8192 / (1024*1024)).toFixed(1)}MB (${messageQueue.length} messages)`);
  console.log(`   Memory Growth : ${(peakMemoryMB - startingMemoryMB).toFixed(0)}MB increase`);
  console.log("");

  if (peakMemoryMB > 1500) {
    console.log("🔥 CRITICAL: Your system memory is heavily stressed!");
    console.log("   This simulates a real catastrophic ticket surge.");
  } else if (peakMemoryMB > 800) {
    console.log("⚠️  WARNING: Significant memory pressure detected.");
  } else {
    console.log("✅ Memory test completed. Try increasing SESSION_POOL_SIZE for more stress.");
  }
  console.log("");
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});