# Stadium Traffic Manager

This repository contains a demo system that simulates stadium crowd traffic, automatic scaling, and AI-driven analysis for live events.

Quick start (development):

```bash
pnpm install
pnpm --filter @workspace/api-server run build
pnpm run dev
```

Demo commands (short)

- `pnpm demo:check` — run the pre-demo health check
- `pnpm demo:e2e` — build API then run the automated demo runner
- `pnpm demo:e2e:quick` — run the demo runner against a running API (no build/start)

Architecture

```
[Browser Dashboard] <---> [API Server] <--> [Simulated Load / k6]
									\---> [AI Agent]
									\---> [Dynatrace / Observability]
```

Where to run things

- API server: `artifacts/api-server` (built to `artifacts/api-server/dist/index.mjs`)
- Dashboard: `artifacts/fifa-dashboard` (Vite app)
- Demo scripts: `scripts/` (contains `e2e-demo.js` and `demo-health-check.js`)
- Load testing: `load-testing/demo-surge.js` (k6 script)

Demo docs

Follow the guided 15-minute demo in `docs/demo-script.md` which includes step-by-step commands and talking points.

Environment variables

- `PORT` (defaults to 5000 for API)
- `GEMINI_API_KEY` (optional — AI analysis; provide to see live AI analysis)
- `DYNATRACE_ENV_ID`, `DYNATRACE_API_TOKEN`, `DYNATRACE_CLUSTER_URL` (optional observability integration)

Project structure (high-level)

- artifacts/
	- api-server/       (API source & build)
	- fifa-dashboard/   (frontend)
- scripts/            (demo tooling & helpers)
- load-testing/       (k6 scripts)
- docs/               (demo script and docs)

Running the demo

1. Ensure `pnpm install` has been run.
2. Run `pnpm demo:check` to validate the environment.
3. Option A — full demo (build + run): `pnpm demo:e2e`.
4. Option B — quick iteration (API already running): `pnpm demo:e2e:quick`.

Notes

- The demo scripts are designed for local staging and live presentations; they can spawn the API server from the built artifact, run simulations, poll metrics, and validate alerting and AI analysis outputs.
- Do not wire the `demo:e2e` script into CI — it runs long-lived load and simulation behaviors.

See `docs/demo-script.md` for the full guided walkthrough.

