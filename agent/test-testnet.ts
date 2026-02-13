/**
 * ArenaForge Testnet E2E Test — Full tournament lifecycle on Monad Testnet.
 *
 * Uses the deployer wallet (arena agent) + 2 ephemeral player wallets funded
 * from the deployer. Runs a single StrategyArena tournament with commit-reveal.
 *
 * Prerequisites:
 *   1. Contracts deployed to Monad Testnet (addresses in .env)
 *   2. Deployer wallet funded with MON
 *
 * Usage:
 *   npm run test:testnet
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
  parseEther,
  formatEther,
  type WalletClient,
  type PublicClient,
  type Account,
  type Abi,
  type Chain,
  type Transport,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

// =========================================================================
// Config — reads everything from environment
// =========================================================================

const rpcUrl = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const deployerKey = process.env.ARENA_AGENT_PRIVATE_KEY as `0x${string}`;
if (!deployerKey) {
  console.error("ARENA_AGENT_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const coreAddr = process.env.ARENA_CORE_ADDRESS as `0x${string}`;
const escrowAddr = process.env.ESCROW_ADDRESS as `0x${string}`;
const registryAddr = process.env.MATCH_REGISTRY_ADDRESS as `0x${string}`;
const strategyAddr = process.env.STRATEGY_ARENA_ADDRESS as `0x${string}`;

if (!coreAddr || !escrowAddr || !registryAddr || !strategyAddr) {
  console.error("Missing contract addresses in .env. Deploy first.");
  process.exit(1);
}

// =========================================================================
// ABIs
// =========================================================================

const ArenaCoreAbi: Abi = [
  { type: "function", name: "registerAgent", stateMutability: "nonpayable", inputs: [{ name: "moltbookHandle", type: "string" }], outputs: [] },
  { type: "function", name: "createTournament", stateMutability: "nonpayable", inputs: [{ name: "name", type: "string" }, { name: "gameType", type: "uint8" }, { name: "format", type: "uint8" }, { name: "entryStake", type: "uint256" }, { name: "maxParticipants", type: "uint256" }, { name: "roundCount", type: "uint256" }, { name: "parametersHash", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "joinTournament", stateMutability: "payable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "startTournament", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "completeTournament", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "winner", type: "address" }], outputs: [] },
  { type: "function", name: "advanceRound", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "updateElo", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "newElo", type: "uint256" }, { name: "won", type: "bool" }], outputs: [] },
  { type: "function", name: "getTournament", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "name", type: "string" }, { name: "gameType", type: "uint8" }, { name: "format", type: "uint8" }, { name: "status", type: "uint8" }, { name: "entryStake", type: "uint256" }, { name: "maxParticipants", type: "uint256" }, { name: "currentParticipants", type: "uint256" }, { name: "prizePool", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "roundCount", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "parametersHash", type: "bytes32" }] }] },
  { type: "function", name: "getAgent", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "agentAddress", type: "address" }, { name: "moltbookHandle", type: "string" }, { name: "elo", type: "uint256" }, { name: "matchesPlayed", type: "uint256" }, { name: "wins", type: "uint256" }, { name: "losses", type: "uint256" }, { name: "registered", type: "bool" }] }] },
  { type: "function", name: "tournamentCounter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "isParticipant", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "gameModeContracts", stateMutability: "view", inputs: [{ name: "gameTypeId", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
];

const WagerEscrowAbi: Abi = [
  { type: "function", name: "lockForMatch", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent1", type: "address" }, { name: "agent2", type: "address" }], outputs: [] },
  { type: "function", name: "distributePrize", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "winner", type: "address" }, { name: "prizeAmount", type: "uint256" }], outputs: [] },
  { type: "function", name: "batchDistribute", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "recipients", type: "address[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
  { type: "function", name: "tournamentPools", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "authorizedCaller", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
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

const COOPERATE = 1;
const DEFECT = 2;

// =========================================================================
// Main
// =========================================================================

async function main(): Promise<void> {
  console.log("=== ArenaForge Testnet E2E Test ===\n");
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Chain: Monad Testnet (10143)`);

  // --- Create clients ---
  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
  const deployerAccount = privateKeyToAccount(deployerKey);
  const deployer = createWalletClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
    account: deployerAccount,
  });

  console.log(`Deployer: ${deployerAccount.address}`);

  const balance = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`Balance: ${formatEther(balance)} MON\n`);

  // --- Generate 2 ephemeral player wallets ---
  console.log("--- Generating Player Wallets ---");
  const player1Key = generatePrivateKey();
  const player2Key = generatePrivateKey();
  const player1Account = privateKeyToAccount(player1Key);
  const player2Account = privateKeyToAccount(player2Key);

  const player1Wallet = createWalletClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
    account: player1Account,
  });
  const player2Wallet = createWalletClient({
    chain: monadTestnet,
    transport: http(rpcUrl),
    account: player2Account,
  });

  console.log(`Player 1: ${player1Account.address}`);
  console.log(`Player 2: ${player2Account.address}`);

  // Fund players from deployer (0.2 MON each — covers stake + gas)
  const fundAmount = parseEther("0.2");

  console.log(`\nFunding players with ${formatEther(fundAmount)} MON each...`);

  const fund1Hash = await deployer.sendTransaction({
    to: player1Account.address,
    value: fundAmount,
  });
  await waitTx(publicClient, fund1Hash);
  console.log(`  Player 1 funded: ${fund1Hash}`);

  const fund2Hash = await deployer.sendTransaction({
    to: player2Account.address,
    value: fundAmount,
  });
  await waitTx(publicClient, fund2Hash);
  console.log(`  Player 2 funded: ${fund2Hash}`);

  // ------------------------------------------------------------------
  // PHASE 1: Verify Deployment & Permissions
  // ------------------------------------------------------------------
  console.log("\n--- Phase 1: Verify Deployment ---");

  const tournamentCountBefore = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "tournamentCounter",
  }) as bigint;
  console.log(`  Existing tournaments: ${tournamentCountBefore}`);

  // Verify game mode registrations
  const strategyModeAddr = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "gameModeContracts",
    args: [BigInt(1)],
  }) as string;
  assert(
    strategyModeAddr.toLowerCase() === strategyAddr.toLowerCase(),
    `StrategyArena registered at correct address`
  );

  const escrowAuth = await publicClient.readContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "authorizedCaller",
  }) as string;
  assert(
    escrowAuth.toLowerCase() === coreAddr.toLowerCase(),
    `WagerEscrow authorized caller is ArenaCore`
  );

  // ------------------------------------------------------------------
  // PHASE 2: Register Agents
  // ------------------------------------------------------------------
  console.log("\n--- Phase 2: Register Agents ---");

  // Register player 1
  const reg1Hash = await player1Wallet.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "registerAgent",
    args: ["TestPlayer_Alpha"],
  });
  await waitTx(publicClient, reg1Hash);

  // Register player 2
  const reg2Hash = await player2Wallet.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "registerAgent",
    args: ["TestPlayer_Beta"],
  });
  await waitTx(publicClient, reg2Hash);

  // Verify
  const agent1Data = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getAgent",
    args: [player1Account.address],
  }) as Record<string, unknown>;
  assert(agent1Data.registered === true, "Player 1 registered");

  const agent2Data = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getAgent",
    args: [player2Account.address],
  }) as Record<string, unknown>;
  assert(agent2Data.registered === true, "Player 2 registered");

  // ------------------------------------------------------------------
  // PHASE 3: Create Tournament
  // ------------------------------------------------------------------
  console.log("\n--- Phase 3: Create Tournament ---");

  const entryStake = parseEther("0.01"); // 0.01 MON
  const paramsHash = keccak256(encodePacked(["string"], ["testnet_e2e_v1"]));

  const createHash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "createTournament",
    args: [
      "Testnet E2E Tournament",
      1,          // StrategyArena
      0,          // SwissSystem
      entryStake,
      BigInt(2),  // maxParticipants
      BigInt(1),  // roundCount (1 round for quick test)
      paramsHash,
    ],
  });
  await waitTx(publicClient, createHash);

  const tournamentCountAfter = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "tournamentCounter",
  }) as bigint;

  const tournamentId = tournamentCountAfter;
  console.log(`  Tournament ID: ${tournamentId}`);

  const tournament = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getTournament",
    args: [tournamentId],
  }) as Record<string, unknown>;

  assert(tournament.name === "Testnet E2E Tournament", "Tournament name correct");
  assert(Number(tournament.gameType) === 1, "Game type is StrategyArena");
  assert(Number(tournament.status) === 0, "Tournament status is Open");

  // ------------------------------------------------------------------
  // PHASE 4: Join Tournament
  // ------------------------------------------------------------------
  console.log("\n--- Phase 4: Join Tournament ---");

  const join1Hash = await player1Wallet.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "joinTournament",
    args: [tournamentId],
    value: entryStake,
  });
  await waitTx(publicClient, join1Hash);

  const join2Hash = await player2Wallet.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "joinTournament",
    args: [tournamentId],
    value: entryStake,
  });
  await waitTx(publicClient, join2Hash);

  const tournamentAfterJoin = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getTournament",
    args: [tournamentId],
  }) as Record<string, unknown>;

  assert(Number(tournamentAfterJoin.currentParticipants) === 2, "2 participants joined");

  const pool = await publicClient.readContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "tournamentPools",
    args: [tournamentId],
  }) as bigint;
  assert(pool === entryStake * BigInt(2), `Prize pool is ${formatEther(pool)} MON`);

  // ------------------------------------------------------------------
  // PHASE 5: Start Tournament
  // ------------------------------------------------------------------
  console.log("\n--- Phase 5: Start Tournament ---");

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
  // PHASE 6: Create & Start Match
  // ------------------------------------------------------------------
  console.log("\n--- Phase 6: Create Match ---");

  const matchCreateHash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "createMatch",
    args: [tournamentId, BigInt(1), player1Account.address, player2Account.address],
  });
  await waitTx(publicClient, matchCreateHash);

  const matchCount = await publicClient.readContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "matchCounter",
  }) as bigint;
  const matchId = matchCount;
  console.log(`  Match ID: ${matchId}`);

  // Lock escrow
  const lockHash = await deployer.writeContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "lockForMatch",
    args: [tournamentId, player1Account.address, player2Account.address],
  });
  await waitTx(publicClient, lockHash);

  // Start match
  const startMatchHash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "startMatch",
    args: [matchId],
  });
  await waitTx(publicClient, startMatchHash);

  assert(true, "Match created, escrow locked, match started");

  // ------------------------------------------------------------------
  // PHASE 7: StrategyArena Commit-Reveal
  // ------------------------------------------------------------------
  console.log("\n--- Phase 7: Strategy Arena Commit-Reveal ---");

  // Init match on StrategyArena
  const initHash = await deployer.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "initMatch",
    args: [matchId, player1Account.address, player2Account.address, BigInt(1), BigInt(600), BigInt(600)],
  });
  await waitTx(publicClient, initHash);
  assert(true, "StrategyArena match initialized");

  // Player 1: Cooperate, Player 2: Defect
  const salt1 = keccak256(encodePacked(["string"], [`salt_${matchId}_cooperate_p1`]));
  const salt2 = keccak256(encodePacked(["string"], [`salt_${matchId}_defect_p2`]));
  const hash1 = keccak256(encodePacked(["uint8", "bytes32"], [COOPERATE, salt1]));
  const hash2 = keccak256(encodePacked(["uint8", "bytes32"], [DEFECT, salt2]));

  // Commit moves
  const commit1 = await player1Wallet.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "commitMove",
    args: [matchId, hash1],
  });
  await waitTx(publicClient, commit1);
  assert(true, "Player 1 committed (Cooperate)");

  const commit2 = await player2Wallet.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "commitMove",
    args: [matchId, hash2],
  });
  await waitTx(publicClient, commit2);
  assert(true, "Player 2 committed (Defect)");

  // Reveal moves
  const reveal1 = await player1Wallet.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "revealMove",
    args: [matchId, COOPERATE, salt1],
  });
  await waitTx(publicClient, reveal1);
  assert(true, "Player 1 revealed (Cooperate)");

  const reveal2 = await player2Wallet.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "revealMove",
    args: [matchId, DEFECT, salt2],
  });
  await waitTx(publicClient, reveal2);
  assert(true, "Player 2 revealed (Defect)");

  // Resolve round
  const resolveHash = await deployer.writeContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "resolveRound",
    args: [matchId],
  });
  await waitTx(publicClient, resolveHash);

  // Verify scores: Cooperate vs Defect → P1 gets 0, P2 gets 10000
  const matchState = await publicClient.readContract({
    address: strategyAddr,
    abi: StrategyArenaAbi,
    functionName: "getMatchState",
    args: [matchId],
  }) as Record<string, unknown>;

  assert(Number(matchState.player1Score) === 0, `Player 1 score = 0 (Cooperate vs Defect)`);
  assert(Number(matchState.player2Score) === 10000, `Player 2 score = 10000 (Defect vs Cooperate)`);

  // ------------------------------------------------------------------
  // PHASE 8: Record Result & Update ELO
  // ------------------------------------------------------------------
  console.log("\n--- Phase 8: Record Result & ELO ---");

  // Player 2 wins
  const resultHash = keccak256(encodePacked(["uint256", "address"], [matchId, player2Account.address]));
  const recordHash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "recordResult",
    args: [matchId, player2Account.address, resultHash],
  });
  await waitTx(publicClient, recordHash);

  const matchResult = await publicClient.readContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "getMatch",
    args: [matchId],
  }) as Record<string, unknown>;
  assert(
    String(matchResult.winner).toLowerCase() === player2Account.address.toLowerCase(),
    "Match winner is Player 2"
  );
  assert(Number(matchResult.status) === 2, "Match status is Completed");

  // Update ELO: winner +16, loser -16 (K=32, starting 1200)
  const eloWinHash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "updateElo",
    args: [player2Account.address, BigInt(1216), true],
  });
  await waitTx(publicClient, eloWinHash);

  const eloLossHash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "updateElo",
    args: [player1Account.address, BigInt(1184), false],
  });
  await waitTx(publicClient, eloLossHash);

  const finalAgent2 = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getAgent",
    args: [player2Account.address],
  }) as Record<string, unknown>;
  assert(Number(finalAgent2.elo) === 1216, `Player 2 ELO = 1216`);
  assert(Number(finalAgent2.wins) === 1, `Player 2 has 1 win`);

  const finalAgent1 = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getAgent",
    args: [player1Account.address],
  }) as Record<string, unknown>;
  assert(Number(finalAgent1.elo) === 1184, `Player 1 ELO = 1184`);
  assert(Number(finalAgent1.losses) === 1, `Player 1 has 1 loss`);

  // ------------------------------------------------------------------
  // PHASE 9: Prize Distribution & Complete
  // ------------------------------------------------------------------
  console.log("\n--- Phase 9: Prize Distribution ---");

  const finalPool = await publicClient.readContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "tournamentPools",
    args: [tournamentId],
  }) as bigint;
  console.log(`  Prize pool: ${formatEther(finalPool)} MON`);

  // Simple distribution: 95% to winner, 5% arena fee stays in contract
  const arenaFee = (finalPool * BigInt(500)) / BigInt(10000);
  const winnerPrize = finalPool - arenaFee;

  const distributeHash = await deployer.writeContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "distributePrize",
    args: [tournamentId, player2Account.address, winnerPrize],
  });
  await waitTx(publicClient, distributeHash);
  assert(true, `Winner received ${formatEther(winnerPrize)} MON`);

  // Complete tournament
  const completeHash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "completeTournament",
    args: [tournamentId, player2Account.address],
  });
  await waitTx(publicClient, completeHash);

  const finalTournament = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "getTournament",
    args: [tournamentId],
  }) as Record<string, unknown>;
  assert(Number(finalTournament.status) === 2, "Tournament status is Completed");

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log("\n========================================");
  console.log(`  PASSED: ${testsPassed}`);
  console.log(`  FAILED: ${testsFailed}`);
  console.log("========================================");

  if (testsFailed > 0) {
    console.log("\nTESTNET E2E TEST FAILED");
    process.exit(1);
  } else {
    console.log("\n=== ALL TESTNET E2E TESTS PASSED ===");
    console.log(`\nTournament #${tournamentId} completed on Monad Testnet!`);
    console.log(`Ephemeral wallets used (no need to save):`);
    console.log(`  Player 1: ${player1Account.address}`);
    console.log(`  Player 2: ${player2Account.address}`);
  }
}

main().catch((err) => {
  console.error("\nTESTNET E2E FAILED:", err);
  process.exit(1);
});
