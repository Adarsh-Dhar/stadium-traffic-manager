# Live Demo Script — Stadium Traffic Manager (15-minute)

Purpose
-------

This document is a step-by-step script to run a 15-minute live demo showing how the Stadium Traffic Manager detects load surges, triggers alerts, uses AI to analyze telemetry, and scales services automatically. Each step includes exact terminal commands, expected output snippets, a short speaker script, and troubleshooting tips.

Pre-demo checklist (Run 2–5 minutes)
-----------------------------------

- Ensure your machine has Node.js >= 18 installed.
- Run `pnpm install` at the repository root.
- Confirm `artifacts/api-server/dist/index.mjs` exists. If not, build it:

  ```bash
  pnpm --filter @workspace/api-server run build
  ```

- Create a `.env` file from `.env.example` if needed, and set any secrets you plan to demo (optional: `GEMINI_API_KEY`).
- Ensure ports 5000 and 5173 are free.
- Optional: install `k6` for the load demo (not required for the scripted e2e runner).

Quick terminal layout
---------------------

- Left pane: Terminal — run the demo commands and show logs
- Right pane: Browser — open the dashboard at `http://localhost:3000` (optional)
- Bottom pane: `k6` output (optional)

Commands quick reference
------------------------

- Preflight: `pnpm demo:check`
- Run full demo (build + runner): `pnpm demo:e2e`
- Run quick demo against an already-running API: `pnpm demo:e2e:quick`
- Run k6 stage (optional): `k6 run load-testing/demo-surge.js`
- Manual reset: `curl -sS -X POST http://localhost:5000/api/fifa/admin/reset | jq`

Demo steps (approx. timing)
---------------------------

1) Preflight checks (30–60s)

   - Command:

     ```bash
     pnpm demo:check
     ```

   - Expected output: a checklist showing ✅/⚠️/❌ for each precondition (Node, pnpm, k6, API build, `.env`, ports). No ❌ items.
   - Talking point: "This quick preflight ensures we won't be surprised by environment issues during the live demo. Warnings (⚠️) indicate recommended but non-blocking items."

2) Start the dashboard (optional, 15–30s)

   - Command (from `artifacts/fifa-dashboard`):

     ```bash
     cd artifacts/fifa-dashboard
     PORT=3000 BASE_PATH=/ VITE_API_URL=http://localhost:3001/api pnpm run dev
     ```

   - Expected output: Vite dev server logs and directory listing; open `http://localhost:3000`.
   - Talking point: "The dashboard visualizes telemetry so the audience can watch metrics change in real time."

3) Baseline validation (30–60s)

   - Purpose: Demonstrate the system at rest and confirm alerting/metrics baseline.
   - Command:

     ```bash
     node scripts/e2e-demo.js --intensity low --duration 30 --no-start-server
     ```

   - Expected output (console):

     - Health check pass
     - `/api/fifa/metrics/current` returned with low CPU (<30%), latency (<100ms), serverCount=1

   - Troubleshooting: If metrics don't match, run `pnpm --filter @workspace/api-server run build` and ensure the API is running.

4) Start controlled surge simulation (90s)

   - Command (full runner will build and start the server if needed):

     ```bash
     pnpm demo:e2e
     # or to target a running API:
     pnpm demo:e2e:quick
     ```

   - Explanation: The runner will post to `/api/fifa/simulation/start` with the chosen intensity and duration, poll `/api/fifa/metrics/current` every 3 seconds, and print an ASCII bar chart of CPU, latency, error rate, and active servers.

   - Talking point: "We simulate a sudden crowd surge and observe the system's behavior — it should alert, scale, and then recover."

5) Watch scaling and AI analysis (45–90s)

   - Watch console logs for scale events (serverCount increases) and an AI analysis entry from `/api/fifa/admin/ai-analyze` containing an analysis text and confidence score.

   - Talking point: "AI analyzes the telemetry and suggests mitigation steps such as adding capacity, throttling non-essential endpoints, or adjusting routing."

6) Verify alerts and logs (20–30s)

   - The runner will fetch `/api/fifa/metrics/alerts` and assert that the sequence of events contains `simulation-start`, a `critical` alert entry, and AI or scale events.

   - Command (manual check):

     ```bash
     curl -sS http://localhost:5000/api/fifa/metrics/alerts | jq
     ```

7) Stop the simulation and reset (15–30s)

   - The runner posts to `/api/fifa/simulation/stop` and `/api/fifa/admin/reset`. Confirm metrics return to baseline.

   - Manual reset command:

     ```bash
     curl -sS -X POST http://localhost:5000/api/fifa/admin/reset | jq
     ```

8) Optional: k6 live surge (2 minutes)

   - If you want to show a real traffic generator, run:

     ```bash
     k6 run load-testing/demo-surge.js
     ```

   - Expected output: k6 will run for ~2 minutes, print a summary, and write `load-testing/demo-surge-results.json` with P95/P99, errors, throughput, and 503 count.

9) Wrap up and Q&A (remaining time)

   - Summary talking points:
     - We saw detection and alerting for high load.
     - AI provided an analysis with confidence score.
     - Automatic scaling reduced latency and restored service availability.

Troubleshooting quick reference
-----------------------------

| Symptom | Likely cause | Fix |
|---|---|---|
| `pnpm demo:check` shows `API build missing` | `artifacts/api-server` not built | `pnpm --filter @workspace/api-server run build` |
| Port 5000 in use | Another process running on port 5000 | `lsof -i :5000` and stop process or change PORT |
| AI analysis not appearing | `GEMINI_API_KEY` not set or not reachable | Set `GEMINI_API_KEY` or skip AI step |
| k6 aborts early | Strict thresholds in k6 script | Use permissive thresholds in demo script (`demo-surge.js`) |

Reset command
-------------

Run this between demo runs to ensure a clean state:

```bash
curl -sS -X POST http://localhost:5000/api/fifa/admin/reset | jq
```

Metrics API shape reference
---------------------------

The demo runner tolerates multiple metrics shapes. Common fields include:

- `cpu`, `cpuUsage`, `cpu_percent`
- `latency`, `avgLatency`, `p95Latency`
- `serverCount`, `activeServers`
- `errorRate`, `error_rate`

When metrics are fetched the runner normalizes these fields so the demo is resilient to small API variations.

Speaker notes (short cues)
-------------------------

- "We'll start with a quick health check to ensure our environment is ready."
- "Now starting a controlled simulation to show how the system behaves under stress."
- "Notice the console shows CPU and latency bars; the dashboard is updated in real time."
- "The AI analysis shows what to watch for and provides a recommended action."
- "We stop the simulation and reset to baseline — everything is back to normal."

End of demo script
