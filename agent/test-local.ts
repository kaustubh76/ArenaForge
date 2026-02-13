/**
 * ArenaForge E2E Test — Runs a full StrategyArena tournament against local Anvil.
 *
 * Prerequisites:
 *   npm run anvil:start   (deploys contracts, writes .env)
 *
 * Usage:
 *   npm run test:e2e
 */
import * as dotenv from "dotenv";
dotenv.config();

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  defineChain,
  type WalletClient,
  type PublicClient,
  type Account,
  type Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// =========================================================================
// Config
// =========================================================================

const localhost = defineChain({
  id: 31337,
  name: "Localhost (Anvil)",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

// Anvil default accounts 0-4
const ANVIL_KEYS: `0x${string}`[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
];

// =========================================================================
// ABIs (matching contract-client.ts)
// =========================================================================

const ArenaCoreAbi: Abi = [
  { type: "function", name: "registerAgent", stateMutability: "nonpayable", inputs: [{ name: "moltbookHandle", type: "string" }], outputs: [] },
  { type: "function", name: "createTournament", stateMutability: "nonpayable", inputs: [{ name: "name", type: "string" }, { name: "gameType", type: "uint8" }, { name: "format", type: "uint8" }, { name: "entryStake", type: "uint256" }, { name: "maxParticipants", type: "uint256" }, { name: "roundCount", type: "uint256" }, { name: "parametersHash", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "joinTournament", stateMutability: "payable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "startTournament", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "completeTournament", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "winner", type: "address" }], outputs: [] },
  { type: "function", name: "advanceRound", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "updateElo", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "newElo", type: "uint256" }, { name: "won", type: "bool" }], outputs: [] },
  { type: "function", name: "evolveParameters", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "newParametersHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "getTournament", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "name", type: "string" }, { name: "gameType", type: "uint8" }, { name: "format", type: "uint8" }, { name: "status", type: "uint8" }, { name: "entryStake", type: "uint256" }, { name: "maxParticipants", type: "uint256" }, { name: "currentParticipants", type: "uint256" }, { name: "prizePool", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "roundCount", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "parametersHash", type: "bytes32" }] }] },
  { type: "function", name: "getAgent", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "agentAddress", type: "address" }, { name: "moltbookHandle", type: "string" }, { name: "elo", type: "uint256" }, { name: "matchesPlayed", type: "uint256" }, { name: "wins", type: "uint256" }, { name: "losses", type: "uint256" }, { name: "registered", type: "bool" }] }] },
  { type: "function", name: "tournamentCounter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "isParticipant", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent", type: "address" }], outputs: [{ name: "", type: "bool" }] },
];

const WagerEscrowAbi: Abi = [
  { type: "function", name: "lockForMatch", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent1", type: "address" }, { name: "agent2", type: "address" }], outputs: [] },
  { type: "function", name: "distributePrize", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "winner", type: "address" }, { name: "prizeAmount", type: "uint256" }], outputs: [] },
  { type: "function", name: "batchDistribute", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "recipients", type: "address[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
  { type: "function", name: "tournamentPools", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
];

const MatchRegistryAbi: Abi = [
  { type: "function", name: "createMatch", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "round", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "startMatch", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }], outputs: [] },
  { type: "function", name: "recordResult", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "winner", type: "address" }, { name: "resultHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "getMatch", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "tournamentId", type: "uint256" }, { name: "round", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "winner", type: "address" }, { name: "resultHash", type: "bytes32" }, { name: "timestamp", type: "uint256" }, { name: "status", type: "uint8" }] }] },
  { type: "function", name: "matchCounter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

const StrategyArenaAbi: Abi = [
  { type: "function", name: "initMatch", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "totalRounds", type: "uint256" }, { name: "commitTimeout", type: "uint256" }, { name: "revealTimeout", type: "uint256" }], outputs: [] },
  { type: "function", name: "commitMove", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "moveHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "revealMove", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "move", type: "uint8" }, { name: "salt", type: "bytes32" }], outputs: [] },
  { type: "function", name: "resolveRound", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }], outputs: [] },
  { type: "function", name: "advanceRound", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "commitTimeout", type: "uint256" }, { name: "revealTimeout", type: "uint256" }], outputs: [] },
  { type: "function", name: "getMatchState", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "totalRounds", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "player1Score", type: "uint256" }, { name: "player2Score", type: "uint256" }, { name: "commitDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" }, { name: "initialized", type: "bool" }] }] },
];

// =========================================================================
// Helpers
// =========================================================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    testsFailed++;
    console.error(`  FAIL: ${message}`);
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  testsPassed++;
  console.log(`  PASS: ${message}`);
}

async function waitTx(pub: PublicClient, hash: `0x${string}`): Promise<void> {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted: ${hash}`);
  }
}

// Move enum values (matches StrategyArena.sol)
const COOPERATE = 1;
const DEFECT = 2;

// =========================================================================
// Main
// =========================================================================

async function main(): Promise<void> {
  console.log("=== ArenaForge E2E Test ===\n");

  // Validate env
  const coreAddr = process.env.ARENA_CORE_ADDRESS as `0x${string}`;
  const escrowAddr = process.env.ESCROW_ADDRESS as `0x${string}`;
  const registryAddr = process.env.MATCH_REGISTRY_ADDRESS as `0x${string}`;
  const strategyAddr = process.env.STRATEGY_ARENA_ADDRESS as `0x${string}`;

  if (!coreAddr || !escrowAddr || !registryAddr || !strategyAddr) {
    console.error("Missing contract addresses in .env. Run: npm run anvil:start");
    process.exit(1);
  }

  // Create clients
  const publicClient = createPublicClient({ chain: localhost, transport: http() });

  const accounts = ANVIL_KEYS.map((k) => privateKeyToAccount(k));
  const wallets = accounts.map((a) =>
    createWalletClient({ chain: localhost, transport: http(), account: a })
  );

  const deployer = wallets[0];
  const agentWallets = wallets.slice(1, 5);
  const agentAddresses = accounts.slice(1, 5).map((a) => a.address);

  console.log(`Deployer:  ${accounts[0].address}`);
  for (let i = 0; i < 4; i++) {
    console.log(`Agent ${i + 1}:   ${agentAddresses[i]}`);
  }
  console.log();

  // ------------------------------------------------------------------
  // PHASE 1: Register Agents
  // ------------------------------------------------------------------
  console.log("--- Phase 1: Register Agents ---");

  for (let i = 0; i < 4; i++) {
    const handle = `TestAgent_${["Alpha", "Beta", "Gamma", "Delta"][i]}`;
    const hash = await agentWallets[i].writeContract({
      address: coreAddr,
      abi: ArenaCoreAbi,
      functionName: "registerAgent",
      args: [handle],
    });
    await waitTx(publicClient, hash);
  }

  // Verify registration
  for (let i = 0; i < 4; i++) {
    const agent = await publicClient.readContract({
      address: coreAddr,
      abi: ArenaCoreAbi,
      functionName: "getAgent",
      args: [agentAddresses[i]],
    }) as Record<string, unknown>;
    assert(agent.registered === true, `Agent ${i + 1} registered`);
  }

  // ------------------------------------------------------------------
  // PHASE 2: Create Tournament
  // ------------------------------------------------------------------
  console.log("\n--- Phase 2: Create Tournament ---");

  const entryStake = BigInt(1e17); // 0.1 ETH
  const paramsHash = keccak256(encodePacked(["string"], ["e2e_test_v1"]));

  const createHash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "createTournament",
    args: [
      "E2E Test Tournament",
      1, // StrategyArena
      0, // SwissSystem
      entryStake,
      BigInt(4), // maxParticipants
      BigInt(2), // roundCount
      paramsHash,
    ],
  });
  await waitTx(publicClient, createHash);

  const tournamentId = BigInt(1);
  const tournament = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getTournament",
    args: [tournamentId],
  }) as Record<string, unknown>;

  assert(tournament.name === "E2E Test Tournament", "Tournament created with correct name");
  assert(Number(tournament.gameType) === 1, "Game type is StrategyArena");

  // ------------------------------------------------------------------
  // PHASE 3: Join Tournament
  // ------------------------------------------------------------------
  console.log("\n--- Phase 3: Join Tournament ---");

  for (let i = 0; i < 4; i++) {
    const hash = await agentWallets[i].writeContract({
      address: coreAddr,
      abi: ArenaCoreAbi,
      functionName: "joinTournament",
      args: [tournamentId],
      value: entryStake,
    });
    await waitTx(publicClient, hash);
  }

  // Verify
  const tournamentAfterJoin = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getTournament",
    args: [tournamentId],
  }) as Record<string, unknown>;

  assert(Number(tournamentAfterJoin.currentParticipants) === 4, "4 participants joined");

  const pool = await publicClient.readContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "tournamentPools",
    args: [tournamentId],
  }) as bigint;

  assert(pool === entryStake * BigInt(4), `Prize pool is ${pool} (expected ${entryStake * BigInt(4)})`);

  // ------------------------------------------------------------------
  // PHASE 4: Start Tournament
  // ------------------------------------------------------------------
  console.log("\n--- Phase 4: Start Tournament ---");

  const startHash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "startTournament",
    args: [tournamentId],
  });
  await waitTx(publicClient, startHash);

  const started = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getTournament",
    args: [tournamentId],
  }) as Record<string, unknown>;

  assert(Number(started.status) === 1, "Tournament status is Active");

  // ------------------------------------------------------------------
  // PHASE 5: Round 1 — Create Matches
  // ------------------------------------------------------------------
  console.log("\n--- Phase 5: Round 1 Matches ---");

  // Match 1: Agent 1 vs Agent 2
  const match1CreateHash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "createMatch",
    args: [tournamentId, BigInt(1), agentAddresses[0], agentAddresses[1]],
  });
  await waitTx(publicClient, match1CreateHash);

  // Match 2: Agent 3 vs Agent 4
  const match2CreateHash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "createMatch",
    args: [tournamentId, BigInt(1), agentAddresses[2], agentAddresses[3]],
  });
  await waitTx(publicClient, match2CreateHash);

  const matchId1 = BigInt(1);
  const matchId2 = BigInt(2);

  // Lock escrow for both matches
  const lock1Hash = await deployer.writeContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "lockForMatch",
    args: [tournamentId, agentAddresses[0], agentAddresses[1]],
  });
  await waitTx(publicClient, lock1Hash);

  const lock2Hash = await deployer.writeContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "lockForMatch",
    args: [tournamentId, agentAddresses[2], agentAddresses[3]],
  });
  await waitTx(publicClient, lock2Hash);

  // Start matches
  const startM1 = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "startMatch",
    args: [matchId1],
  });
  await waitTx(publicClient, startM1);

  const startM2 = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "startMatch",
    args: [matchId2],
  });
  await waitTx(publicClient, startM2);

  assert(true, "Matches 1 & 2 created, locked, and started");

  // ------------------------------------------------------------------
  // PHASE 6: StrategyArena — Init, Commit, Reveal, Resolve
  // ------------------------------------------------------------------
  console.log("\n--- Phase 6: Strategy Arena Commit-Reveal ---");

  // Init matches on StrategyArena contract
  const initM1 = await deployer.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "initMatch",
    args: [matchId1, agentAddresses[0], agentAddresses[1], BigInt(2), BigInt(300), BigInt(300)],
  });
  await waitTx(publicClient, initM1);

  const initM2 = await deployer.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "initMatch",
    args: [matchId2, agentAddresses[2], agentAddresses[3], BigInt(2), BigInt(300), BigInt(300)],
  });
  await waitTx(publicClient, initM2);

  assert(true, "StrategyArena matches initialized");

  // Helper: play one round of commit-reveal
  async function playRound(
    matchId: bigint,
    p1Idx: number,
    p2Idx: number,
    p1Move: number,
    p2Move: number
  ): Promise<void> {
    const salt1 = keccak256(encodePacked(["string"], [`salt_${matchId}_${p1Move}_1`]));
    const salt2 = keccak256(encodePacked(["string"], [`salt_${matchId}_${p2Move}_2`]));

    // Compute commitment hashes (must match: keccak256(abi.encodePacked(move, salt)))
    const hash1 = keccak256(encodePacked(["uint8", "bytes32"], [p1Move, salt1]));
    const hash2 = keccak256(encodePacked(["uint8", "bytes32"], [p2Move, salt2]));

    // Commit
    const c1 = await agentWallets[p1Idx].writeContract({
      address: strategyAddr,
      abi: StrategyArenaAbi,
      functionName: "commitMove",
      args: [matchId, hash1],
      chain: localhost,
      account: accounts[p1Idx + 1],
    });
    await waitTx(publicClient, c1);

    const c2 = await agentWallets[p2Idx].writeContract({
      address: strategyAddr,
      abi: StrategyArenaAbi,
      functionName: "commitMove",
      args: [matchId, hash2],
      chain: localhost,
      account: accounts[p2Idx + 1],
    });
    await waitTx(publicClient, c2);

    // Reveal
    const r1 = await agentWallets[p1Idx].writeContract({
      address: strategyAddr,
      abi: StrategyArenaAbi,
      functionName: "revealMove",
      args: [matchId, p1Move, salt1],
      chain: localhost,
      account: accounts[p1Idx + 1],
    });
    await waitTx(publicClient, r1);

    const r2 = await agentWallets[p2Idx].writeContract({
      address: strategyAddr,
      abi: StrategyArenaAbi,
      functionName: "revealMove",
      args: [matchId, p2Move, salt2],
      chain: localhost,
      account: accounts[p2Idx + 1],
    });
    await waitTx(publicClient, r2);

    // Resolve
    const resolve = await deployer.writeContract({
      address: strategyAddr,
      abi: StrategyArenaAbi,
      functionName: "resolveRound",
      args: [matchId],
    });
    await waitTx(publicClient, resolve);
  }

  // Match 1, Round 1: Agent1 cooperates, Agent2 defects → Agent2 wins round
  await playRound(matchId1, 0, 1, COOPERATE, DEFECT);
  assert(true, "Match 1 Round 1: Agent1=Cooperate, Agent2=Defect");

  // Match 2, Round 1: Agent3 defects, Agent4 cooperates → Agent3 wins round
  await playRound(matchId2, 2, 3, DEFECT, COOPERATE);
  assert(true, "Match 2 Round 1: Agent3=Defect, Agent4=Cooperate");

  // Advance to round 2
  const advM1 = await deployer.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "advanceRound",
    args: [matchId1, BigInt(300), BigInt(300)],
  });
  await waitTx(publicClient, advM1);

  const advM2 = await deployer.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "advanceRound",
    args: [matchId2, BigInt(300), BigInt(300)],
  });
  await waitTx(publicClient, advM2);

  // Match 1, Round 2: Both defect → tie round (Agent2 still ahead overall)
  await playRound(matchId1, 0, 1, DEFECT, DEFECT);
  assert(true, "Match 1 Round 2: Both Defect");

  // Match 2, Round 2: Both cooperate → tie round (Agent3 still ahead overall)
  await playRound(matchId2, 2, 3, COOPERATE, COOPERATE);
  assert(true, "Match 2 Round 2: Both Cooperate");

  // Verify match state scores
  const state1 = await publicClient.readContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "getMatchState",
    args: [matchId1],
  }) as Record<string, unknown>;

  // Match 1: R1 = C vs D (p1=0, p2=10000), R2 = D vs D (p1=2000, p2=2000)
  // Total: p1=2000, p2=12000 → Agent2 (agentAddresses[1]) wins
  assert(Number(state1.player1Score) === 2000, `Match1 p1Score=2000 (got ${state1.player1Score})`);
  assert(Number(state1.player2Score) === 12000, `Match1 p2Score=12000 (got ${state1.player2Score})`);

  const state2 = await publicClient.readContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "getMatchState",
    args: [matchId2],
  }) as Record<string, unknown>;

  // Match 2: R1 = D vs C (p1=10000, p2=0), R2 = C vs C (p1=6000, p2=6000)
  // Total: p1=16000, p2=6000 → Agent3 (agentAddresses[2]) wins
  assert(Number(state2.player1Score) === 16000, `Match2 p1Score=16000 (got ${state2.player1Score})`);
  assert(Number(state2.player2Score) === 6000, `Match2 p2Score=6000 (got ${state2.player2Score})`);

  // ------------------------------------------------------------------
  // PHASE 7: Record Results
  // ------------------------------------------------------------------
  console.log("\n--- Phase 7: Record Match Results ---");

  // Match 1 winner: Agent 2 (agentAddresses[1])
  const resultHash1 = keccak256(encodePacked(["uint256", "address"], [matchId1, agentAddresses[1]]));
  const rec1 = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "recordResult",
    args: [matchId1, agentAddresses[1], resultHash1],
  });
  await waitTx(publicClient, rec1);

  // Match 2 winner: Agent 3 (agentAddresses[2])
  const resultHash2 = keccak256(encodePacked(["uint256", "address"], [matchId2, agentAddresses[2]]));
  const rec2 = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "recordResult",
    args: [matchId2, agentAddresses[2], resultHash2],
  });
  await waitTx(publicClient, rec2);

  // Verify match results
  const match1Result = await publicClient.readContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "getMatch",
    args: [matchId1],
  }) as Record<string, unknown>;

  assert(String(match1Result.winner).toLowerCase() === agentAddresses[1].toLowerCase(), "Match 1 winner is Agent 2");
  assert(Number(match1Result.status) === 2, "Match 1 status is Completed");

  // ------------------------------------------------------------------
  // PHASE 8: Update ELO + Advance Round
  // ------------------------------------------------------------------
  console.log("\n--- Phase 8: Update ELO & Advance Round ---");

  // ELO updates (K=32, starting 1200)
  // Match 1: Agent 2 wins (expected = 0.5 since equal ELO), +16
  // Match 2: Agent 3 wins, +16
  const elo1 = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "updateElo",
    args: [agentAddresses[1], BigInt(1216), true],
  });
  await waitTx(publicClient, elo1);

  const elo2 = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "updateElo",
    args: [agentAddresses[0], BigInt(1184), false],
  });
  await waitTx(publicClient, elo2);

  const elo3 = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "updateElo",
    args: [agentAddresses[2], BigInt(1216), true],
  });
  await waitTx(publicClient, elo3);

  const elo4 = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "updateElo",
    args: [agentAddresses[3], BigInt(1184), false],
  });
  await waitTx(publicClient, elo4);

  // Verify ELO
  const agentData2 = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getAgent",
    args: [agentAddresses[1]],
  }) as Record<string, unknown>;

  assert(Number(agentData2.elo) === 1216, `Agent 2 ELO is 1216 (got ${agentData2.elo})`);
  assert(Number(agentData2.wins) === 1, `Agent 2 has 1 win`);

  // Advance tournament round
  const advRound = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "advanceRound",
    args: [tournamentId],
  });
  await waitTx(publicClient, advRound);

  assert(true, "Tournament advanced to round 2");

  // ------------------------------------------------------------------
  // PHASE 9: Round 2 — Winners face off
  // ------------------------------------------------------------------
  console.log("\n--- Phase 9: Round 2 — Agent2 vs Agent3 ---");

  // Match 3: Agent 2 vs Agent 3
  const match3Hash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "createMatch",
    args: [tournamentId, BigInt(2), agentAddresses[1], agentAddresses[2]],
  });
  await waitTx(publicClient, match3Hash);

  const matchId3 = BigInt(3);

  const startM3 = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "startMatch",
    args: [matchId3],
  });
  await waitTx(publicClient, startM3);

  const initM3 = await deployer.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "initMatch",
    args: [matchId3, agentAddresses[1], agentAddresses[2], BigInt(2), BigInt(300), BigInt(300)],
  });
  await waitTx(publicClient, initM3);

  // R1: Agent2 defects, Agent3 cooperates → Agent2 wins round
  await playRound(matchId3, 1, 2, DEFECT, COOPERATE);
  assert(true, "Match 3 Round 1: Agent2=Defect, Agent3=Cooperate");

  const advM3 = await deployer.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "advanceRound",
    args: [matchId3, BigInt(300), BigInt(300)],
  });
  await waitTx(publicClient, advM3);

  // R2: Both cooperate → tie
  await playRound(matchId3, 1, 2, COOPERATE, COOPERATE);
  assert(true, "Match 3 Round 2: Both Cooperate");

  // Match 3 result: Agent2 total=16000, Agent3 total=6000 → Agent2 wins
  const state3 = await publicClient.readContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "getMatchState",
    args: [matchId3],
  }) as Record<string, unknown>;

  assert(
    Number(state3.player1Score) > Number(state3.player2Score),
    `Match3: Agent2 (${state3.player1Score}) > Agent3 (${state3.player2Score})`
  );

  const resultHash3 = keccak256(encodePacked(["uint256", "address"], [matchId3, agentAddresses[1]]));
  const rec3 = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "recordResult",
    args: [matchId3, agentAddresses[1], resultHash3],
  });
  await waitTx(publicClient, rec3);

  assert(true, "Match 3 result recorded: Agent 2 wins tournament");

  // ------------------------------------------------------------------
  // PHASE 10: Distribute Prizes & Complete
  // ------------------------------------------------------------------
  console.log("\n--- Phase 10: Prize Distribution & Completion ---");

  const finalPool = await publicClient.readContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "tournamentPools",
    args: [tournamentId],
  }) as bigint;

  console.log(`  Prize pool: ${finalPool} wei (${Number(finalPool) / 1e18} ETH)`);

  // Distribute: 60% to winner (Agent2), 25% to runner-up (Agent3), 15% to 3rd (split Agent1/4)
  const fee = (finalPool * BigInt(500)) / BigInt(10000); // 5%
  const distributable = finalPool - fee;
  const prize1 = (distributable * BigInt(6000)) / BigInt(10000); // 60%
  const prize2 = (distributable * BigInt(2500)) / BigInt(10000); // 25%
  const prize3 = (distributable * BigInt(1500)) / BigInt(10000); // 15%

  const batchHash = await deployer.writeContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "batchDistribute",
    args: [
      tournamentId,
      [agentAddresses[1], agentAddresses[2], agentAddresses[0]],
      [prize1, prize2, prize3],
    ],
  });
  await waitTx(publicClient, batchHash);

  assert(true, "Prizes distributed via batchDistribute");

  // Complete tournament
  const completeHash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "completeTournament",
    args: [tournamentId, agentAddresses[1]],
  });
  await waitTx(publicClient, completeHash);

  const final = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getTournament",
    args: [tournamentId],
  }) as Record<string, unknown>;

  assert(Number(final.status) === 2, "Tournament status is Completed");

  // Final agent check
  const finalAgent2 = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getAgent",
    args: [agentAddresses[1]],
  }) as Record<string, unknown>;

  assert(Number(finalAgent2.wins) >= 1, "Tournament winner has wins recorded");

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log("\n========================================");
  console.log(`  PASSED: ${testsPassed}`);
  console.log(`  FAILED: ${testsFailed}`);
  console.log("========================================");

  if (testsFailed > 0) {
    console.log("\nE2E TEST FAILED");
    process.exit(1);
  } else {
    console.log("\n=== ALL E2E TESTS PASSED ===");
  }
}

main().catch((err) => {
  console.error("\nE2E FAILED:", err);
  process.exit(1);
});
