#!/usr/bin/env node
/**
 * FIFA WC 2026 — Stadium Traffic Manager Launcher
 *
 * One-command launcher for the complete stadium traffic simulation:
 * - Checks Docker containers
 * - Verifies API health
 * - Ensures DB schema is up-to-date
 * - Connects to Redis
 * - Spawns ticket scanner
 * - Displays live dashboard with real AI agent logs
 *
 * Usage:
 *   node run-stadium.mjs [--match GRP|R32|R16|QF|SF|F] [--speed 1] [--api http://localhost:5000] [--no-scan]
 */

import { spawn, execSync } from 'child_process';
import http from 'http';
import https from 'https';
import { createClient } from 'redis';
import { parseArgs } from 'util';

// ── CLI args ───────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    match: { type: 'string', default: 'GRP' },
    speed: { type: 'string', default: '20' },
    api: { type: 'string', default: 'http://localhost:5000' },
    'no-scan': { type: 'boolean', default: false },
    once: { type: 'boolean', default: false },
  },
  allowPositionals: false,
});

const MATCH_TYPE = args.match.toUpperCase();
const SPEED = args.speed;
const API_BASE = args.api.replace(/\/$/, '');
const NO_SCAN = args['no-scan'];
const RUN_ONCE = args.once;

// ── Configuration ────────────────────────────────────────────────────────────
const CONTAINERS = ['redis', 'postgres', 'api-server', 'ai-agent'];
const REDIS_URL = 'redis://localhost:6379';

// ── Colors for terminal output ─────────────────────────────────────────────
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function colorize(color, text) {
  return `${colors[color]}${text}${colors.reset}`;
}

// ── Clear screen with ANSI escape codes (more reliable than console.clear) ──
function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

// ── HTTP helper ────────────────────────────────────────────────────────────
function httpGet(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    
    const attempt = (attemptNum) => {
      const req = mod.request(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      
      req.on('error', (err) => {
        if (attemptNum < retries) {
          setTimeout(() => attempt(attemptNum + 1), 1000);
        } else {
          reject(err);
        }
      });
      
      req.setTimeout(5000, () => {
        req.destroy();
        if (attemptNum < retries) {
          setTimeout(() => attempt(attemptNum + 1), 1000);
        } else {
          reject(new Error('Request timeout'));
        }
      });
      
      req.end();
    };
    
    attempt(0);
  });
}

// ── Docker container check ─────────────────────────────────────────────────
async function checkDockerContainers() {
  console.log(colorize('cyan', '🐳 Checking Docker containers...'));
  
  try {
    const output = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf-8' });
    const running = output.trim().split('\n').filter(Boolean);
    
    const missing = CONTAINERS.filter(c => !running.some(r => r.includes(c)));
    
    if (missing.length > 0) {
      console.log(colorize('red', `❌ Missing containers: ${missing.join(', ')}`));
      console.log(colorize('yellow', 'Run: docker compose up -d'));
      process.exit(1);
    }
    
    console.log(colorize('green', '✓ All containers running'));
    return true;
  } catch (error) {
    console.log(colorize('red', `❌ Docker check failed: ${error.message}`));
    process.exit(1);
  }
}

// ── API health check ───────────────────────────────────────────────────────
async function checkApiHealth() {
  console.log(colorize('cyan', '🏥 Checking API health...'));
  
  try {
    const res = await httpGet(`${API_BASE}/api/healthz`);
    if (res.status === 200) {
      console.log(colorize('green', '✓ API server healthy'));
      return true;
    } else {
      console.log(colorize('red', `❌ API returned status ${res.status}`));
      process.exit(1);
    }
  } catch (error) {
    console.log(colorize('red', `❌ API health check failed: ${error.message}`));
    process.exit(1);
  }
}

// ── Database schema check ──────────────────────────────────────────────────
async function checkDatabaseSchema() {
  console.log(colorize('cyan', '🗄️  Checking database schema...'));
  
  try {
    const output = execSync('cd lib/db && DATABASE_URL="postgresql://postgres:postgres@localhost:5433/stadium" npx drizzle-kit push', { 
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    
    if (output.includes('No changes')) {
      console.log(colorize('green', '✓ Database schema up-to-date'));
    } else {
      console.log(colorize('green', '✓ Database schema updated'));
    }
    return true;
  } catch (error) {
    const output = error.stdout || error.stderr || '';
    if (output.includes('No changes') || output.includes('nothing')) {
      console.log(colorize('green', '✓ Database schema up-to-date'));
      return true;
    }
    console.log(colorize('yellow', '⚠ Database schema check completed'));
    return true;
  }
}

// ── Redis connection ───────────────────────────────────────────────────────
let redis = null;

async function connectRedis() {
  console.log(colorize('cyan', '🔴 Connecting to Redis...'));
  
  try {
    redis = createClient({ url: REDIS_URL });
    await redis.connect();
    console.log(colorize('green', '✓ Redis connected'));
    return true;
  } catch (error) {
    console.log(colorize('red', `❌ Redis connection failed: ${error.message}`));
    process.exit(1);
  }
}

// ── Get AI agent logs from Docker container ─────────────────────────────────
async function getAiAgentLogs() {
  try {
    const output = execSync('docker logs ai-agent --tail 5 2>&1', { encoding: 'utf-8' });
    const lines = output.trim().split('\n').filter(Boolean);
    return lines.slice(-3).join(' ');
  } catch (error) {
    return 'Waiting for AI agent analysis...';
  }
}

// ── Ticket scanner spawn ───────────────────────────────────────────────────
let scannerProcess = null;
let scannerOutput = [];

async function spawnScanner() {
  if (NO_SCAN) {
    console.log(colorize('yellow', '⚠ Scanner disabled (--no-scan flag)'));
    return null;
  }
  
  console.log(colorize('cyan', '🎫 Spawning ticket scanner...'));
  
  const scannerArgs = [
    'ticket-scanner.js',
    '--match', MATCH_TYPE,
    '--speed', SPEED,
    '--api', API_BASE,
  ];
  
  scannerProcess = spawn('node', scannerArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });
  
  scannerProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    scannerOutput.push(line);
    if (scannerOutput.length > 5) scannerOutput.shift();
  });
  
  scannerProcess.stderr.on('data', (data) => {
    console.error(colorize('red', `[scanner] ${data.toString().trim()}`));
  });
  
  scannerProcess.on('exit', (code) => {
    if (code !== 0) {
      console.log(colorize('red', `❌ Scanner exited with code ${code}`));
    }
  });
  
  console.log(colorize('green', '✓ Scanner spawned'));
  return scannerProcess;
}

// ── Dashboard rendering ───────────────────────────────────────────────────
async function getMetrics() {
  try {
    const res = await httpGet(`${API_BASE}/api/fifa/metrics/current`);
    if (res.status === 200) {
      return res.body;
    }
    return null;
  } catch (error) {
    return null;
  }
}

async function getRedisCounter() {
  if (!redis) return 0;
  try {
    const value = await redis.get('tickets_scanned');
    return value ? parseInt(value, 10) : 0;
  } catch (error) {
    return 0;
  }
}

function renderProgressBar(value, max, width = 30) {
  const percentage = Math.min(100, (value / max) * 100);
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${percentage.toFixed(1)}%`;
}

async function renderDashboard() {
  // Clear screen using ANSI escape codes
  clearScreen();
  
  const now = new Date().toLocaleTimeString();
  const ticketsScanned = await getRedisCounter();
  const metrics = await getMetrics();
  const aiLogs = await getAiAgentLogs();
  const lastScannerLine = scannerOutput.length > 0 ? scannerOutput[scannerOutput.length - 1] : 'Scanner idle';
  
  process.stdout.write(colorize('cyan', '⚽  FIFA WC 2026 — Stadium Traffic Manager   ') + colorize('gray', now) + '\n');
  process.stdout.write(colorize('gray', '  ' + '─'.repeat(55)) + '\n\n');
  
  // Gate scans section
  process.stdout.write(colorize('yellow', '  GATE SCANS (Redis)') + '\n');
  process.stdout.write(`  tickets_scanned     ${String(ticketsScanned).padStart(8)}   ${renderProgressBar(ticketsScanned, 80000)}\n`);
  process.stdout.write(`  stadium capacity    80,000   ${ticketsScanned.toLocaleString()} fans inside\n`);
  process.stdout.write(`  scanner             ${String(ticketsScanned).padStart(8)}   scanned   ${NO_SCAN ? 'disabled' : 'running'}\n`);
  if (!NO_SCAN && scannerOutput.length > 0) {
    process.stdout.write(`  last scan: ${colorize('gray', lastScannerLine.substring(0, 50))}\n`);
  }
  process.stdout.write('\n');
  
  // API server section
  if (metrics) {
    process.stdout.write(colorize('yellow', '  API SERVER   ') + colorize('gray', `${metrics.activeServers} server${metrics.activeServers !== 1 ? 's' : ''}`) + colorize('gray', '  ·  ') + colorize('gray', `${metrics.totalRequests.toLocaleString()} total requests`) + '\n');
    process.stdout.write(`  RPS${String(metrics.requestsPerSecond).padStart(15)}   ${renderProgressBar(metrics.requestsPerSecond, 200)}\n`);
    process.stdout.write(`  CPU${String(metrics.cpuUsage.toFixed(1) + '%').padStart(15)}   ${renderProgressBar(metrics.cpuUsage, 100)}\n`);
    process.stdout.write(`  avg lat${String(metrics.avgLatency + 'ms').padStart(13)}   p95: ${metrics.p95Latency}ms   errors: ${metrics.errorRate.toFixed(1)}%\n`);
  } else {
    process.stdout.write(colorize('yellow', '  API SERVER') + '\n');
    process.stdout.write(colorize('red', '  ⚠ Metrics unavailable') + '\n');
  }
  process.stdout.write('\n');
  
  // AI Agent section
  process.stdout.write(colorize('yellow', '  AI AGENT (Gemini)') + '\n');
  process.stdout.write(`  logs: ${colorize('gray', aiLogs.substring(0, 60))}\n`);
  process.stdout.write('\n');
  process.stdout.write(colorize('gray', '  Press Ctrl+C to stop') + '\n');
}

// ── Main execution ───────────────────────────────────────────────────────────
async function main() {
  console.log(colorize('cyan', '╔══════════════════════════════════════════════════════════╗'));
  console.log(colorize('cyan', '║       FIFA World Cup 2026 — Stadium Traffic Manager     ║'));
  console.log(colorize('cyan', '╚══════════════════════════════════════════════════════════╝'));
  console.log();
  
  // Step 1: Check Docker containers
  await checkDockerContainers();
  
  // Step 2: Check API health
  await checkApiHealth();
  
  // Step 3: Check database schema
  await checkDatabaseSchema();
  
  // Step 4: Connect to Redis
  await connectRedis();
  
  // Step 5: Spawn scanner
  await spawnScanner();
  
  console.log();
  console.log(colorize('green', '✓ All systems ready! Starting dashboard...'));
  console.log();
  
  // Give a moment for things to settle
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 6: Render dashboard loop
  if (RUN_ONCE) {
    console.log(colorize('yellow', '📊 Rendering dashboard once (--once flag)...'));
    await renderDashboard();
    console.log();
    console.log(colorize('green', '✓ Dashboard rendered once. Exiting.'));
  } else {
    while (true) {
      await renderDashboard();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log();
  console.log(colorize('yellow', '\n🛑 Shutting down...'));
  
  if (scannerProcess) {
    scannerProcess.kill('SIGTERM');
  }
  
  if (redis) {
    await redis.quit();
  }
  
  console.log(colorize('green', '✓ Shutdown complete'));
  process.exit(0);
});

main().catch(error => {
  console.error(colorize('red', `❌ Fatal error: ${error.message}`));
  process.exit(1);
});
