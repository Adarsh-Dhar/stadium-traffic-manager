/**
 * watchdog.js — Kubernetes Infrastructure Cost Watchdog Agent
 *
 * Polls a metrics endpoint every 5 seconds and automatically scales
 * the 'watchdog-deployment' based on RPS thresholds with cooldown protection.
 *
 * Environment Variables:
 *   METRICS_API_URL        — URL to fetch RPS metric (required)
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
// Configuration (all overridable via environment variables)
// ---------------------------------------------------------------------------
const CONFIG = {
  metricsApiUrl:     process.env.METRICS_API_URL         || 'http://localhost:8080/metrics/rps',
  yellowThreshold:   parseInt(process.env.RPS_YELLOW_THRESHOLD, 10) || 8_500,
  redThreshold:      parseInt(process.env.RPS_RED_THRESHOLD,    10) || 9_500,
  cooldownSeconds:   parseInt(process.env.COOLDOWN_SECONDS,     10) || 300,
  pollIntervalMs:    parseInt(process.env.POLL_INTERVAL_MS,     10) || 5_000,
  namespace:         process.env.K8S_NAMESPACE                  || 'default',
  deploymentName:    process.env.K8S_DEPLOYMENT                 || 'watchdog-deployment',
};

// Replica counts per zone
const REPLICAS = { GREEN: 2, YELLOW: 5, RED: 10 };

// ---------------------------------------------------------------------------
// Kubernetes client setup
// ---------------------------------------------------------------------------
const kc = new k8s.KubeConfig();
kc.loadFromDefault(); // Picks up in-cluster config or ~/.kube/config automatically
const appsV1 = kc.makeApiClient(k8s.AppsV1Api);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentZone       = 'GREEN';
let currentReplicas   = REPLICAS.GREEN;
let lastScaleUpTime   = 0;   // epoch ms of the most recent scale-UP event

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
  const options = { headers: { 'Content-Type': 'application/strategic-merge-patch+json' } };

  await appsV1.patchNamespacedDeployment(
    CONFIG.deploymentName,
    CONFIG.namespace,
    patch,
    undefined, // pretty
    undefined, // dryRun
    undefined, // fieldManager
    undefined, // fieldValidation
    undefined, // force
    options,
  );
}

// ---------------------------------------------------------------------------
// Cooldown logic
// ---------------------------------------------------------------------------
function isScaleDown(targetReplicas) {
  return targetReplicas < currentReplicas;
}

function isCooldownActive() {
  const elapsed = (Date.now() - lastScaleUpTime) / 1_000; // seconds
  return elapsed < CONFIG.cooldownSeconds;
}

function remainingCooldown() {
  const elapsed = (Date.now() - lastScaleUpTime) / 1_000;
  return Math.ceil(CONFIG.cooldownSeconds - elapsed);
}

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
  const targetReplicas = REPLICAS[zone];
  const zoneChanged    = zone !== currentZone;

  // 3. Emit zone-level log
  if (zone === 'GREEN') {
    log.info(`RPS=${rps.toLocaleString()}  →  Zone=GREEN  |  Replicas target=${targetReplicas}`);
  } else if (zone === 'YELLOW') {
    log.warn(`RPS=${rps.toLocaleString()}  →  Zone=YELLOW  |  High traffic detected. Replicas target=${targetReplicas}`);
  } else {
    log.critical(`RPS=${rps.toLocaleString()}  →  Zone=RED  |  CRITICAL traffic spike! Replicas target=${targetReplicas}`);
  }

  // 4. Decide whether to patch
  if (targetReplicas === currentReplicas) {
    if (zoneChanged) log.info(`Zone changed to ${zone} but replica count unchanged (${currentReplicas}). No patch needed.`);
    currentZone = zone;
    return;
  }

  if (isScaleDown(targetReplicas)) {
    if (isCooldownActive()) {
      log.warn(
        `Scale-down SUPPRESSED by cooldown. ` +
        `Desired=${targetReplicas}, Current=${currentReplicas}, ` +
        `Cooldown remaining=${remainingCooldown()}s`
      );
      currentZone = zone; // track zone even if we don't act
      return;
    }
    log.info(`Cooldown elapsed. Proceeding with scale-down: ${currentReplicas} → ${targetReplicas}`);
  } else {
    log.info(`Scaling UP: ${currentReplicas} → ${targetReplicas} (Zone=${zone})`);
    lastScaleUpTime = Date.now();
  }

  // 5. Apply the patch
  try {
    await patchReplicas(targetReplicas);
    log.info(
      `✓ Successfully patched ${CONFIG.namespace}/${CONFIG.deploymentName} ` +
      `spec.replicas=${targetReplicas}`
    );
    currentReplicas = targetReplicas;
    currentZone     = zone;
  } catch (err) {
    // Detailed error output for Kubernetes API failures
    log.error(
      `Kubernetes API call FAILED — deployment NOT patched.\n` +
      `  Deployment : ${CONFIG.namespace}/${CONFIG.deploymentName}\n` +
      `  Target     : ${targetReplicas} replicas\n` +
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
  log.info(`  YELLOW threshold : RPS ≥ ${CONFIG.yellowThreshold.toLocaleString()}  →  ${REPLICAS.YELLOW} replicas`);
  log.info(`  RED threshold    : RPS ≥ ${CONFIG.redThreshold.toLocaleString()}  →  ${REPLICAS.RED} replicas`);
  log.info(`  Cooldown         : ${CONFIG.cooldownSeconds}s`);
  log.info('═══════════════════════════════════════════════════');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
(async () => {
  printBanner();

  // Run one tick immediately, then start the interval
  await tick();
  setInterval(tick, CONFIG.pollIntervalMs);
})();