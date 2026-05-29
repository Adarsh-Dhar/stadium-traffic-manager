'use strict';

/**
 * Mock Stadium Metrics API
 *
 * Endpoints:
 * - GET  /                      => same as /metrics/current, returns { rps, ... }
 * - GET  /metrics/rps           => returns { rps }
 * - GET  /metrics/current       => returns current metrics snapshot
 * - GET  /metrics/alerts        => returns active alerts array
 * - GET  /stadium/capacity      => returns stadium capacity info
 * - POST /scale-up              => { add?: number }
 * - POST /scale-down            => { remove?: number }
 * - POST /admin/scale           => { action: "add-server" | "remove-server" }
 * - POST /admin/ai-analyze      => triggers AI analysis
 * - GET  /status                => { simulatedContainers, lastAction }
 */

const http = require('http');
const { URL } = require('url');

let simulatedContainers = 2;
let lastAction = 'initialized';

const POLL_MS   = 5_000;
const MATCH_MIN = 150;
const REAL_SECS_PER_MATCH_MIN = 10;

let currentRps   = 1_000;
let matchSeconds = 0;

const PHASES = [
  { start:   0, end:  20, base:  1_000, peak:  6_000, label: 'PRE_MATCH'   },
  { start:  20, end:  30, base:  6_000, peak: 14_000, label: 'KICKOFF'     },
  { start:  30, end:  65, base:  8_000, peak: 16_000, label: 'FIRST_HALF'  },
  { start:  65, end:  80, base:  3_000, peak:  7_000, label: 'HALF_TIME'   },
  { start:  80, end: 115, base:  7_000, peak: 18_500, label: 'SECOND_HALF' },
  { start: 115, end: 130, base:  5_000, peak: 19_000, label: 'FULL_TIME'   },
  { start: 130, end: 150, base:    800, peak:  3_000, label: 'POST_MATCH'  },
];

const GOAL_EVENTS = [42, 67, 88, 104].map(min => ({
  matchMin: min,
  fired: false,
  spikeRps: Math.floor(Math.random() * 3_000 + 17_000),
}));

function getMatchMinute() {
  return matchSeconds / REAL_SECS_PER_MATCH_MIN;
}

function getCurrentPhase(matchMin) {
  return PHASES.find(p => matchMin >= p.start && matchMin < p.end) || PHASES[PHASES.length - 1];
}

function computeTarget(matchMin) {
  const phase    = getCurrentPhase(matchMin);
  const progress = (matchMin - phase.start) / (phase.end - phase.start);
  const wave     = Math.sin(progress * Math.PI);

  for (const goal of GOAL_EVENTS) {
    const dist = matchMin - goal.matchMin;
    if (dist >= 0 && dist < 2) {
      const fade = 1 - (dist / 2);
      return Math.floor(goal.spikeRps * fade + phase.base * (1 - fade));
    }
  }

  const amplitude = phase.peak - phase.base;
  const target    = phase.base + amplitude * wave;
  const noise     = (Math.random() - 0.5) * 0.16 * target;
  return Math.floor(Math.max(500, target + noise));
}

const MAX_STEP_RATIO = 0.18;

function stepToward(current, target) {
  const maxStep = Math.max(200, current * MAX_STEP_RATIO);
  const diff    = target - current;
  const step    = Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
  return Math.floor(current + step);
}

function advanceSimulation() {
  matchSeconds += POLL_MS / 1000;
  const matchMin = getMatchMinute();

  if (matchMin >= MATCH_MIN) {
    matchSeconds = 0;
    GOAL_EVENTS.forEach(g => { g.fired = false; });
    console.log('[sim] Match complete — restarting simulation');
  }

  const target = computeTarget(matchMin);
  currentRps   = stepToward(currentRps, target);

  const phase = getCurrentPhase(matchMin);
  console.log(
    `[sim] ${phase.label.padEnd(12)} | ` +
    `match=${matchMin.toFixed(1).padStart(5)}min | ` +
    `RPS=${String(currentRps).padStart(6)} | ` +
    `target=${String(target).padStart(6)}`
  );
}

setInterval(advanceSimulation, POLL_MS);

function jsonResponse(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(statusCode);
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => data += chunk);
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

const requestListener = async function (req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;
    const method = req.method;

    if (method === 'GET' && (path === '/' || path === '/metrics/rps' || path === '/metrics/current')) {
      const phase = getCurrentPhase(getMatchMinute());
      return jsonResponse(res, 200, {
        rps:    currentRps,
        phase:  phase.label,
        target: computeTarget(getMatchMinute()),
        avgLatency: Math.floor(50 + (currentRps / 100)),
        cpuUsage: Math.min(95, 20 + (currentRps / 100)),
        memoryUsage: Math.min(90, 30 + (currentRps / 150)),
        activeServers: simulatedContainers,
        requestsPerSecond: currentRps,
      });
    }

    if (method === 'GET' && path === '/metrics/alerts') {
      const alerts = [];
      if (currentRps > 15000) {
        alerts.push({ level: 'critical', message: 'RPS exceeding threshold', value: currentRps });
      } else if (currentRps > 10000) {
        alerts.push({ level: 'warning', message: 'High RPS detected', value: currentRps });
      }
      return jsonResponse(res, 200, alerts);
    }

    if (method === 'GET' && path === '/stadium/capacity') {
      return jsonResponse(res, 200, {
        totalCapacity: 80000,
        currentOccupancy: Math.floor(Math.random() * 80000),
        gatesOpen: 6,
        gatesActive: Math.floor(Math.random() * 6) + 1,
      });
    }

    if (method === 'POST' && path === '/scale-up') {
      const body = await readBody(req);
      const add = Number(body?.add ?? 1) || 1;
      simulatedContainers += add;
      lastAction = `scale-up +${add}`;
      console.log(`[mock] POST /scale-up -> +${add} containers (now ${simulatedContainers})`);
      return jsonResponse(res, 200, { action: 'scale-up', added: add, containers: simulatedContainers, message: 'scaled up' });
    }

    if (method === 'POST' && path === '/scale-down') {
      const body = await readBody(req);
      const remove = Number(body?.remove ?? 1) || 1;
      const removed = Math.min(remove, simulatedContainers);
      simulatedContainers = Math.max(0, simulatedContainers - removed);
      lastAction = `scale-down -${removed}`;
      console.log(`[mock] POST /scale-down -> -${removed} containers (now ${simulatedContainers})`);
      return jsonResponse(res, 200, { action: 'scale-down', removed, containers: simulatedContainers, message: 'scaled down' });
    }

    if (method === 'POST' && path === '/admin/scale') {
      const body = await readBody(req);
      const action = body?.action;

      if (action === 'add-server') {
        simulatedContainers += 1;
        lastAction = 'scale-up +1';
        console.log(`[mock] POST /admin/scale -> add-server (now ${simulatedContainers})`);
        return jsonResponse(res, 200, { success: true, activeServers: simulatedContainers, metrics: { avgLatency: 50, cpuUsage: 20, memoryUsage: 30 } });
      } else if (action === 'remove-server' && simulatedContainers > 1) {
        simulatedContainers -= 1;
        lastAction = 'scale-down -1';
        console.log(`[mock] POST /admin/scale -> remove-server (now ${simulatedContainers})`);
        return jsonResponse(res, 200, { success: true, activeServers: simulatedContainers, metrics: { avgLatency: 50, cpuUsage: 20, memoryUsage: 30 } });
      }

      return jsonResponse(res, 400, { error: 'Invalid action' });
    }

    if (method === 'POST' && path === '/admin/ai-analyze') {
      console.log('[mock] POST /admin/ai-analyze -> AI analysis triggered');
      return jsonResponse(res, 200, {
        status: 'analyzed',
        analysis: 'System operating within normal parameters',
        actions: ['Monitoring active'],
        confidence: 0.85,
        serversAdded: 0,
        metricsAfter: {
          avgLatency: 50,
          cpuUsage: 20,
          memoryUsage: 30,
          activeServers: simulatedContainers,
        },
      });
    }

    if (method === 'GET' && path === '/status') {
      const phase = getCurrentPhase(getMatchMinute());
      return jsonResponse(res, 200, {
        simulatedContainers,
        lastAction,
        rps:      currentRps,
        phase:    phase.label,
        matchMin: getMatchMinute().toFixed(1),
      });
    }

    return jsonResponse(res, 404, { error: 'not found', path });
  } catch (err) {
    console.error('[mock] request error', err);
    return jsonResponse(res, 500, { error: err.message });
  }
};

const server = http.createServer(requestListener);
server.listen(5000, '0.0.0.0', () => {
  console.log('Mock Stadium API is running on port 5000');
  console.log('Available routes:');
  console.log('  GET  /, /metrics/rps');
  console.log('  POST /scale-up');
  console.log('  POST /scale-down');
  console.log('  GET  /status');
  console.log('');
  console.log('Simulation parameters:');
  console.log(`  Match duration: ${MATCH_MIN} minutes`);
  console.log(`  Time scale: ${REAL_SECS_PER_MATCH_MIN} real seconds = 1 match minute`);
  console.log(`  Full match plays out in ${(MATCH_MIN * REAL_SECS_PER_MATCH_MIN / 60).toFixed(1)} real minutes`);
  console.log(`  Goal surge minutes: ${GOAL_EVENTS.map(g => g.matchMin).join(', ')}`);
  console.log(`  Poll interval: ${POLL_MS / 1000}s`);
});