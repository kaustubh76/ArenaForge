#!/usr/bin/env bash
# validate-live.sh — end-to-end deploy validation.
#
# Runs in three steps:
#   1. health-check (before) — captures the empty/broken baseline
#   2. seed:full              — drives one tournament per game type
#   3. health-check (after)   — confirms data landed
#
# Use after every deploy of either the frontend or the backend. Exits
# non-zero if any page is BROKEN at the end.
set -e

cd "$(dirname "$0")/../.."

echo "=================================================="
echo "  STEP 1/3: Pre-seed health check"
echo "=================================================="
# Don't fail-fast here — seed:full will heal NEEDS DATA states. But if
# the backend itself is BROKEN we still want to know before burning gas.
npm run --silent health:check || {
  echo ""
  echo "WARN: pre-seed health check reported BROKEN pages."
  echo "      Continuing anyway — many BROKEN states are seed-fixable."
}

echo ""
echo "=================================================="
echo "  STEP 2/3: Seed full dApp (4 game types)"
echo "=================================================="
npm run --silent seed:full

echo ""
echo "=================================================="
echo "  STEP 3/3: Post-seed health check"
echo "=================================================="
npm run --silent health:check
