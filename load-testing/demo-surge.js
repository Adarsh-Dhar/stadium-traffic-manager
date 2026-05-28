import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Gauge } from 'k6/metrics';

export const fifa_errors = new Counter('fifa_errors');
export const fifa_response_time = new Trend('fifa_response_time');
export const fifa_active_vus = new Gauge('fifa_active_vus');
export const fifa_overloaded_503 = new Counter('fifa_overloaded_503');

export const options = {
  stages: [
    { duration: '15s', target: 100 },
    { duration: '20s', target: 500 },
    { duration: '20s', target: 2000 },
    { duration: '25s', target: 4000 },
    { duration: '20s', target: 5000 },
    { duration: '20s', target: 0 }
  ],
  thresholds: {
    'http_req_duration': ['p(95)<10000'],
    'fifa_errors': ['rate<0.5']
  }
};

const API_BASE = __ENV.API_BASE || 'http://localhost:5000/api/fifa';

export default function () {
  fifa_active_vus.add(__VU);

  // 1) GET /stadium/capacity
  let r = http.get(`${API_BASE}/stadium/capacity`);
  fifa_response_time.add(r.timings.duration);
  check(r, { 'capacity 200': (res) => res.status === 200 });
  if (r.status !== 200) { fifa_errors.add(1); }

  // 2) POST /ticket/validate
  r = http.post(`${API_BASE}/ticket/validate`, JSON.stringify({ ticketId: `T-${__VU}-${__ITER}` }), { headers: { 'Content-Type': 'application/json' } });
  fifa_response_time.add(r.timings.duration);
  if (r.status === 503) fifa_overloaded_503.add(1);
  if (r.status !== 200) { fifa_errors.add(1); }

  // 3) POST /ticket/scan
  r = http.post(`${API_BASE}/ticket/scan`, JSON.stringify({ gate: 'G1', ticketId: `T-${__VU}-${__ITER}` }), { headers: { 'Content-Type': 'application/json' } });
  fifa_response_time.add(r.timings.duration);
  if (r.status === 503) fifa_overloaded_503.add(1);
  if (r.status !== 200) { fifa_errors.add(1); }

  sleep(1);
}

export function handleSummary(data) {
  const summary = {
    vus: data.metrics.vus ? data.metrics.vus.count : undefined,
    http_reqs: data.metrics.http_reqs ? data.metrics.http_reqs.total : undefined,
    throughput: data.metrics.http_reqs ? (data.metrics.http_reqs.mean ? data.metrics.http_reqs.mean : undefined) : undefined,
    p95: data.metrics.http_req_duration ? data.metrics.http_req_duration['p(95)'] : undefined,
    p99: data.metrics.http_req_duration ? data.metrics.http_req_duration['p(99)'] : undefined,
    errors: data.metrics.fifa_errors ? data.metrics.fifa_errors.total : 0,
    overload_503: data.metrics.fifa_overloaded_503 ? data.metrics.fifa_overloaded_503.total : 0
  };

  const out = JSON.stringify(summary, null, 2);
  console.log('\n=== Demo Surge Results ===');
  console.log('Total requests:', summary.http_reqs);
  console.log('Throughput (approx):', summary.throughput);
  console.log('P95(ms):', summary.p95);
  console.log('P99(ms):', summary.p99);
  console.log('Error count:', summary.errors);
  console.log('503 count:', summary.overload_503);

  // Return files to write and stdout content — k6 will write the file when handleSummary returns a mapping
  return {
    stdout: out,
    'load-testing/demo-surge-results.json': out
  };
}
