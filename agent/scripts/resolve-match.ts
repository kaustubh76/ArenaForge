// Script to resolve an in-progress match with sample game data
// This records the result on-chain, stores replay data in SQLite,
// and closes/settles any betting pools.
import { createWalletClient, createPublicClient, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../monad/rpc";
import { getMatchStore } from "../persistence/match-store";
import type { MatchResult } from "../game-engine/game-mode.interface";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const MATCH_REGISTRY_ABI = [
  { name: "recordResult", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "winner", type: "address" },
      { name: "resultHash", type: "bytes32" },
    ],
    outputs: [],
  },
  { name: "getMatch", type: "function", stateMutability: "view",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [{ name: "", type: "tuple", components: [
      { name: "id", type: "uint256" },
      { name: "tournamentId", type: "uint256" },
      { name: "round", type: "uint256" },
      { name: "player1", type: "address" },
      { name: "player2", type: "address" },
      { name: "winner", type: "address" },
      { name: "resultHash", type: "bytes32" },
      { name: "timestamp", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "status", type: "uint8" },
    ]}],
  },
] as const;

const MATCH_REGISTRY_REPLAY_ABI = [
  { name: "storeRoundState", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "stateHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const SPECTATOR_BETTING_ABI = [
  { name: "closeBetting", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
  },
  { name: "settleBets", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "actualWinner", type: "address" },
    ],
    outputs: [],
  },
] as const;

// Generate sample Strategy Arena round data
function generateStrategyArenaData(player1: string, player2: string) {
  const moves = ["Cooperate", "Defect"] as const;
  const rounds = [];
  let p1Total = 0;
  let p2Total = 0;

  for (let i = 1; i <= 5; i++) {
    const p1Move = moves[Math.random() > 0.5 ? 0 : 1];
    const p2Move = moves[Math.random() > 0.5 ? 0 : 1];

    let p1Payoff = 0;
    let p2Payoff = 0;

    // Prisoner's dilemma payoffs
    if (p1Move === "Cooperate" && p2Move === "Cooperate") {
      p1Payoff = 3; p2Payoff = 3;
    } else if (p1Move === "Cooperate" && p2Move === "Defect") {
      p1Payoff = 0; p2Payoff = 5;
    } else if (p1Move === "Defect" && p2Move === "Cooperate") {
      p1Payoff = 5; p2Payoff = 0;
    } else {
      p1Payoff = 1; p2Payoff = 1;
    }

    p1Total += p1Payoff;
    p2Total += p2Payoff;

    rounds.push({
      round: i,
      player1Move: p1Move,
      player2Move: p2Move,
      player1Payoff: p1Payoff,
      player2Payoff: p2Payoff,
    });
  }

  return {
    rounds,
    totalRounds: 5,
    player1TotalPayoff: p1Total,
    player2TotalPayoff: p2Total,
    winner: p1Total > p2Total ? player1 : p1Total < p2Total ? player2 : null,
  };
}

async function main() {
  const matchId = parseInt(process.argv[2] || "1");
  console.log(`Resolving match #${matchId}...`);

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.ARENA_AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.error("DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport: http() });

  const matchRegistryAddress = process.env.MATCH_REGISTRY_ADDRESS as `0x${string}`;
  const spectatorBettingAddress = process.env.SPECTATOR_BETTING_ADDRESS as `0x${string}`;

  if (!matchRegistryAddress) {
    console.error("MATCH_REGISTRY_ADDRESS not set");
    process.exit(1);
  }

  // 1. Get match data from chain
  console.log("Fetching match data...");
  const matchRaw = await publicClient.readContract({
    address: matchRegistryAddress,
    abi: MATCH_REGISTRY_ABI,
    functionName: "getMatch",
    args: [BigInt(matchId)],
  });

  const player1 = matchRaw.player1;
  const player2 = matchRaw.player2;
  const status = Number(matchRaw.status);

  console.log("Player 1:", player1);
  console.log("Player 2:", player2);
  console.log("Status:", status === 1 ? "IN_PROGRESS" : status === 2 ? "COMPLETED" : String(status));

  if (status !== 1) {
    console.log("Match is not in-progress, can't resolve.");
    process.exit(0);
  }

  // 2. Generate game data (Strategy Arena)
  console.log("\nGenerating Strategy Arena game data...");
  const gameData = generateStrategyArenaData(player1, player2);

  console.log("Rounds:");
  for (const r of gameData.rounds) {
    console.log(`  R${r.round}: ${r.player1Move} vs ${r.player2Move} → P1:${r.player1Payoff} P2:${r.player2Payoff}`);
  }
  console.log(`Final: P1=${gameData.player1TotalPayoff} P2=${gameData.player2TotalPayoff}`);
  console.log("Winner:", gameData.winner ? (gameData.winner === player1 ? "Player 1" : "Player 2") : "Draw");

  const winner = gameData.winner || "0x0000000000000000000000000000000000000000";
  const resultHash = keccak256(toBytes(JSON.stringify(gameData)));

  // 3. Close betting first
  if (spectatorBettingAddress) {
    try {
      console.log("\nClosing betting...");
      const closeTx = await walletClient.writeContract({
        address: spectatorBettingAddress,
        abi: SPECTATOR_BETTING_ABI,
        functionName: "closeBetting",
        args: [BigInt(matchId)],
      });
      await publicClient.waitForTransactionReceipt({ hash: closeTx });
      console.log("Betting closed.");
    } catch (e) {
      console.warn("closeBetting failed (may already be closed):", (e as Error).message?.slice(0, 100));
    }
  }

  // 4. Record result on chain
  console.log("\nRecording result on-chain...");
  const recordTx = await walletClient.writeContract({
    address: matchRegistryAddress,
    abi: MATCH_REGISTRY_ABI,
    functionName: "recordResult",
    args: [BigInt(matchId), winner as `0x${string}`, resultHash],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: recordTx });
  console.log("recordResult tx:", recordTx, "status:", receipt.status);

  // 5. Store replay state hash on chain
  try {
    console.log("Storing replay state hash...");
    const replayTx = await walletClient.writeContract({
      address: matchRegistryAddress,
      abi: MATCH_REGISTRY_REPLAY_ABI,
      functionName: "storeRoundState",
      args: [BigInt(matchId), resultHash],
    });
    await publicClient.waitForTransactionReceipt({ hash: replayTx });
    console.log("Replay hash stored.");
  } catch (e) {
    console.warn("storeRoundState failed:", (e as Error).message?.slice(0, 100));
  }

  // 6. Settle bets
  if (spectatorBettingAddress && gameData.winner) {
    try {
      console.log("Settling bets...");
      const settleTx = await walletClient.writeContract({
        address: spectatorBettingAddress,
        abi: SPECTATOR_BETTING_ABI,
        functionName: "settleBets",
        args: [BigInt(matchId), gameData.winner as `0x${string}`],
      });
      await publicClient.waitForTransactionReceipt({ hash: settleTx });
      console.log("Bets settled.");
    } catch (e) {
      console.warn("settleBets failed:", (e as Error).message?.slice(0, 100));
    }
  }

  // 7. Store in SQLite for replay
  console.log("\nStoring match result in SQLite...");
  const store = getMatchStore();
  const matchResult: MatchResult = {
    matchId,
    tournamentId: Number(matchRaw.tournamentId),
    round: Number(matchRaw.round),
    winner: gameData.winner,
    loser: gameData.winner ? (gameData.winner === player1 ? player2 : player1) : null,
    isDraw: !gameData.winner,
    isUpset: false,
    gameType: 1, // StrategyArena
    tournamentStage: `round_${matchRaw.round}`,
    player1Actions: [],
    player2Actions: [],
    stats: gameData,
    duration: 300,
  };

  store.saveMatchResult(matchResult);
  console.log("Match result saved to SQLite.");

  // Verify
  const saved = store.getMatch(matchId);
  console.log("\nVerification - SQLite match:", saved ? {
    matchId: saved.matchId,
    winner: saved.winner,
    statsRounds: (saved.stats as Record<string, unknown>)?.rounds ? "present" : "missing",
  } : "NOT FOUND");

  console.log("\nMatch #" + matchId + " resolved successfully!");
  console.log("Replay data is now available via GraphQL matchReplay query.");
}

main().catch(console.error);
