#!/usr/bin/env node
// scripts/e2e-demo.js
// Automated end-to-end demo runner

(async () => {
  // Dual-mode loader: works when file is run as CommonJS or as ESM
  let fs, path, child_process, util;
  if (typeof require !== 'undefined') {
    fs = require('fs');
    path = require('path');
    child_process = require('child_process');
    util = require('util');
  } else {
    const fsMod = await import('fs');
    fs = fsMod.default || fsMod;
    const pathMod = await import('path');
    path = pathMod.default || pathMod;
    const cpMod = await import('child_process');
    child_process = cpMod.default || cpMod;
    const utilMod = await import('util');
    util = utilMod.default || utilMod;
  }

  const spawn = child_process.spawn;
  const exec = util && util.promisify ? util.promisify(child_process.exec) : null;

  const ROOT = path.resolve(process.cwd());
  const API_DIR = path.join(ROOT, 'artifacts', 'api-server');
  const DEFAULT_BASE = process.env.API_BASE || 'http://localhost:5000';

  function parseArgs() {
    const args = process.argv.slice(2);
    const result = { intensity: 'high', duration: 90, noStartServer: false };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--no-start-server') result.noStartServer = true;
      else if (a === '--intensity' && args[i + 1]) { result.intensity = args[++i]; }
      else if (a === '--duration' && args[i + 1]) { result.duration = Number(args[++i]); }
      else if (a.startsWith('--intensity=')) result.intensity = a.split('=')[1];
      else if (a.startsWith('--duration=')) result.duration = Number(a.split('=')[1]);
    }
    return result;
  }

  const args = parseArgs();

  function ts() { return new Date().toISOString(); }

  async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function spawnServer() {
    console.log(`[${ts()}] Starting API server from ${API_DIR}`);
    const nodeArgs = ['-r', './load-env.cjs', '--enable-source-maps', './dist/index.mjs'];
    const proc = spawn(process.execPath, nodeArgs, {
      cwd: API_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    proc.stdout.on('data', d => process.stdout.write(`[api] ${d}`));
    proc.stderr.on('data', d => process.stderr.write(`[api ERR] ${d}`));
    proc.on('exit', (code, sig) => console.log(`[${ts()}] API server exited ${code || sig}`));
    return proc;
  }

  async function waitForHealth(base = DEFAULT_BASE, timeoutMs = 60_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`${base}/api/healthz`);
        if (res.ok) return true;
      } catch (e) {
        // ignore
      }
      await sleep(1000);
    }
    return false;
  }

  async function getMetrics(base = DEFAULT_BASE) {
    try {
      const res = await fetch(`${base}/api/fifa/metrics/current`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  function asciiBar(value, max = 100, width = 30) {
    const v = Math.max(0, Math.min(max, Math.round(value)));
    const filled = Math.round((v / max) * width);
    return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + `] ${v}`;
  }

  async function postJson(path, body = {}) {
    const res = await fetch(`${DEFAULT_BASE}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    return res.ok ? await res.json().catch(()=>null) : null;
  }

  // Main flow
  let serverProc = null;
  let overallPass = true;
  const startTime = Date.now();

  try {
    if (!args.noStartServer) {
      // If dist exists, spawn server
      const distPath = path.join(API_DIR, 'dist', 'index.mjs');
      if (!fs.existsSync(distPath)) {
        console.error(`[${ts()}] ERROR: ${distPath} not found. Run pnpm --filter @workspace/api-server run build`);
        process.exitCode = 1; return;
      }
      serverProc = await spawnServer();
    }

    console.log(`[${ts()}] Waiting for health...`);
    const healthy = await waitForHealth();
    if (!healthy) { console.error('Health check failed'); overallPass = false; throw new Error('health timeout'); }
    console.log(`[${ts()}] API healthy`);

    const initialMetrics = await getMetrics();
    console.log(`[${ts()}] initial metrics:`, initialMetrics || '<no metrics>');
    if (!initialMetrics) { overallPass = false; throw new Error('metrics missing'); }

    // Reset baseline
    const reset = await postJson('/api/fifa/admin/reset', {});
    console.log(`[${ts()}] reset result:`, reset || '<no result>');
    if (!reset || typeof reset.cpu === 'undefined') { overallPass = false; throw new Error('reset failed'); }

    const baselineCpu = reset.cpu ?? (initialMetrics.cpu ?? 0);
    const baselineLatency = reset.latency ?? (initialMetrics.latency ?? 0);
    const baselineServers = reset.serverCount ?? (initialMetrics.serverCount ?? 1);

    if (!(baselineCpu < 30 && baselineLatency < 100 && baselineServers === 1)) {
      console.warn(`[${ts()}] Baseline not within expected thresholds: cpu=${baselineCpu} latency=${baselineLatency} servers=${baselineServers}`);
    }

    // Start simulation
    console.log(`[${ts()}] Starting simulation intensity=${args.intensity} duration=${args.duration}s`);
    const sim = await postJson('/api/fifa/simulation/start', { intensity: args.intensity, duration: args.duration });
    if (!sim) { overallPass = false; throw new Error('simulation start failed'); }

    // Poll metrics every 3s printing ASCII bar chart
    let degraded = false;
    let sawScaleUp = false;
    const degradationThresholds = { cpu: 60, latency: 800, errorRate: 0.02 };

    const pollStart = Date.now();
    while (true) {
      const metrics = await getMetrics();
      if (!metrics) { console.log(`[${ts()}] metrics unavailable`); }
      const cpu = metrics?.cpu ?? 0;
      const latency = metrics?.latency ?? 0;
      const errorRate = metrics?.errorRate ?? 0;
      const serverCount = metrics?.serverCount ?? baselineServers;

      console.log(`[${ts()}] CPU: ${asciiBar(cpu,100,30)} Latency(ms): ${asciiBar(Math.min(latency,2000),2000,20)} ErrorRate: ${(errorRate*100).toFixed(2)}% Servers: ${serverCount}`);

      if (serverCount > baselineServers) sawScaleUp = true;

      if (cpu > degradationThresholds.cpu || latency > degradationThresholds.latency || errorRate > degradationThresholds.errorRate) {
        degraded = true;
        console.log(`[${ts()}] Degradation threshold crossed (cpu>${degradationThresholds.cpu} or lat>${degradationThresholds.latency} or err>${degradationThresholds.errorRate})`);
        break;
      }

      if ((Date.now() - pollStart) / 1000 > args.duration + 10) {
        console.log(`[${ts()}] Poll timeout reached`);
        break;
      }
      await sleep(3000);
    }

    // Ask AI to analyze the situation
    try {
      const ai = await postJson('/api/fifa/admin/ai-analyze', { context: { intensity: args.intensity } });
      console.log(`[${ts()}] AI analysis:`, ai && (ai.text || ai.analysis) ? ai : '<no ai text>');
    } catch (e) { console.warn('AI analyze failed', e.message); }

    // Verify server scaled
    if (!sawScaleUp) {
      console.warn(`[${ts()}] WARN: server count did not increase during simulation`);
    }

    // Wait for recovery: CPU <55 and latency <600
    const recoveryStart = Date.now();
    let recovered = false;
    while ((Date.now() - recoveryStart) / 1000 < 300) {
      const m = await getMetrics();
      const cpu = m?.cpu ?? 0; const latency = m?.latency ?? 0;
      if (cpu < 55 && latency < 600) { recovered = true; break; }
      console.log(`[${ts()}] waiting for recovery - cpu=${cpu} lat=${latency}`);
      await sleep(3000);
    }

    if (!recovered) {
      console.warn(`[${ts()}] Recovery not observed within timeout`);
    }

    // Stop simulation
    await postJson('/api/fifa/simulation/stop', {});

    // Fetch alerts and validate expected events
    try {
      const alertsRes = await fetch(`${DEFAULT_BASE}/api/fifa/metrics/alerts`);
      const alerts = alertsRes.ok ? await alertsRes.json() : [];
      const hasSimStart = alerts.some(a => String(a.type||'').toLowerCase().includes('simulation') || JSON.stringify(a).toLowerCase().includes('simulation-start'));
      const hasCritical = alerts.some(a => String(a.severity||'').toLowerCase().includes('critical') || JSON.stringify(a).toLowerCase().includes('critical'));
      const hasAiScale = alerts.some(a => JSON.stringify(a).toLowerCase().includes('ai') && JSON.stringify(a).toLowerCase().includes('scale'));
      console.log(`[${ts()}] alerts summary: simStart=${hasSimStart} critical=${hasCritical} aiScale=${hasAiScale}`);
      if (!(hasSimStart && hasCritical && (hasAiScale || sawScaleUp))) {
        console.warn(`[${ts()}] Some expected alert events were not found`);
      }
    } catch (e) { console.warn('alerts fetch failed', e.message); }

  } catch (err) {
    console.error(`[${ts()}] ERROR:`, err && err.message);
    overallPass = false;
  } finally {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[${ts()}] Demo run complete — elapsed ${elapsed}s — ${overallPass ? 'PASS' : 'FAIL'}`);
    if (serverProc) {
      try { serverProc.kill(); } catch (e) { /* ignore */ }
    }
    process.exit(overallPass ? 0 : 1);
  }

})();
