#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "${PROJECT_DIR}/.env"

echo "=== ArenaForge Monad Testnet Deploy ==="

# Check for private key
if [ -z "${ARENA_AGENT_PRIVATE_KEY:-}" ]; then
  echo "ERROR: ARENA_AGENT_PRIVATE_KEY not set in .env"
  exit 1
fi

# Verify we're using testnet
if [ "${USE_TESTNET:-false}" != "true" ]; then
  echo "ERROR: USE_TESTNET must be true in .env"
  exit 1
fi

RPC_URL="${MONAD_TESTNET_RPC_URL:-https://testnet-rpc.monad.xyz}"
echo "Using RPC: $RPC_URL"

# Check wallet balance
echo "Checking wallet balance..."
BALANCE=$(cast balance --rpc-url "$RPC_URL" $(cast wallet address "$ARENA_AGENT_PRIVATE_KEY") 2>/dev/null || echo "0")
echo "Wallet balance: $BALANCE wei"

if [ "$BALANCE" = "0" ]; then
  echo "WARNING: Wallet has 0 balance. You need MON tokens for deployment."
  echo "Get testnet MON from the Monad faucet."
  exit 1
fi

# Deploy contracts
echo ""
echo "Deploying contracts to Monad Testnet..."
cd "$PROJECT_DIR"

forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$RPC_URL" \
  --private-key "$ARENA_AGENT_PRIVATE_KEY" \
  --broadcast \
  --slow \
  -vvv

# Parse deployed addresses from broadcast
BROADCAST_FILE="${PROJECT_DIR}/broadcast/Deploy.s.sol/10143/run-latest.json"
if [ ! -f "$BROADCAST_FILE" ]; then
  # Try chain ID 41454 (alternative Monad testnet)
  BROADCAST_FILE="${PROJECT_DIR}/broadcast/Deploy.s.sol/41454/run-latest.json"
fi

if [ -f "$BROADCAST_FILE" ]; then
  echo ""
  echo "Parsing contract addresses..."

  # Extract addresses using jq
  ESCROW=$(jq -r '.transactions[] | select(.contractName == "WagerEscrow") | .contractAddress' "$BROADCAST_FILE" | head -1)
  MATCH_REGISTRY=$(jq -r '.transactions[] | select(.contractName == "MatchRegistry") | .contractAddress' "$BROADCAST_FILE" | head -1)
  ARENA_CORE=$(jq -r '.transactions[] | select(.contractName == "ArenaCore") | .contractAddress' "$BROADCAST_FILE" | head -1)
  ORACLE_DUEL=$(jq -r '.transactions[] | select(.contractName == "OracleDuel") | .contractAddress' "$BROADCAST_FILE" | head -1)
  STRATEGY_ARENA=$(jq -r '.transactions[] | select(.contractName == "StrategyArena") | .contractAddress' "$BROADCAST_FILE" | head -1)
  AUCTION_WARS=$(jq -r '.transactions[] | select(.contractName == "AuctionWars") | .contractAddress' "$BROADCAST_FILE" | head -1)
  QUIZ_BOWL=$(jq -r '.transactions[] | select(.contractName == "QuizBowl") | .contractAddress' "$BROADCAST_FILE" | head -1)

  echo ""
  echo "=== DEPLOYMENT COMPLETE ==="
  echo "ArenaCore:      $ARENA_CORE"
  echo "WagerEscrow:    $ESCROW"
  echo "MatchRegistry:  $MATCH_REGISTRY"
  echo "OracleDuel:     $ORACLE_DUEL"
  echo "StrategyArena:  $STRATEGY_ARENA"
  echo "AuctionWars:    $AUCTION_WARS"
  echo "QuizBowl:       $QUIZ_BOWL"

  # Update .env
  sed -i.bak "s|^ARENA_CORE_ADDRESS=.*|ARENA_CORE_ADDRESS=$ARENA_CORE|" "$PROJECT_DIR/.env"
  sed -i.bak "s|^ESCROW_ADDRESS=.*|ESCROW_ADDRESS=$ESCROW|" "$PROJECT_DIR/.env"
  sed -i.bak "s|^MATCH_REGISTRY_ADDRESS=.*|MATCH_REGISTRY_ADDRESS=$MATCH_REGISTRY|" "$PROJECT_DIR/.env"
  sed -i.bak "s|^ORACLE_DUEL_ADDRESS=.*|ORACLE_DUEL_ADDRESS=$ORACLE_DUEL|" "$PROJECT_DIR/.env"
  sed -i.bak "s|^STRATEGY_ARENA_ADDRESS=.*|STRATEGY_ARENA_ADDRESS=$STRATEGY_ARENA|" "$PROJECT_DIR/.env"
  sed -i.bak "s|^AUCTION_WARS_ADDRESS=.*|AUCTION_WARS_ADDRESS=$AUCTION_WARS|" "$PROJECT_DIR/.env"
  sed -i.bak "s|^QUIZ_BOWL_ADDRESS=.*|QUIZ_BOWL_ADDRESS=$QUIZ_BOWL|" "$PROJECT_DIR/.env"
  rm -f "$PROJECT_DIR/.env.bak"

  # Update frontend .env
  cat > "$PROJECT_DIR/frontend/.env" << EOF
VITE_RPC_URL=$RPC_URL
VITE_CHAIN_ID=10143
VITE_ARENA_CORE_ADDRESS=$ARENA_CORE
VITE_ESCROW_ADDRESS=$ESCROW
VITE_MATCH_REGISTRY_ADDRESS=$MATCH_REGISTRY
VITE_ORACLE_DUEL_ADDRESS=$ORACLE_DUEL
VITE_STRATEGY_ARENA_ADDRESS=$STRATEGY_ARENA
VITE_AUCTION_WARS_ADDRESS=$AUCTION_WARS
VITE_QUIZ_BOWL_ADDRESS=$QUIZ_BOWL
EOF

  echo ""
  echo ".env files updated successfully"
  echo ""
  echo "Next steps:"
  echo "  cd frontend && npm run dev  # start frontend"
  echo "  npm run agent:testnet       # start agent (if configured)"
else
  echo "WARNING: Could not find broadcast file to parse addresses"
  echo "Check the forge output above for deployed addresses"
fi
