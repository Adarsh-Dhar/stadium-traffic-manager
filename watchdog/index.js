/**
 * watchdog.js — Kubernetes Infrastructure Cost Watchdog Agent
 *
 * Computes desired replicas as ceil(RPS / RPS_PER_REPLICA), then clamps
 * the value to the [MIN_REPLICAS, MAX_REPLICAS] range. Zone classification
 * (GREEN/YELLOW/RED) is thresholds-only and used for informational logging;
 * replicas are formula-driven.
 *
 * Environment Variables:
 *   METRICS_API_URL        — URL to fetch RPS metric (required)
 *   RPS_PER_REPLICA        — RPS capacity per pod (default: 1000)
 *   MIN_REPLICAS           — Minimum replicas floor (default: 2)
 *   MAX_REPLICAS           — Maximum replicas ceiling (default: 15)
 *   RPS_YELLOW_THRESHOLD   — RPS floor for YELLOW zone (default: 8500)
 *   RPS_RED_THRESHOLD      — RPS floor for RED zone    (default: 9500)
 *   COOLDOWN_SECONDS       — Scale-down cooldown in seconds (default: 300)
 *   POLL_INTERVAL_MS       — Polling interval in ms (default: 5000)
 *   K8S_NAMESPACE          — Target namespace (default: "default")
 *   K8S_DEPLOYMENT         — Target deployment name (default: "watchdog-deployment")
 */

'use strict';

const k8s = require('@kubernetes/client-node');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CONFIG = {
  metricsApiUrl:     process.env.METRICS_API_URL         || 'http://localhost:5000',
  yellowThreshold:   parseInt(process.env.RPS_YELLOW_THRESHOLD, 10) || 8_500,
  redThreshold:      parseInt(process.env.RPS_RED_THRESHOLD,    10) || 9_500,
  cooldownSeconds:   parseInt(process.env.COOLDOWN_SECONDS,     10) || 300,
  pollIntervalMs:    parseInt(process.env.POLL_INTERVAL_MS,     10) || 5_000,
  namespace:         process.env.K8S_NAMESPACE                  || 'default',
  deploymentName:    process.env.K8S_DEPLOYMENT                 || 'watchdog-deployment',
  rpsPerReplica:     parseInt(process.env.RPS_PER_REPLICA,      10) || 1_000,
  minReplicas:       parseInt(process.env.MIN_REPLICAS,         10) || 2,
  maxReplicas:       parseInt(process.env.MAX_REPLICAS,         10) || 15,
};

// ---------------------------------------------------------------------------
// Kubernetes client setup
// ---------------------------------------------------------------------------
const kc = new k8s.KubeConfig();
kc.loadFromDefault();
const appsV1 = kc.makeApiClient(k8s.AppsV1Api);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentZone     = 'GREEN';
let currentReplicas = CONFIG.minReplicas;
let lastScaleUpTime = 0;   // epoch ms of the most recent scale-UP event

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
const timestamp = () => new Date().toISOString();

const log = {
  info:     (msg) => console.log (`[${timestamp()}] [INFO ]  ${msg}`),
  warn:     (msg) => console.warn(`[${timestamp()}] [WARN ]  ${msg}`),
  critical: (msg) => console.error(`[${timestamp()}] [CRIT ]  ${msg}`),
  error:    (msg) => console.error(`[${timestamp()}] [ERROR]  ${msg}`),
};

// ---------------------------------------------------------------------------
// Zone classification
// ---------------------------------------------------------------------------
function classifyZone(rps) {
  if (rps >= CONFIG.redThreshold)    return 'RED';
  if (rps >= CONFIG.yellowThreshold) return 'YELLOW';
  return 'GREEN';
}

function computeDesiredReplicas(rps) {
  const raw     = Math.ceil(rps / CONFIG.rpsPerReplica);
  const clamped = Math.max(CONFIG.minReplicas, Math.min(CONFIG.maxReplicas, raw));
  return { raw, clamped };
}

function describeAction(target, current, raw, capped) {
  if (capped && raw > CONFIG.maxReplicas) {
    return `Maxed: Reaches hard ceiling limit (${CONFIG.maxReplicas})`;
  }
  if (target === current) {
    return target === CONFIG.minReplicas
      ? `Steady: Stays at minimum floor (${CONFIG.minReplicas})`
      : `Steady: No replica change needed`;
  }
  if (target > current) {
    const added = target - current;
    return `Scale Up: Adds ${added} container${added !== 1 ? 's' : ''}`;
  }
  const removed = current - target;
  return `Scale Down: Subtracts ${removed} container${removed !== 1 ? 's' : ''}`;
}

// ---------------------------------------------------------------------------
// Metrics ingestion
// ---------------------------------------------------------------------------
async function fetchRps() {
  const res = await fetch(CONFIG.metricsApiUrl, { signal: AbortSignal.timeout(4_000) });

  if (!res.ok) {
    throw new Error(`Metrics API responded with HTTP ${res.status} ${res.statusText}`);
  }

  const body = await res.json();

  // Accept { rps: <number> } or a bare number
  const rps = typeof body === 'number' ? body : Number(body?.rps);
  if (!isFinite(rps)) {
    throw new Error(`Unexpected metrics payload: ${JSON.stringify(body)}`);
  }

  return rps;
}

// ---------------------------------------------------------------------------
// Kubernetes — patch deployment replica count
// ---------------------------------------------------------------------------
async function patchReplicas(targetReplicas) {
  const patch = { spec: { replicas: targetReplicas } };
  // Use strategic-merge-patch so only `spec.replicas` is touched
  await appsV1.patchNamespacedDeployment({
    name: CONFIG.deploymentName,
    namespace: CONFIG.namespace,
    body: patch,
    headers: { 'Content-Type': 'application/strategic-merge-patch+json' },
  });
}

// ---------------------------------------------------------------------------
// Cooldown logic
// ---------------------------------------------------------------------------
function isScaleDown(target)  { return target < currentReplicas; }
function isCooldownActive()   { return ((Date.now() - lastScaleUpTime) / 1_000) < CONFIG.cooldownSeconds; }
function remainingCooldown()  { return Math.ceil(CONFIG.cooldownSeconds - (Date.now() - lastScaleUpTime) / 1_000); }

// ---------------------------------------------------------------------------
// Core decision & action loop (called once per poll tick)
// ---------------------------------------------------------------------------
async function tick() {
  // 1. Fetch metrics
  let rps;
  try {
    rps = await fetchRps();
  } catch (err) {
    log.error(`Failed to fetch RPS metrics — skipping tick. Reason: ${err.message}`);
    return;
  }

  // 2. Classify zone
  const zone           = classifyZone(rps);
    const { raw, clamped: target } = computeDesiredReplicas(rps);
    const wasCapped                = target !== raw;
  const zoneChanged    = zone !== currentZone;

    // 3. Emit zone-level log
    const formulaStr = `${rps.toLocaleString()} / ${CONFIG.rpsPerReplica} = ${(rps / CONFIG.rpsPerReplica).toFixed(1)} → ${raw}${wasCapped ? ` (capped at ${CONFIG.maxReplicas})` : ''}`;
    const actionStr  = describeAction(target, currentReplicas, raw, wasCapped);
    if (zone === 'GREEN') {
      log.info(`RPS=${rps.toLocaleString()}  Zone=GREEN   | Formula: ${formulaStr} | Desired=${target} | Action: ${actionStr}`);
    } else if (zone === 'YELLOW') {
      log.warn(`RPS=${rps.toLocaleString()}  Zone=YELLOW  | Formula: ${formulaStr} | Desired=${target} | Action: ${actionStr}`);
    } else {
      log.critical(`RPS=${rps.toLocaleString()}  Zone=RED     | Formula: ${formulaStr} | Desired=${target} | Action: ${actionStr}`);
    }

  // 4. Decide whether to patch
    if (target === currentReplicas) {
    if (zoneChanged) log.info(`Zone changed to ${zone} but replica count unchanged (${currentReplicas}). No patch needed.`);
    currentZone = zone;
    return;
  }

    if (isScaleDown(target)) {
    if (isCooldownActive()) {
      log.warn(
        `Scale-down SUPPRESSED by cooldown. ` +
          `Desired=${target}, Current=${currentReplicas}, ` +
        `Cooldown remaining=${remainingCooldown()}s`
      );
      currentZone = zone; // track zone even if we don't act
      return;
    }
      log.info(`Cooldown elapsed. Proceeding with scale-down: ${currentReplicas} → ${target}`);
  } else {
      log.info(`Scaling UP: ${currentReplicas} → ${target} (Zone=${zone})`);
    lastScaleUpTime = Date.now();
  }

  // 5. Apply the patch
  try {
      await patchReplicas(target);
      log.info(
        `✓ Successfully patched ${CONFIG.namespace}/${CONFIG.deploymentName} ` +
          `spec.replicas=${target}  [${currentReplicas} → ${target}]`
      );
      currentReplicas = target;
    currentZone     = zone;
  } catch (err) {
    // Detailed error output for Kubernetes API failures
    log.error(
      `Kubernetes API call FAILED — deployment NOT patched.\n` +
      `  Deployment : ${CONFIG.namespace}/${CONFIG.deploymentName}\n` +
        `  Target     : ${target} replicas\n` +
      `  HTTP Status: ${err?.response?.statusCode ?? 'N/A'}\n` +
      `  Body       : ${JSON.stringify(err?.body ?? err?.message)}`
    );
  }
}

// ---------------------------------------------------------------------------
// Startup banner
// ---------------------------------------------------------------------------
function printBanner() {
  log.info('═══════════════════════════════════════════════════');
  log.info('  Kubernetes Watchdog Agent  —  starting');
  log.info('═══════════════════════════════════════════════════');
  log.info(`  Deployment  : ${CONFIG.namespace}/${CONFIG.deploymentName}`);
  log.info(`  Metrics URL : ${CONFIG.metricsApiUrl}`);
  log.info(`  Poll interval    : ${CONFIG.pollIntervalMs}ms`);
  log.info(`  Formula       : ceil(RPS / ${CONFIG.rpsPerReplica})`);
  log.info(`  Replica range : [${CONFIG.minReplicas}, ${CONFIG.maxReplicas}]`);
  log.info(`  YELLOW zone   : RPS ≥ ${CONFIG.yellowThreshold.toLocaleString()}`);
  log.info(`  RED zone      : RPS ≥ ${CONFIG.redThreshold.toLocaleString()}`);
  log.info(`  Cooldown         : ${CONFIG.cooldownSeconds}s`);
  log.info('═══════════════════════════════════════════════════');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
(async () => {
  printBanner();

  await tick();
  setInterval(tick, CONFIG.pollIntervalMs);
})();