/**
 * FIFA World Cup 2026 — Realistic Ticket Scanner
 *
 * Simulates authentic crowd arrival waves for an 80k-capacity stadium.
 * Wires directly into the stadium-traffic-manager API:
 *   POST /ticket/scan   → marks ticket used in Postgres
 *   Redis INCR          → updates tickets_scanned counter the AI agent reads
 *
 * Usage:
 *   node ticket-scanner.js [--match GRP|R32|QF|SF|F] [--speed 1] [--api http://localhost:5000]
 *
 * Options:
 *   --match   Match stage; controls target fill rate  (default: GRP)
 *   --speed   Time multiplier (1 = real-time, 60 = 1 sim-minute per real-second)
 *   --api     API server base URL                     (default: http://localhost:5000)
 *   --redis   Redis connection string                 (default: redis://localhost:6379)
 *   --dry-run Print scans without hitting the API
 */

import http from 'http';
import https from 'https';
import { createClient } from 'redis';
import { parseArgs } from 'util';

// ── CLI args ───────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    match:   { type: 'string',  default: 'GRP' },
    speed:   { type: 'string',  default: '1'   },
    api:     { type: 'string',  default: 'http://localhost:5000' },
    redis:   { type: 'string',  default: 'redis://localhost:6379' },
    'dry-run': { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

const MATCH_TYPE   = args.match.toUpperCase();
const SPEED        = parseFloat(args.speed);
const API_BASE     = args.api.replace(/\/$/, '');
const REDIS_URL    = args.redis;
const DRY_RUN      = args['dry-run'];

// ── FIFA WC 2026 venue configs ─────────────────────────────────────────────
// All 16 official venues with actual capacities and gate counts.
const VENUES = {
  MetLife:      { city: 'East Rutherford, NJ', capacity: 82500, gates: 6 },
  ATT:          { city: 'Arlington, TX',        capacity: 80000, gates: 6 },
  SoFi:         { city: 'Inglewood, CA',        capacity: 70240, gates: 5 },
  Lumen:        { city: 'Seattle, WA',          capacity: 68740, gates: 5 },
  Arrowhead:    { city: 'Kansas City, MO',      capacity: 76416, gates: 6 },
  HardRock:     { city: 'Miami Gardens, FL',    capacity: 65326, gates: 5 },
  NRG:          { city: 'Houston, TX',          capacity: 72220, gates: 6 },
  LincolnFin:   { city: 'Philadelphia, PA',     capacity: 69176, gates: 5 },
  Levis:        { city: 'Santa Clara, CA',      capacity: 68500, gates: 5 },
  BofA:         { city: 'Charlotte, NC',        capacity: 75523, gates: 6 },
  Azteca:       { city: 'Mexico City, MX',      capacity: 87523, gates: 7 },
  BBVA:         { city: 'Monterrey, MX',        capacity: 51349, gates: 4 },
  Akron:        { city: 'Guadalajara, MX',      capacity: 46232, gates: 4 },
  BMO:          { city: 'Toronto, CA',          capacity: 45736, gates: 4 },
  BCPlace:      { city: 'Vancouver, CA',        capacity: 54500, gates: 4 },
  Commonwealth: { city: 'Edmonton, CA',         capacity: 56302, gates: 4 },
};

// ── Match stage → venue + fill rate ───────────────────────────────────────
const MATCH_CONFIGS = {
  GRP: { label: 'Group Stage',     venue: VENUES.MetLife,   fillRate: 0.85 },
  R32: { label: 'Round of 32',     venue: VENUES.SoFi,      fillRate: 0.92 },
  R16: { label: 'Round of 16',     venue: VENUES.ATT,       fillRate: 0.95 },
  QF:  { label: 'Quarter-Final',   venue: VENUES.MetLife,   fillRate: 0.97 },
  SF:  { label: 'Semi-Final',      venue: VENUES.MetLife,   fillRate: 0.99 },
  TP:  { label: 'Third Place',     venue: VENUES.Arrowhead, fillRate: 0.90 },
  F:   { label: 'FINAL',           venue: VENUES.MetLife,   fillRate: 1.00 },
};

// ── Gate definitions — mirrors stadium-state.ts GATES ─────────────────────
// Weights must sum to 1.0. Throughput (scans/min/gate) at peak.
const GATE_PROFILES = [
  { id: 'gate-a', label: 'Gate A — North',  type: 'general', weight: 0.225, peakThr: 240, scannerCount: 8 },
  { id: 'gate-b', label: 'Gate B — South',  type: 'general', weight: 0.225, peakThr: 240, scannerCount: 8 },
  { id: 'gate-c', label: 'Gate C — East',   type: 'general', weight: 0.195, peakThr: 210, scannerCount: 7 },
  { id: 'gate-d', label: 'Gate D — West',   type: 'general', weight: 0.195, peakThr: 210, scannerCount: 7 },
  { id: 'gate-e', label: 'Gate E — VIP',    type: 'vip',     weight: 0.085, peakThr: 90,  scannerCount: 3 },
  { id: 'gate-f', label: 'Gate F — Press',  type: 'press',   weight: 0.075, peakThr: 80,  scannerCount: 2 },
];

// ── Realistic FIFA crowd arrival phases ───────────────────────────────────
// Rate = scans per minute across ALL gates combined.
// Based on observed patterns at FIFA WC 2022 and UEFA Euro finals.
// Each phase has a base rate, a peak multiplier, and gaussian noise sigma.
const ARRIVAL_PHASES = [
  //  name                       start   dur   rateBase ratePeak  sigma  dupRate invalidRate
  { name: 'Gates open (-3h)',    start: -180, durationMin: 30, rateBase: 25, ratePeak: 60, sigma: 8, dupRate: 0.001, invalidRate: 0.002 },
  { name: 'Early arrivals (-2h)', start: -150, durationMin: 30, rateBase: 80, ratePeak: 150, sigma: 18, dupRate: 0.002, invalidRate: 0.003 },
  { name: 'Steady stream (-90m)', start: -120, durationMin: 20, rateBase: 180, ratePeak: 280, sigma: 30, dupRate: 0.003, invalidRate: 0.002 },
  { name: 'Mid-wave (-70m)',      start: -100, durationMin: 15, rateBase: 320, ratePeak: 480, sigma: 45, dupRate: 0.004, invalidRate: 0.002 },
  { name: 'Peak wave (-55m)',     start: -85, durationMin: 12, rateBase: 550, ratePeak: 820, sigma: 65, dupRate: 0.005, invalidRate: 0.003 },
  { name: 'Rush hour (-43m)',     start: -73, durationMin: 10, rateBase: 780, ratePeak: 1050, sigma: 80, dupRate: 0.006, invalidRate: 0.003 },
  { name: 'Kickoff crunch (-33m)', start: -63, durationMin: 8, rateBase: 950, ratePeak: 1300, sigma: 90, dupRate: 0.007, invalidRate: 0.004 },
  { name: 'Final surge (-25m)',   start: -55, durationMin: 6, rateBase: 820, ratePeak: 1100, sigma: 75, dupRate: 0.008, invalidRate: 0.004 },
  { name: 'Pre-kickoff (-19m)',   start: -49, durationMin: 6, rateBase: 580, ratePeak: 780, sigma: 60, dupRate: 0.007, invalidRate: 0.003 },
  { name: 'Kickoff stragglers',   start: -43, durationMin: 8, rateBase: 220, ratePeak: 360, sigma: 40, dupRate: 0.005, invalidRate: 0.002 },
  { name: 'Late (in-play)',       start: -35, durationMin: 12, rateBase: 80, ratePeak: 140, sigma: 20, dupRate: 0.003, invalidRate: 0.002 },
  { name: 'Half-time bump',        start: 10, durationMin: 8, rateBase: 90, ratePeak: 160, sigma: 22, dupRate: 0.003, invalidRate: 0.001 },
  { name: 'Settling (post-HT)',    start: 18, durationMin: 12, rateBase: 40, ratePeak: 70, sigma: 12, dupRate: 0.001, invalidRate: 0.001 },
];

// ── Ticket pool (mirrors Postgres seed) ───────────────────────────────────
// 100k tickets: TICKET_0_2026WC … TICKET_99999_2026WC
const TICKET_COUNT = 100_000;
const scanned = new Set();

function nextTicket() {
  // Pick a random unscanned ticket (fast enough for demo scale)
  let attempts = 0;
  while (attempts++ < 20) {
    const idx = Math.floor(Math.random() * TICKET_COUNT);
    const id  = `TICKET_${idx}_2026WC`;
    if (!scanned.has(id)) return id;
  }
  return null; // pool exhausted
}

function pickGate(phase) {
  const r = Math.random();
  let acc = 0;
  for (const g of GATE_PROFILES) {
    // VIP and Press gates have lower traffic during late phases
    let w = g.weight;
    if (phase.name.includes('straggler') || phase.name.includes('Late')) {
      if (g.type === 'vip' || g.type === 'press') w *= 0.3;
    }
    acc += w;
    if (r < acc) return g;
  }
  return GATE_PROFILES[0];
}

// ── Gaussian noise helper ──────────────────────────────────────────────────
function gaussianNoise(sigma) {
  // Box-Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
}

// ── HTTP fetch helper (no external deps for Node 18+) ─────────────────────
function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const data = JSON.stringify(body);
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Stats ──────────────────────────────────────────────────────────────────
const stats = {
  totalScanned:   0,
  totalRejected:  0,   // duplicates + invalid
  totalDuplicate: 0,
  totalInvalid:   0,
  apiErrors:      0,
  gateCounters:   Object.fromEntries(GATE_PROFILES.map(g => [g.id, 0])),
  velocityWindow: [],  // timestamps for 15s rolling window
  phaseLog:       [],
};

function recordScan(gateId) {
  stats.totalScanned++;
  stats.gateCounters[gateId]++;
  stats.velocityWindow.push(Date.now());
}

function velocity15s() {
  const now = Date.now();
  stats.velocityWindow = stats.velocityWindow.filter(t => now - t < 15_000);
  return stats.velocityWindow.length;
}

// ── Redis client ───────────────────────────────────────────────────────────
let redis = null;

async function connectRedis() {
  if (DRY_RUN) return;
  try {
    redis = createClient({ url: REDIS_URL });
    redis.on('error', (e) => process.stderr.write(`[redis] ${e.message}\n`));
    await redis.connect();
    process.stdout.write(`[redis] connected to ${REDIS_URL}\n`);
  } catch (e) {
    process.stderr.write(`[redis] connection failed — counter won't update: ${e.message}\n`);
    redis = null;
  }
}

async function incrRedis() {
  if (!redis) return;
  try { await redis.incr('tickets_scanned'); }
  catch (e) { process.stderr.write(`[redis] INCR failed: ${e.message}\n`); }
}

async function resetRedis() {
  if (!redis) return;
  try { await redis.set('tickets_scanned', '0'); }
  catch (e) { process.stderr.write(`[redis] SET failed: ${e.message}\n`); }
}

// ── Core scan function ─────────────────────────────────────────────────────
async function performScan(ticketId, gate, isDuplicate, isInvalid) {
  if (DRY_RUN) {
    const tag = isInvalid ? '[INVALID]' : isDuplicate ? '[DUP]' : '[OK]';
    process.stdout.write(`${tag} ${ticketId} → ${gate.id}\n`);
    if (!isInvalid && !isDuplicate) recordScan(gate.id);
    return;
  }

  if (isInvalid) {
    // Invalid = ticket ID not in DB → API returns 401
    stats.totalInvalid++;
    stats.totalRejected++;
    return;
  }

  if (isDuplicate) {
    // Duplicate = already used → API returns success:false
    stats.totalDuplicate++;
    stats.totalRejected++;
    try {
      await apiPost('/api/fifa/ticket/scan', { ticketId, gate: gate.id });
    } catch {}
    return;
  }

  try {
    const res = await apiPost('/api/fifa/ticket/scan', { ticketId, gate: gate.id });
    if (res.status === 200 && res.body?.success) {
      recordScan(gate.id);
      scanned.add(ticketId);
    } else {
      stats.totalRejected++;
    }
  } catch (e) {
    stats.apiErrors++;
    process.stderr.write(`[api] scan error: ${e.message}\n`);
  }
}

// ── Phase runner ───────────────────────────────────────────────────────────
async function runPhase(phase, targetTotal) {
  const ticksPerMinute = Math.round(60 / SPEED);   // real-time ticks per sim-minute
  const totalTicks = phase.durationMin * ticksPerMinute;
  const msPerTick  = 1000;                          // 1 real second per tick

  process.stdout.write(`\n[phase] ${phase.name}  (${phase.durationMin} sim-min, ~${phase.rateBase}–${phase.ratePeak} scans/min)\n`);

  for (let tick = 0; tick < totalTicks; tick++) {
    if (stats.totalScanned >= targetTotal) break;

    // Compute rate for this tick with gaussian noise
    const progress  = tick / totalTicks;
    const peakRatio = Math.sin(Math.PI * progress);        // rises then falls
    const baseRate  = phase.rateBase + (phase.ratePeak - phase.rateBase) * peakRatio;
    const rate      = Math.max(1, Math.round(baseRate + gaussianNoise(phase.sigma)));
    const scansThisTick = Math.max(0, Math.round(rate * SPEED / 60));

    // Fire scans concurrently (batch, not all at once)
    const batchSize = 20;
    for (let b = 0; b < scansThisTick; b += batchSize) {
      const batch = Math.min(batchSize, scansThisTick - b);
      const promises = [];
      for (let i = 0; i < batch; i++) {
        const gate      = pickGate(phase);
        const rnd       = Math.random();
        const isDup     = rnd < phase.dupRate     && scanned.size > 100;
        const isInvalid = rnd < phase.dupRate + phase.invalidRate && !isDup;
        const ticketId  = isDup
          ? `TICKET_${Math.floor(Math.random() * stats.totalScanned)}_2026WC`
          : isInvalid
          ? `FAKE_${Math.random().toString(36).slice(2, 10).toUpperCase()}`
          : nextTicket();
        if (!ticketId) continue;
        promises.push(performScan(ticketId, gate, isDup, isInvalid));
      }
      await Promise.all(promises);
    }

    // Progress line every 10 ticks
    if (tick % 10 === 0 || tick === totalTicks - 1) {
      const occ = Math.round(stats.totalScanned / targetTotal * 100);
      const vel = velocity15s();
      process.stdout.write(
        `  t+${String(tick).padStart(3)} | scanned: ${String(stats.totalScanned).padStart(6)} `
        + `(${String(occ).padStart(3)}%) | vel: ${String(vel).padStart(4)}/15s `
        + `| dup: ${stats.totalDuplicate} | invalid: ${stats.totalInvalid} | api_err: ${stats.apiErrors}\n`
      );
    }

    await new Promise(r => setTimeout(r, msPerTick));
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const cfg = MATCH_CONFIGS[MATCH_TYPE];
  if (!cfg) {
    process.stderr.write(`Unknown match type: ${MATCH_TYPE}. Use GRP|R32|R16|QF|SF|TP|F\n`);
    process.exit(1);
  }

  const venue      = cfg.venue;
  const targetTotal = Math.round(venue.capacity * cfg.fillRate);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║       FIFA World Cup 2026 — Ticket Scanner Simulator     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Match stage : ${cfg.label}`);
  console.log(`  Venue       : ${venue.city}  (cap: ${venue.capacity.toLocaleString()})`);
  console.log(`  Target fill : ${(cfg.fillRate * 100).toFixed(0)}% → ${targetTotal.toLocaleString()} fans`);
  console.log(`  Speed       : ${SPEED}×  (1 real-second = ${SPEED} sim-seconds)`);
  console.log(`  API         : ${DRY_RUN ? 'DRY RUN — no HTTP calls' : API_BASE}`);
  console.log(`  Redis       : ${DRY_RUN ? 'DRY RUN' : REDIS_URL}`);
  console.log('');

  if (!DRY_RUN) {
    await connectRedis();
    // Optionally reset Redis counter before the run
    if (process.env.RESET_REDIS === '1') {
      await resetRedis();
      console.log('[redis] counter reset to 0');
    }
  }

  // Run each phase until target is reached
  for (const phase of ARRIVAL_PHASES) {
    if (stats.totalScanned >= targetTotal) break;
    await runPhase(phase, targetTotal);
  }

  // ── Final report ───────────────────────────────────────────────────────
  console.log('\n══════════════════════ SCAN COMPLETE ══════════════════════');
  console.log(`  Total scanned  : ${stats.totalScanned.toLocaleString()}`);
  console.log(`  Rejected       : ${stats.totalRejected.toLocaleString()} (dup: ${stats.totalDuplicate}, invalid: ${stats.totalInvalid})`);
  console.log(`  API errors     : ${stats.apiErrors}`);
  console.log(`  Occupancy      : ${(stats.totalScanned / venue.capacity * 100).toFixed(1)}%`);
  console.log('\n  Gate breakdown:');
  for (const g of GATE_PROFILES) {
    const cnt = stats.gateCounters[g.id] || 0;
    const pct = (cnt / Math.max(stats.totalScanned, 1) * 100).toFixed(1);
    console.log(`    ${g.label.padEnd(22)} ${String(cnt).padStart(6)} scans  (${pct}%)`);
  }
  console.log('══════════════════════════════════════════════════════════\n');

  if (redis) await redis.disconnect();
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});