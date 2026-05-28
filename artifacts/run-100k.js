#!/usr/bin/env node
// Wrapper to allow running the load-testing script from the artifacts directory.
// Usage: from `artifacts` run `node run-100k.js` (or set env vars then run).
try {
  require('../load-testing/run-100k.js');
} catch (err) {
  console.error('Failed to run ../load-testing/run-100k.js:', err);
  process.exit(1);
}
