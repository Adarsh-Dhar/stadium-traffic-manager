# 🔮 Gemini RPS Prediction Agent

A Gemini-powered AI agent that fuses **7 live data streams** to predict how many requests per second your stadium API will receive in the next 5 and 30 minutes — then automatically scales if needed.

**Location:** `artifacts/rps-agent/` (integrated into main project workspace)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  rps-agent.js  (this agent)             │
│                                                         │
│  Data collectors (run in parallel every 15s)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │  Redis   │ │Postgres  │ │Open-Meteo│ │Transit.  │  │
│  │tickets_  │ │game_     │ │weather   │ │land      │  │
│  │scanned   │ │history   │ │          │ │arrivals  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────────┐   │
│  │ TomTom   │ │Prometheus│ │  Stadium API /metrics  │   │
│  │ traffic  │ │ RPS/p95  │ │  /alerts  /capacity   │   │
│  └──────────┘ └──────────┘ └──────────────────────┘   │
│                        │                               │
│              buildPrompt() → Gemini 2.0 Flash          │
│                        │                               │
│  { predictedRps5min, predictedRps30min, riskLevel,     │
│    shouldScaleNow, serversToAdd, recommendedActions }   │
│                        │                               │
│           executeActions() → Stadium API               │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Install dependencies (workspace)
```bash
# From project root
pnpm install
```

### 2. Configure environment
```bash
# Copy and edit the main .env file
cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY
```

### 3. Start services with Docker Compose
```bash
# This starts Redis, PostgreSQL, and the RPS agent
docker compose up -d redis postgres rps-agent
```

### 4. Seed historical game data
```bash
# From project root
pnpm --filter @workspace/rps-agent run seed
```

### 5. Run the prediction agent
```bash
# From project root
pnpm --filter @workspace/rps-agent run start
```

### 6. (Optional) Run the ticket webhook simulator
```bash
# In a separate terminal — simulates fans arriving at gates
pnpm --filter @workspace/rps-agent run webhook medium   # low | medium | high | surge
```

---

## Output example

```
─────────────────────────────────────────────────────────────────
  🔮 RPS PREDICTION  14:32:07
─────────────────────────────────────────────────────────────────
  🟠  Risk : HIGH
  📈  RPS in 5 min  : 640
  📈  RPS in 30 min : 1180
  🎯  Confidence    : 87%
  ⚡  Scale now     : YES — add 2 server(s)

  💬 Crowd wave from 6 incoming trains + traffic jam pushing
     fans to arrive in concentrated burst near kickoff.

  Reasoning: Scan velocity at 48/s indicates 60% capacity already
  through gates. Transit data shows 6 trains in 30 min causing
  a crowd wave. Traffic jam will delay drivers, shifting load to
  the API spike window between T-20min and kickoff...

  Key factors:
    • Transit crowd wave: 6 trains in next 30 min
    • Traffic jam detected (22% of free-flow speed)
    • Playoff game multiplier: 2.1x historical baseline
    • Scan velocity 48/s → 70% capacity arrival rate

  Recommended actions:
    → Scale to 3 active servers immediately
    → Pre-warm DB connection pool to 50 connections
    → Enable rate limiting at 1200 RPS threshold
─────────────────────────────────────────────────────────────────
```

---

## Data Sources

| Source | What it measures | Key env var |
|--------|-----------------|-------------|
| **Redis** | `tickets_scanned` velocity (fan arrival rate) | `REDIS_URL` |
| **PostgreSQL** | Historical RPS curves per game type | `DATABASE_URL`, `GAME_TYPE` |
| **Open-Meteo** | Live rain / wind (free, no key) | `STADIUM_LAT/LON` |
| **Transit.land** | Incoming trains in next 30 min | `TRANSITLAND_KEY` |
| **TomTom** | Road congestion ratio | `TOMTOM_API_KEY` |
| **Prometheus** | Internal `rate(http_requests_total[1m])` | `PROMETHEUS_URL` |
| **Stadium API** | Live metrics, alerts, capacity | `AI_AGENT_API_BASE` |

All sources degrade gracefully — the agent uses mocks/nulls when a service is unavailable.

---

## Prediction stored in Redis

After each run the latest prediction is saved to Redis under the key `rps_prediction_latest` (TTL 2 min), so your dashboard or Watchdog can read it without waiting for the next cycle:

```bash
redis-cli GET rps_prediction_latest | jq .
```

---

## Integration Notes

This agent is now integrated into the main project workspace:
- **Package name:** `@workspace/rps-agent`
- **Location:** `artifacts/rps-agent/`
- **Dependencies:** Managed via pnpm workspace catalog
- **Docker:** Integrated into main `docker-compose.yml`
- **Environment:** Uses main project `.env` file

The agent connects to the main API server via `AI_AGENT_API_BASE` (default: `http://localhost:5000/api/fifa`).
