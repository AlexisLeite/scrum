#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/root/repos/scrum"
API_DIR="$ROOT_DIR/apps/api"
LOG_API_DIR="$ROOT_DIR/logs/api"
LOG_FRONT_DIR="$ROOT_DIR/logs/front"
PID_DIR="$ROOT_DIR/logs/pids"
API_PID_FILE="$PID_DIR/api-supervisor.pid"
FRONT_PID_FILE="$PID_DIR/front-supervisor.pid"

API_PORT="3100"
MCP_PORT="3101"
FRONT_PORT="4173"

mkdir -p "$LOG_API_DIR" "$LOG_FRONT_DIR" "$PID_DIR"

exec 9>"$PID_DIR/restart.lock"
if ! flock -n 9; then
  echo "Another restart-apps.sh instance is already running."
  exit 1
fi

touch "$LOG_API_DIR/app.log" "$LOG_API_DIR/error.log"
touch "$LOG_FRONT_DIR/app.log" "$LOG_FRONT_DIR/error.log"

stop_if_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" || true)"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" || true
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" || true
      fi
    fi
    rm -f "$pid_file"
  fi
}

# Stop old processes tracked by pid files.
stop_if_running "$API_PID_FILE"
stop_if_running "$FRONT_PID_FILE"
rm -f "$PID_DIR/api.pid" "$PID_DIR/front.pid"

# Extra safety: stop old matching processes if they were started manually.
pkill -f 'node dist/src/main.js' || true
pkill -f 'node .*/apps/api/dist/src/main.js' || true
pkill -f 'pnpm --filter @scrum/web preview --host 127.0.0.1 --port 4173' || true
pkill -f 'vite preview --host 127.0.0.1 --port 4173' || true
pkill -f '@scrum/web@0.1.0 preview' || true
pkill -f 'vite preview' || true

# Ensure no stale API/MCP listeners survive.
fuser -k 3100/tcp 2>/dev/null || true
fuser -k 3101/tcp 2>/dev/null || true

# Ensure no stale frontend listeners survive on fallback ports.
fuser -k 4173/tcp 2>/dev/null || true
fuser -k 4174/tcp 2>/dev/null || true
fuser -k 4175/tcp 2>/dev/null || true
fuser -k 4176/tcp 2>/dev/null || true

# Start API + MCP under a supervisor loop.
nohup bash -lc '
  set -euo pipefail
  while true; do
    cd "'$API_DIR'"
    set -a
    source "'$ROOT_DIR'/.env"
    set +a
    export PORT="'$API_PORT'"
    export MCP_PORT="'$MCP_PORT'"
    node dist/src/main.js >>"'$LOG_API_DIR'/app.log" 2>>"'$LOG_API_DIR'/error.log"
    code=$?
    printf "%s API exited with code %s. Restarting in 2s.\n" "$(date -Is)" "$code" >>"'$LOG_API_DIR'/error.log"
    sleep 2
  done
' >/dev/null 2>&1 &
echo $! > "$API_PID_FILE"

# Start frontend preview under a supervisor loop.
nohup bash -lc '
  set -euo pipefail
  while true; do
    cd "'$ROOT_DIR'"
    pnpm --filter @scrum/web preview --host 127.0.0.1 --port "'$FRONT_PORT'" --strictPort >>"'$LOG_FRONT_DIR'/app.log" 2>>"'$LOG_FRONT_DIR'/error.log"
    code=$?
    printf "%s FRONT exited with code %s. Restarting in 2s.\n" "$(date -Is)" "$code" >>"'$LOG_FRONT_DIR'/error.log"
    sleep 2
  done
' >/dev/null 2>&1 &
echo $! > "$FRONT_PID_FILE"

sleep 2

echo "API supervisor PID: $(cat "$API_PID_FILE")"
echo "FRONT supervisor PID: $(cat "$FRONT_PID_FILE")"

echo "Listening ports (internal):"
ss -ltnp | grep -E ":$API_PORT|:$MCP_PORT|:$FRONT_PORT" || true

if command -v nginx >/dev/null 2>&1 && command -v systemctl >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    if systemctl is-active --quiet nginx; then
      systemctl reload nginx
      echo "nginx reloaded"
    else
      systemctl start nginx
      echo "nginx started"
    fi
  else
    echo "WARNING: nginx config test failed; skipping reload/start" >&2
  fi
fi

echo "Done. Supervisors will restart apps automatically if they crash."
