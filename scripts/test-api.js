#!/usr/bin/env node

/**
 * Integration Test Script for FIFA Stadium Traffic Management API
 * Tests the entire API without requiring Jest/complex setup
 */

import http from 'http';
import { spawn, exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_PORT = 5000;
const API_HOST = 'localhost';

class APITester {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.apiProcess = null;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: API_HOST,
        port: API_PORT,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data ? JSON.parse(data) : null,
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: data,
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  async assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  async assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual}. ${message}`);
    }
  }

  log(message) {
    console.log(`  ${message}`);
  }

  async checkServerReady(maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.request('GET', '/api/healthz');
        if (response.status === 200) {
          return true;
        }
      } catch (e) {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('Server did not start within timeout');
  }

  async runTests() {
    console.log('\n🚀 Starting API Server Tests\n');

    // Start API server
    try {
      await this.startServer();
      console.log(`✓ API Server started on http://${API_HOST}:${API_PORT}\n`);
    } catch (error) {
      console.error(`❌ Failed to start API server: ${error.message}`);
      process.exit(1);
    }

    // Run all tests
    for (const test of this.tests) {
      try {
        console.log(`📝 ${test.name}`);
        await test.fn();
        this.passed++;
        console.log(`   ✅ PASSED\n`);
      } catch (error) {
        this.failed++;
        console.log(`   ❌ FAILED: ${error.message}\n`);
      }
    }

    // Stop server
    this.stopServer();

    // Print summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Total Tests: ${this.passed + this.failed}`);
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`Pass Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
    console.log(`${'='.repeat(50)}\n`);

    process.exit(this.failed > 0 ? 1 : 0);
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      const apiServerPath = path.join(__dirname, '../artifacts/api-server');

      this.apiProcess = spawn('node', ['--enable-source-maps', './dist/index.mjs'], {
        cwd: apiServerPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          LOG_LEVEL: 'error',
          PORT: API_PORT.toString(),
        },
      });

      let startupError = '';

      this.apiProcess.stderr.on('data', (data) => {
        startupError += data.toString();
      });

      this.apiProcess.on('error', (error) => {
        reject(error);
      });

      this.apiProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`Server exited with code ${code}: ${startupError}`));
        }
      });

      // Check if server is ready
      this.checkServerReady()
        .then(resolve)
        .catch(reject);
    });
  }

  stopServer() {
    if (this.apiProcess) {
      this.apiProcess.kill();
    }
  }
}

// Create tester instance
const tester = new APITester();

// ============================================================================
// Test Suite: Health Check
// ============================================================================

tester.test('Health Check - Should return 200 status', async function () {
  const response = await tester.request('GET', '/api/healthz');
  tester.log(`Status: ${response.status}`);
  await tester.assertEqual(response.status, 200, 'Expected 200 status');
});

tester.test('Health Check - Should return valid JSON', async function () {
  const response = await tester.request('GET', '/api/healthz');
  tester.log(`Response Body: ${JSON.stringify(response.body)}`);
  await tester.assert(response.body !== null, 'Response should be valid JSON');
  await tester.assert(response.body.status === 'ok', 'Status should be "ok"');
});

tester.test('Health Check - Should include proper Content-Type', async function () {
  const response = await tester.request('GET', '/api/healthz');
  const contentType = response.headers['content-type'];
  tester.log(`Content-Type: ${contentType}`);
  await tester.assert(contentType.includes('application/json'), 'Should be JSON');
});

// ============================================================================
// Test Suite: CORS Support
// ============================================================================

tester.test('CORS - Should include Access-Control headers', async function () {
  const response = await tester.request('GET', '/api/healthz');
  const corsHeader = response.headers['access-control-allow-origin'];
  tester.log(`CORS Header: ${corsHeader}`);
  await tester.assert(corsHeader !== undefined, 'CORS header should exist');
});

// ============================================================================
// Test Suite: Error Handling
// ============================================================================

tester.test('Error Handling - Should return 404 for unknown routes', async function () {
  const response = await tester.request('GET', '/api/unknown');
  tester.log(`Status for unknown route: ${response.status}`);
  await tester.assert(response.status === 404, 'Should return 404 for unknown route');
});

// ============================================================================
// Test Suite: Performance
// ============================================================================

tester.test('Performance - Health check should be fast', async function () {
  const startTime = Date.now();
  await tester.request('GET', '/api/healthz');
  const endTime = Date.now();
  const responseTime = endTime - startTime;

  tester.log(`Response time: ${responseTime}ms`);
  await tester.assert(responseTime < 1000, 'Response should be under 1000ms');
});

tester.test('Performance - Should handle concurrent requests', async function () {
  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < 10; i++) {
    promises.push(tester.request('GET', '/api/healthz'));
  }

  const responses = await Promise.all(promises);
  const endTime = Date.now();
  const totalTime = endTime - startTime;
  const successCount = responses.filter((r) => r.status === 200).length;

  tester.log(`Concurrent requests: ${successCount}/10 successful in ${totalTime}ms`);
  await tester.assert(successCount >= 9, 'At least 9 of 10 requests should succeed');
});

// ============================================================================
// Test Suite: HTTP Methods
// ============================================================================

tester.test('HTTP Methods - Should support GET', async function () {
  const response = await tester.request('GET', '/api/healthz');
  tester.log(`GET /api/healthz returned ${response.status}`);
  await tester.assert(response.status === 200, 'GET should work');
});

tester.test('HTTP Methods - Should handle OPTIONS for CORS preflight', async function () {
  const response = await tester.request('OPTIONS', '/api/healthz');
  tester.log(`OPTIONS /api/healthz returned ${response.status}`);
  await tester.assert([200, 204].includes(response.status), 'OPTIONS should return 200 or 204');
});

// ============================================================================
// Run all tests
// ============================================================================

tester.runTests();
