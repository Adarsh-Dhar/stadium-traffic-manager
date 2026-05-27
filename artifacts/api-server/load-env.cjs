const fs = require('fs');
const path = require('path');

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const raw = fs.readFileSync(filePath, 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const l = line.trim();
      if (!l || l.startsWith('#')) return;
      const idx = l.indexOf('=');
      if (idx === -1) return;
      const key = l.slice(0, idx).trim();
      let val = l.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    });
  } catch (e) {
    // Best-effort loader — don't crash the process if parsing fails
    // eslint-disable-next-line no-console
    console.warn('Failed to load env from', filePath, e && e.message);
  }
}

// Load local .env first, then parent repo .env as fallback without overwriting existing env values
loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), '../.env'));

// Optionally expose a small marker
process.env.__ENV_LOADED = 'true';
