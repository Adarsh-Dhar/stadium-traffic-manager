#!/usr/bin/env node
// scripts/demo-health-check.js — pre-demo preflight checker

import fs from 'fs';
import net from 'net';
import path from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

function ok(s) { return `\u2705 ${s}`; } // ✅
function warn(s) { return `\u26A0\uFE0F ${s}`; } // ⚠️
function fail(s) { return `\u274C ${s}`; } // ❌

function nodeOk() {
  const ver = process.version.replace(/^v/, '');
  const major = Number(ver.split('.')[0]);
  return { ver, ok: major >= 18 };
}

async function commandExists(cmd) {
  try { await exec(`${cmd} --version`); return true; } catch (e) { return false; }
}

async function portFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => { resolve(false); });
    server.once('listening', () => { server.close(); resolve(true); });
    server.listen(port, '127.0.0.1');
  });
}

const fileExists = (p) => fs.existsSync(p);

async function main() {
  const checks = [];
  const root = process.cwd();

  // Node check
  const n = nodeOk();
  checks.push(n.ok ? ok(`Node ${n.ver}`) : fail(`Node ${n.ver} (>=18 required)`));

  // pnpm
  const hasPnpm = await commandExists('pnpm');
  checks.push(hasPnpm ? ok('pnpm available') : fail('pnpm not found (install from https://pnpm.io)'));

  // k6 (warning)
  const hasK6 = await commandExists('k6');
  checks.push(hasK6 ? ok('k6 available') : warn('k6 not installed (optional)'));

  // Build artifact
  const dist = path.join(root, 'artifacts', 'api-server', 'dist', 'index.mjs');
  if (!fileExists(dist)) checks.push(fail(`API build missing: ${dist}`)); else checks.push(ok(`API build present`));

  // .env
  const envFile = path.join(root, '.env');
  const envExample = path.join(root, '.env.example');
  if (fileExists(envFile)) checks.push(ok('.env present'));
  else if (fileExists(envExample)) checks.push(warn('.env missing — .env.example present (create .env)'));
  else checks.push(fail('.env missing and .env.example not found'));

  // GEMINI_API_KEY (warning only)
  const gem = process.env.GEMINI_API_KEY;
  if (gem && !/replace|your_key|xxx/i.test(gem)) checks.push(ok('GEMINI_API_KEY present'));
  else checks.push(warn('GEMINI_API_KEY missing or placeholder (optional)'));

  // Dynatrace vars (warning only)
  ['DYNATRACE_ENV_ID', 'DYNATRACE_API_TOKEN', 'DYNATRACE_CLUSTER_URL'].forEach(v => {
    if (process.env[v]) checks.push(ok(`${v} set`)); else checks.push(warn(`${v} not set (optional)`));
  });

  // Ports
  const p5000 = await portFree(5000);
  const p5173 = await portFree(5173);
  checks.push(p5000 ? ok('port 5000 free') : fail('port 5000 in use'));
  checks.push(p5173 ? ok('port 5173 free') : fail('port 5173 in use'));

  // If API running, ping it
  const apiBase = process.env.API_BASE || 'http://localhost:5000';
  let apiUp = false;
  try {
    const r = await fetch(`${apiBase}/api/healthz`);
    if (r.ok) { apiUp = true; checks.push(ok('API responding at /api/healthz')); }
    else checks.push(warn(`/api/healthz responded ${r.status}`));
  } catch (e) { checks.push(warn('API not responding at /api/healthz')); }

  if (apiUp) {
    try {
      const rm = await fetch(`${apiBase}/api/fifa/metrics/current`);
      if (rm.ok) checks.push(ok('/api/fifa/metrics/current OK')); else checks.push(warn(`/api/fifa/metrics/current ${rm.status}`));
    } catch (e) { checks.push(warn('/api/fifa/metrics/current unreachable')); }
  }

  // Print summary
  console.log('\nPre-demo health check:');
  checks.forEach(c => console.log(' -', c));

  const hasHardFail = checks.some(s => s.startsWith('\u274C'));
  if (hasHardFail) {
    console.error('\nOne or more hard blockers were detected. Fix them and retry.');
    process.exit(1);
  }
  console.log('\nNo hard blockers detected. Warnings shown as ⚠️. Ready to proceed.');
  process.exit(0);
}

main();
