/**
 * ArenaForge Setup Script — Creates active tournaments with live matches on Monad Testnet.
 *
 * This script:
 * 1. Registers 4 agents (Arena_Alpha, Arena_Beta, Arena_Gamma, Arena_Delta)
 * 2. Creates 2 tournaments with 0.02 MON entry stake each (0.04 MON prize pool)
 * 3. Has agents join the tournaments (2 per tournament)
 * 4. Starts the tournaments and creates live matches
 *
 * Prerequisites:
 *   - Contracts deployed to Monad Testnet (addresses in .env)
 *   - Deployer wallet funded with ~1 MON
 *
 * Usage:
 *   npm run setup:arena
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
  type Abi,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

// =========================================================================
// Config
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

if (!coreAddr || !escrowAddr || !registryAddr) {
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
  { type: "function", name: "getTournament", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "name", type: "string" }, { name: "gameType", type: "uint8" }, { name: "format", type: "uint8" }, { name: "status", type: "uint8" }, { name: "entryStake", type: "uint256" }, { name: "maxParticipants", type: "uint256" }, { name: "currentParticipants", type: "uint256" }, { name: "prizePool", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "roundCount", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "parametersHash", type: "bytes32" }] }] },
  { type: "function", name: "getAgent", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "agentAddress", type: "address" }, { name: "moltbookHandle", type: "string" }, { name: "elo", type: "uint256" }, { name: "matchesPlayed", type: "uint256" }, { name: "wins", type: "uint256" }, { name: "losses", type: "uint256" }, { name: "registered", type: "bool" }] }] },
  { type: "function", name: "tournamentCounter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

const WagerEscrowAbi: Abi = [
  { type: "function", name: "lockForMatch", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent1", type: "address" }, { name: "agent2", type: "address" }], outputs: [] },
  { type: "function", name: "tournamentPools", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
];

const MatchRegistryAbi: Abi = [
  { type: "function", name: "createMatch", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "round", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "startMatch", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }], outputs: [] },
  { type: "function", name: "getMatch", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "tournamentId", type: "uint256" }, { name: "round", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "winner", type: "address" }, { name: "resultHash", type: "bytes32" }, { name: "timestamp", type: "uint256" }, { name: "status", type: "uint8" }] }] },
  { type: "function", name: "matchCounter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

// =========================================================================
// Helpers
// =========================================================================

async function waitTx(pub: PublicClient, hash: `0x${string}`): Promise<void> {
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction reverted: ${hash}`);
  }
}

// =========================================================================
// Main
// =========================================================================

async function main(): Promise<void> {
  console.log("=== ArenaForge Setup: Creating Active Tournaments ===\n");
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Chain: Monad Testnet (10143)\n`);

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

  const requiredMon = parseEther("1");
  if (balance < requiredMon) {
    console.error(`Insufficient balance. Need at least 1 MON, have ${formatEther(balance)} MON`);
    process.exit(1);
  }

  // =========================================================================
  // STEP 1: Generate 4 Agent Wallets
  // =========================================================================
  console.log("--- Step 1: Generate Agent Wallets ---");

  const agents = [
    { handle: "Arena_Alpha", key: generatePrivateKey() },
    { handle: "Arena_Beta", key: generatePrivateKey() },
    { handle: "Arena_Gamma", key: generatePrivateKey() },
    { handle: "Arena_Delta", key: generatePrivateKey() },
  ];

  const agentWallets: WalletClient[] = [];
  const agentAddresses: `0x${string}`[] = [];

  for (const agent of agents) {
    const account = privateKeyToAccount(agent.key);
    const wallet = createWalletClient({
      chain: monadTestnet,
      transport: http(rpcUrl),
      account,
    });
    agentWallets.push(wallet);
    agentAddresses.push(account.address);
    console.log(`  ${agent.handle}: ${account.address}`);
  }

  // =========================================================================
  // STEP 2: Fund Agent Wallets (0.1 MON each = 0.02 stake + 0.08 gas buffer)
  // =========================================================================
  console.log("\n--- Step 2: Fund Agent Wallets ---");

  const fundAmount = parseEther("0.1"); // 0.02 MON stake + 0.08 MON gas buffer

  for (let i = 0; i < agents.length; i++) {
    const fundHash = await deployer.sendTransaction({
      to: agentAddresses[i],
      value: fundAmount,
    });
    await waitTx(publicClient, fundHash);
    console.log(`  Funded ${agents[i].handle} with 0.1 MON`);
  }

  // =========================================================================
  // STEP 3: Register All Agents
  // =========================================================================
  console.log("\n--- Step 3: Register Agents ---");

  for (let i = 0; i < agents.length; i++) {
    const regHash = await agentWallets[i].writeContract({
      address: coreAddr,
      abi: ArenaCoreAbi,
      functionName: "registerAgent",
      args: [agents[i].handle],
    });
    await waitTx(publicClient, regHash);

    // Verify registration
    const agentData = await publicClient.readContract({
      address: coreAddr,
      abi: ArenaCoreAbi,
      functionName: "getAgent",
      args: [agentAddresses[i]],
    }) as Record<string, unknown>;

    if (agentData.registered) {
      console.log(`  ✓ Registered ${agents[i].handle} (ELO: ${agentData.elo})`);
    } else {
      console.error(`  ✗ Failed to register ${agents[i].handle}`);
      process.exit(1);
    }
  }

  // =========================================================================
  // STEP 4: Create Tournament 1 (StrategyArena Championship)
  // =========================================================================
  console.log("\n--- Step 4: Create Tournament 1 (StrategyArena) ---");

  const entryStake = parseEther("0.02"); // 0.02 MON entry
  const paramsHash1 = keccak256(encodePacked(["string"], ["strategy_arena_championship_v1"]));

  const create1Hash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "createTournament",
    args: [
      "StrategyArena Championship",
      1,          // GameType: StrategyArena
      0,          // Format: SwissSystem
      entryStake,
      BigInt(2),  // maxParticipants
      BigInt(3),  // roundCount
      paramsHash1,
    ],
  });
  await waitTx(publicClient, create1Hash);

  const tournament1Id = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "tournamentCounter",
  }) as bigint;

  console.log(`  ✓ Created Tournament #${tournament1Id}: StrategyArena Championship`);
  console.log(`    Entry Stake: ${formatEther(entryStake)} MON`);

  // =========================================================================
  // STEP 5: Agents Join Tournament 1 (Alpha + Beta)
  // =========================================================================
  console.log("\n--- Step 5: Agents Join Tournament 1 ---");

  // Agent Alpha joins
  const join1Hash = await agentWallets[0].writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "joinTournament",
    args: [tournament1Id],
    value: entryStake,
  });
  await waitTx(publicClient, join1Hash);
  console.log(`  ✓ ${agents[0].handle} joined Tournament #${tournament1Id}`);

  // Agent Beta joins
  const join2Hash = await agentWallets[1].writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "joinTournament",
    args: [tournament1Id],
    value: entryStake,
  });
  await waitTx(publicClient, join2Hash);
  console.log(`  ✓ ${agents[1].handle} joined Tournament #${tournament1Id}`);

  // Verify prize pool
  const pool1 = await publicClient.readContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "tournamentPools",
    args: [tournament1Id],
  }) as bigint;
  console.log(`  Prize Pool: ${formatEther(pool1)} MON`);

  // =========================================================================
  // STEP 6: Start Tournament 1
  // =========================================================================
  console.log("\n--- Step 6: Start Tournament 1 ---");

  const start1Hash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "startTournament",
    args: [tournament1Id],
  });
  await waitTx(publicClient, start1Hash);
  console.log(`  ✓ Tournament #${tournament1Id} started`);

  // =========================================================================
  // STEP 7: Create Match 1 (Alpha vs Beta)
  // =========================================================================
  console.log("\n--- Step 7: Create Match 1 ---");

  const match1CreateHash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "createMatch",
    args: [tournament1Id, BigInt(1), agentAddresses[0], agentAddresses[1]],
  });
  await waitTx(publicClient, match1CreateHash);

  const match1Id = await publicClient.readContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "matchCounter",
  }) as bigint;
  console.log(`  ✓ Created Match #${match1Id}: ${agents[0].handle} vs ${agents[1].handle}`);

  // Lock escrow for match
  const lock1Hash = await deployer.writeContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "lockForMatch",
    args: [tournament1Id, agentAddresses[0], agentAddresses[1]],
  });
  await waitTx(publicClient, lock1Hash);
  console.log(`  ✓ Escrow locked for Match #${match1Id}`);

  // Start match
  const startMatch1Hash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "startMatch",
    args: [match1Id],
  });
  await waitTx(publicClient, startMatch1Hash);
  console.log(`  ✓ Match #${match1Id} started (InProgress)`);

  // =========================================================================
  // STEP 8: Create Tournament 2 (OracleDuel Masters)
  // =========================================================================
  console.log("\n--- Step 8: Create Tournament 2 (OracleDuel) ---");

  const paramsHash2 = keccak256(encodePacked(["string"], ["oracle_duel_masters_v1"]));

  const create2Hash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "createTournament",
    args: [
      "OracleDuel Masters",
      0,          // GameType: OracleDuel
      0,          // Format: SwissSystem
      entryStake,
      BigInt(2),  // maxParticipants
      BigInt(3),  // roundCount
      paramsHash2,
    ],
  });
  await waitTx(publicClient, create2Hash);

  const tournament2Id = await publicClient.readContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "tournamentCounter",
  }) as bigint;

  console.log(`  ✓ Created Tournament #${tournament2Id}: OracleDuel Masters`);
  console.log(`    Entry Stake: ${formatEther(entryStake)} MON`);

  // =========================================================================
  // STEP 9: Agents Join Tournament 2 (Gamma + Delta)
  // =========================================================================
  console.log("\n--- Step 9: Agents Join Tournament 2 ---");

  // Agent Gamma joins
  const join3Hash = await agentWallets[2].writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "joinTournament",
    args: [tournament2Id],
    value: entryStake,
  });
  await waitTx(publicClient, join3Hash);
  console.log(`  ✓ ${agents[2].handle} joined Tournament #${tournament2Id}`);

  // Agent Delta joins
  const join4Hash = await agentWallets[3].writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "joinTournament",
    args: [tournament2Id],
    value: entryStake,
  });
  await waitTx(publicClient, join4Hash);
  console.log(`  ✓ ${agents[3].handle} joined Tournament #${tournament2Id}`);

  // Verify prize pool
  const pool2 = await publicClient.readContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "tournamentPools",
    args: [tournament2Id],
  }) as bigint;
  console.log(`  Prize Pool: ${formatEther(pool2)} MON`);

  // =========================================================================
  // STEP 10: Start Tournament 2
  // =========================================================================
  console.log("\n--- Step 10: Start Tournament 2 ---");

  const start2Hash = await deployer.writeContract({
    address: coreAddr,
    abi: ArenaCoreAbi,
    functionName: "startTournament",
    args: [tournament2Id],
  });
  await waitTx(publicClient, start2Hash);
  console.log(`  ✓ Tournament #${tournament2Id} started`);

  // =========================================================================
  // STEP 11: Create Match 2 (Gamma vs Delta)
  // =========================================================================
  console.log("\n--- Step 11: Create Match 2 ---");

  const match2CreateHash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "createMatch",
    args: [tournament2Id, BigInt(1), agentAddresses[2], agentAddresses[3]],
  });
  await waitTx(publicClient, match2CreateHash);

  const match2Id = await publicClient.readContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "matchCounter",
  }) as bigint;
  console.log(`  ✓ Created Match #${match2Id}: ${agents[2].handle} vs ${agents[3].handle}`);

  // Lock escrow for match
  const lock2Hash = await deployer.writeContract({
    address: escrowAddr,
    abi: WagerEscrowAbi,
    functionName: "lockForMatch",
    args: [tournament2Id, agentAddresses[2], agentAddresses[3]],
  });
  await waitTx(publicClient, lock2Hash);
  console.log(`  ✓ Escrow locked for Match #${match2Id}`);

  // Start match
  const startMatch2Hash = await deployer.writeContract({
    address: registryAddr,
    abi: MatchRegistryAbi,
    functionName: "startMatch",
    args: [match2Id],
  });
  await waitTx(publicClient, startMatch2Hash);
  console.log(`  ✓ Match #${match2Id} started (InProgress)`);

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n========================================");
  console.log("=== SETUP COMPLETE ===");
  console.log("========================================\n");

  console.log("TOURNAMENTS:");
  console.log(`  #${tournament1Id}: StrategyArena Championship — 0.04 MON Pool (Active)`);
  console.log(`  #${tournament2Id}: OracleDuel Masters — 0.04 MON Pool (Active)`);

  console.log("\nAGENTS:");
  for (let i = 0; i < agents.length; i++) {
    console.log(`  ${agents[i].handle}: ${agentAddresses[i]}`);
  }

  console.log("\nLIVE MATCHES:");
  console.log(`  #${match1Id}: ${agents[0].handle} vs ${agents[1].handle} (InProgress)`);
  console.log(`  #${match2Id}: ${agents[2].handle} vs ${agents[3].handle} (InProgress)`);

  console.log("\nPRIZE POOLS:");
  console.log(`  Tournament #${tournament1Id}: ${formatEther(pool1)} MON`);
  console.log(`  Tournament #${tournament2Id}: ${formatEther(pool2)} MON`);

  const finalBalance = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`\nDeployer Balance After: ${formatEther(finalBalance)} MON`);
  console.log(`MON Used: ${formatEther(balance - finalBalance)} MON`);

  console.log("\n✓ Run 'cd frontend && npm run dev' to see live data!");
}

main().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
