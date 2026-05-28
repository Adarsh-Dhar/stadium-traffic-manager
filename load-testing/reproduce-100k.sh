#!/usr/bin/env bash
set -euo pipefail

# Reproduce helper for the FIFA 100k workflow.
# Usage: reproduce-100k.sh <command>
# Commands:
#   setup         - ensure Docker Postgres `stadium-pg` is running and ready
#   push-schema   - run drizzle push (applies DB schema)
#   start-api     - start artifacts/api-server in background (logs to project root)
#   wait-api      - wait until http://localhost:5000/api/healthz is healthy
#   run-loadtest  - run the load test (foreground)
#   verify        - query Postgres counts and MCP status
#   stop-api      - stop API started by this script
#   full          - run setup -> push-schema -> start-api -> wait-api -> run-loadtest -> verify

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_DB_URL="postgresql://stadium:stadium@localhost:5432/stadium"
DATABASE_URL="${DATABASE_URL:-$DEFAULT_DB_URL}"
API_PORT="${API_PORT:-5000}"
API_LOG="$ROOT_DIR/artifacts-api-server.log"
API_PID_FILE="/tmp/stadium-api.pid"

log(){ echo "[$(date '+%H:%M:%S')] $*"; }

ensure_docker(){ command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; } }

start_pg(){
  ensure_docker

  DEFAULT_PORT=5432
  FALLBACK_PORT=${REPRODUCE_PG_FALLBACK_PORT:-15432}

  # If container is already running, read its mapped host port (if any) and return.
  if docker ps --format '{{.Names}}' | grep -q '^stadium-pg$'; then
    log "stadium-pg already running"
    # try to read mapped host port for 5432/tcp
    HOST_PG_PORT=$(docker inspect -f '{{range $p,$bind := .NetworkSettings.Ports}}{{if eq $p "5432/tcp"}}{{(index $bind 0).HostPort}}{{end}}{{end}}' stadium-pg 2>/dev/null || true)
    if [ -n "${HOST_PG_PORT:-}" ]; then
      log "stadium-pg mapped to host port ${HOST_PG_PORT}"
      # If DATABASE_URL is still the default, update it to reflect the mapped host port
      if [ "${DATABASE_URL:-}" = "${DEFAULT_DB_URL}" ]; then
        DATABASE_URL="postgresql://stadium:stadium@localhost:${HOST_PG_PORT}/stadium"
        export DATABASE_URL
        log "Set DATABASE_URL to $DATABASE_URL"
      else
        log "Using existing DATABASE_URL"
      fi
    else
      log "stadium-pg running without a host port mapping"
    fi
    return 0
  fi

  # Candidate ports to try (prefer 5432, then fallback)
  CANDIDATES=("${DEFAULT_PORT}" "${FALLBACK_PORT}")
  for p in "${CANDIDATES[@]}"; do
    # quick check: skip if port appears in use on host
    if lsof -nP -iTCP:${p} -sTCP:LISTEN >/dev/null 2>&1; then
      log "host port ${p} appears in use; skipping"
      continue
    fi

    # remove any stopped container so we can recreate with desired mapping
    if docker ps -a --format '{{.Names}}' | grep -q '^stadium-pg$'; then
      log "Removing stopped stadium-pg to recreate with host port ${p}"
      docker rm stadium-pg >/dev/null 2>&1 || true
    fi

    log "Attempting to create stadium-pg on host port ${p}"
    if docker run -d --name stadium-pg \
         -e POSTGRES_USER=stadium -e POSTGRES_PASSWORD=stadium -e POSTGRES_DB=stadium \
         -p ${p}:5432 postgres:16 >/dev/null 2>&1; then
      HOST_PG_PORT=${p}
      log "Created stadium-pg bound to host port ${HOST_PG_PORT}"
      break
    else
      log "docker run failed for host port ${p}; trying next candidate"
      docker rm stadium-pg >/dev/null 2>&1 || true
      continue
    fi
  done

  if [ -z "${HOST_PG_PORT:-}" ]; then
    log "Failed to create stadium-pg on any candidate host port"; return 1
  fi

  # If the script was using the default DATABASE_URL, update it to the chosen host port.
  if [ "${DATABASE_URL:-}" = "$DEFAULT_DB_URL" ]; then
    DATABASE_URL="postgresql://stadium:stadium@localhost:${HOST_PG_PORT}/stadium"
    export DATABASE_URL
    log "Set DATABASE_URL to $DATABASE_URL"
  else
    log "Using existing DATABASE_URL"
  fi

  log "Waiting for Postgres to become ready..."
  docker exec stadium-pg bash -c "until pg_isready -U stadium >/dev/null 2>&1; do sleep 1; done"
  log "Postgres is ready (container bound to host port ${HOST_PG_PORT})"
}

drizzle_push(){
  if [ ! -d "$ROOT_DIR/lib/db" ]; then
    echo "lib/db directory not found" >&2; exit 1
  fi
  log "Pushing Drizzle schema (lib/db)..."
  (cd "$ROOT_DIR/lib/db" && DATABASE_URL="$DATABASE_URL" pnpm run push)
}

start_api_bg(){
  if lsof -i :"$API_PORT" -sTCP:LISTEN -nP >/dev/null 2>&1; then
    log "Port $API_PORT already in use; skipping API start"
    return 0
  fi
  log "Starting API in background (logs => $API_LOG)"
  (cd "$ROOT_DIR/artifacts/api-server" && nohup env DATABASE_URL="$DATABASE_URL" PORT="$API_PORT" pnpm run dev > "$API_LOG" 2>&1 & echo $! > "$API_PID_FILE")
  sleep 1
}

wait_api_ready(){
  local timeout=${1:-120}
  local n=0
  log "Waiting for API http://localhost:$API_PORT/api/healthz (timeout ${timeout}s)"
  until curl -sS "http://localhost:$API_PORT/api/healthz" | grep -q '"status":"ok"' || [ $n -ge $timeout ]; do
    sleep 1; n=$((n+1)); printf "."
  done
  echo
  if [ $n -ge $timeout ]; then
    log "API did not become ready after ${timeout}s"; return 1
  fi
  log "API is ready"
}

run_loadtest(){
  log "Running load test in foreground (Ctrl+C to stop)"
  (cd "$ROOT_DIR/load-testing" && LOAD_TEST_API_KEY="${LOAD_TEST_API_KEY:-your-secret-load-test-key}" DT_SECURITY=true API_URL="http://localhost:$API_PORT" node run-100k.js)
}

verify_db_counts(){
  ensure_docker
  log "DB: tickets count"
  docker exec stadium-pg psql -U stadium -d stadium -c "SELECT COUNT(*) FROM tickets;"
  log "DB: request_log breakdown"
  docker exec stadium-pg psql -U stadium -d stadium -c "SELECT status, COUNT(*) FROM request_log GROUP BY status ORDER BY status;"
  log "DB: metrics_snapshots count"
  docker exec stadium-pg psql -U stadium -d stadium -c "SELECT COUNT(*) FROM metrics_snapshots;"
  log "MCP status"
  curl -sS "http://localhost:$API_PORT/api/fifa/metrics/mcp-status" | (command -v jq >/dev/null 2>&1 && jq . || cat)
}

stop_api(){
  if [ -f "$API_PID_FILE" ]; then
    pid=$(cat "$API_PID_FILE")
    log "Stopping API pid=$pid"
    kill "$pid" 2>/dev/null || true
    rm -f "$API_PID_FILE"
  else
    pid=$(lsof -i :"$API_PORT" -sTCP:LISTEN -t || true)
    if [ -n "$pid" ]; then
      log "Stopping API pid=$pid"
      kill "$pid" 2>/dev/null || true
    else
      log "No API process found"
    fi
  fi
}

case "${1:-help}" in
  setup) start_pg ;; 
  push-schema) drizzle_push ;; 
  start-api) start_api_bg ;; 
  wait-api) wait_api_ready ;; 
  run-loadtest) run_loadtest ;; 
  verify) verify_db_counts ;; 
  stop-api) stop_api ;; 
  full)
    start_pg
    drizzle_push
    start_api_bg
    wait_api_ready 120
    if [ "${SKIP_LOADTEST:-0}" != "1" ]; then
      run_loadtest
    else
      log "SKIP_LOADTEST=1; skipping run_loadtest"
    fi
    verify_db_counts
    ;;
  *)
    cat <<EOF
Usage: $(basename "$0") <command>
Commands:
  setup | push-schema | start-api | wait-api | run-loadtest | verify | stop-api | full
EOF
    exit 1
    ;;
esac

exit 0
