import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },
    { duration: '2m', target: 500 },
    { duration: '3m', target: 2000 },
    { duration: '5m', target: 5000 },
    { duration: '10m', target: 5000 },
    { duration: '5m', target: 0 },
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'],
  },
};

const API_BASE = __ENV.API_BASE || 'http://localhost:5000/api/fifa';

export default function () {
  // Simulate a mix of read and write traffic that a stadium might produce
  http.get(`${API_BASE}/stadium/capacity`);
  sleep(0.2);

  // Validate random ticket
  const ticketId = `TICKET_${Math.floor(Math.random() * 100000)}_2026WC`;
  http.post(`${API_BASE}/ticket/validate`, JSON.stringify({ ticketId }), { headers: { 'Content-Type': 'application/json' } });
  sleep(0.5);

  // Random scans at gates
  const gate = ['gate-a','gate-b','gate-c','gate-d'][Math.floor(Math.random()*4)];
  http.post(`${API_BASE}/ticket/scan`, JSON.stringify({ ticketId, gate }), { headers: { 'Content-Type': 'application/json' } });
  sleep(0.3);
}
