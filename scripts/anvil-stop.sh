#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${PROJECT_DIR}/.anvil-pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill "$PID" 2>/dev/null; then
    echo "Anvil stopped (PID: $PID)"
  else
    echo "Anvil process $PID already stopped"
  fi
  rm -f "$PID_FILE"
else
  echo "No .anvil-pid file found"
  # Fallback: kill anything on port 8545
  PIDS=$(lsof -ti:8545 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null
    echo "Killed processes on port 8545"
  fi
fi

rm -f "${PROJECT_DIR}/.anvil.log"
