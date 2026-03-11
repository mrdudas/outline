#!/usr/bin/env bash
# start_debug.sh – Start the Outline development server with all services.
# Usage: ./start_debug.sh [--build]
#
# Options:
#   --build   Rebuild the server before starting (runs `node ./build.js`).
#
# Logs are written to /tmp/outline.log.
# Run `tail -f /tmp/outline.log` in a separate terminal to follow output.

set -euo pipefail

LOGFILE="/tmp/outline.log"
SERVICES="web,websockets,collaboration,worker"

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
BUILD=false
for arg in "$@"; do
  case "$arg" in
    --build) BUILD=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Check dependencies
# ---------------------------------------------------------------------------
echo "==> Checking PostgreSQL…"
if ! pg_isready -q; then
  echo "ERROR: PostgreSQL is not running. Start it and try again." >&2
  exit 1
fi
echo "    OK"

echo "==> Checking Redis…"
if ! redis-cli ping &>/dev/null; then
  echo "ERROR: Redis is not running. Start it and try again." >&2
  exit 1
fi
echo "    OK"

# ---------------------------------------------------------------------------
# Kill any stale server process
# ---------------------------------------------------------------------------
if pgrep -f "node build/server/index.js" &>/dev/null; then
  echo "==> Stopping existing Outline process…"
  pkill -f "node build/server/index.js" || true
  sleep 1
fi

# ---------------------------------------------------------------------------
# Optional rebuild
# ---------------------------------------------------------------------------
if [ "$BUILD" = true ]; then
  echo "==> Building…"
  node ./build.js
fi

# ---------------------------------------------------------------------------
# Kill stale Vite processes
# ---------------------------------------------------------------------------
if pgrep -f "vite.js" &>/dev/null; then
  echo "==> Stopping existing Vite process…"
  pkill -9 -f "vite.js" || true
  sleep 1
fi

# ---------------------------------------------------------------------------
# Start Vite dev server
# ---------------------------------------------------------------------------
echo "==> Starting Vite dev server (port 3001)…"
NODE_ENV=development yarn vite >> /tmp/vite.log 2>&1 &
disown $!
echo "    Vite PID: $!"
echo "    Log file: /tmp/vite.log"

# ---------------------------------------------------------------------------
# Start the server
# ---------------------------------------------------------------------------
echo "==> Starting Outline (services: $SERVICES)…"
echo "    Log file: $LOGFILE"

NODE_ENV=development node build/server/index.js \
  --services="$SERVICES" \
  > "$LOGFILE" 2>&1 &

SERVER_PID=$!
echo "    Server PID: $SERVER_PID"

# ---------------------------------------------------------------------------
# Wait for HTTP 200
# ---------------------------------------------------------------------------
echo "==> Waiting for server to become ready…"
for i in $(seq 1 30); do
  sleep 1
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ || true)
  if [ "$STATUS" = "200" ]; then
    echo ""
    echo "==> Server is ready at http://localhost:3000"
    echo ""
    tail -5 "$LOGFILE"
    exit 0
  fi
  printf "."
done

echo ""
echo "ERROR: Server did not respond with HTTP 200 after 30 seconds." >&2
echo "Last log lines:"
tail -20 "$LOGFILE"
exit 1
