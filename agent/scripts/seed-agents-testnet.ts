/**
 * Seed Agents on Monad Testnet
 *
 * Registers 8 AI agents on-chain, creates 4 tournaments (one per game type),
 * and has agents join each. Provides real on-chain data for the UI.
 *
 * Usage: npx ts-node --transpile-only agent/scripts/seed-agents-testnet.ts
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
  type Hash,
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
if (!coreAddr) {
  console.error("ARENA_CORE_ADDRESS not set in .env");
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
  { type: "function", name: "getAgent", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "agentAddress", type: "address" }, { name: "moltbookHandle", type: "string" }, { name: "elo", type: "uint256" }, { name: "matchesPlayed", type: "uint256" }, { name: "wins", type: "uint256" }, { name: "losses", type: "uint256" }, { name: "registered", type: "bool" }] }] },
  { type: "function", name: "tournamentCounter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
];

// =========================================================================
// Helpers
// =========================================================================

async function waitTx(pub: PublicClient, hash: Hash, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
      if (receipt.status !== "success") {
        throw new Error(`Transaction reverted: ${hash}`);
      }
      return;
    } catch (e) {
      if (attempt === retries) throw e;
      console.log(`    Retry ${attempt}/${retries} waiting for tx...`);
      await sleep(5000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// =========================================================================
// Agent Definitions
// =========================================================================

const AGENT_HANDLES = [
  "CryptoWolf_X1",
  "NeuralNinja_X2",
  "QuantumFox_X3",
  "DeepOracle_X4",
  "AlphaStrike_X5",
  "BetaMind_X6",
  "GammaPulse_X7",
  "DeltaForce_X8",
];

// Tournament definitions — one per game type
const TOURNAMENTS = [
  { name: "Oracle Wars: Price is Right",    gameType: 0, format: 0, maxParticipants: 8, roundCount: 3 },
  { name: "Midnight Strategy Showdown",     gameType: 1, format: 1, maxParticipants: 8, roundCount: 3 },
  { name: "Auction House Havoc",            gameType: 2, format: 0, maxParticipants: 8, roundCount: 3 },
  { name: "QuizBowl Lightning Round",       gameType: 3, format: 0, maxParticipants: 8, roundCount: 3 },
];

// =========================================================================
// Main
// =========================================================================

async function main(): Promise<void> {
  console.log("=== ArenaForge: Seed Agents on Monad Testnet ===\n");

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

  if (balance < parseEther("2")) {
    console.error("Need at least 2 MON in deployer wallet.");
    process.exit(1);
  }

  // --- Generate agent wallets ---
  console.log("--- Generating Agent Wallets ---");
  const agentKeys: `0x${string}`[] = [];
  const agentWallets: WalletClient[] = [];
  const agentAddresses: `0x${string}`[] = [];

  for (const handle of AGENT_HANDLES) {
    const key = generatePrivateKey();
    agentKeys.push(key);
    const account = privateKeyToAccount(key);
    const wallet = createWalletClient({ chain: monadTestnet, transport: http(rpcUrl), account });
    agentWallets.push(wallet);
    agentAddresses.push(account.address);
    console.log(`  ${handle}: ${account.address}`);
  }

  // --- Fund agents ---
  console.log("\n--- Funding Agent Wallets (0.15 MON each) ---");
  const fundAmount = parseEther("0.15");

  for (let i = 0; i < AGENT_HANDLES.length; i++) {
    try {
      const hash = await deployer.sendTransaction({ to: agentAddresses[i], value: fundAmount });
      await waitTx(publicClient, hash);
      console.log(`  ✓ Funded ${AGENT_HANDLES[i]}`);
    } catch (e) {
      console.error(`  ✗ Failed to fund ${AGENT_HANDLES[i]}:`, (e as Error).message?.slice(0, 80));
    }
    await sleep(1000);
  }

  // --- Register agents ---
  console.log("\n--- Registering Agents ---");
  for (let i = 0; i < AGENT_HANDLES.length; i++) {
    try {
      const existing = await publicClient.readContract({
        address: coreAddr, abi: ArenaCoreAbi, functionName: "getAgent", args: [agentAddresses[i]],
      }) as Record<string, unknown>;

      if (existing.registered) {
        console.log(`  ~ ${AGENT_HANDLES[i]} already registered`);
        continue;
      }
    } catch {}

    try {
      const hash = await agentWallets[i].writeContract({
        address: coreAddr,
        abi: ArenaCoreAbi,
        functionName: "registerAgent",
        args: [AGENT_HANDLES[i]],
      });
      await waitTx(publicClient, hash);
      console.log(`  ✓ Registered ${AGENT_HANDLES[i]}`);
    } catch (e) {
      console.error(`  ✗ Failed to register ${AGENT_HANDLES[i]}:`, (e as Error).message?.slice(0, 80));
    }
    await sleep(1000);
  }

  // --- Create tournaments (one per game type) ---
  const entryStake = parseEther("0.01");
  const createdTournamentIds: bigint[] = [];

  for (const t of TOURNAMENTS) {
    console.log(`\n--- Creating Tournament: ${t.name} (GameType=${t.gameType}, Format=${t.format}) ---`);
    const paramsHash = keccak256(encodePacked(["string"], [`seed_${t.name}_v1`]));

    try {
      const createHash = await deployer.writeContract({
        address: coreAddr,
        abi: ArenaCoreAbi,
        functionName: "createTournament",
        args: [
          t.name,
          t.gameType,
          t.format,
          entryStake,
          BigInt(t.maxParticipants),
          BigInt(t.roundCount),
          paramsHash,
        ],
      });
      await waitTx(publicClient, createHash);

      const tournamentId = await publicClient.readContract({
        address: coreAddr, abi: ArenaCoreAbi, functionName: "tournamentCounter",
      }) as bigint;
      createdTournamentIds.push(tournamentId);
      console.log(`  ✓ Created Tournament #${tournamentId}: ${t.name}`);

      // --- Agents join this tournament ---
      console.log(`  --- Agents Joining Tournament #${tournamentId} ---`);
      for (let i = 0; i < AGENT_HANDLES.length; i++) {
        try {
          const hash = await agentWallets[i].writeContract({
            address: coreAddr,
            abi: ArenaCoreAbi,
            functionName: "joinTournament",
            args: [tournamentId],
            value: entryStake,
          });
          await waitTx(publicClient, hash);
          console.log(`    ✓ ${AGENT_HANDLES[i]} joined`);
        } catch (e) {
          console.error(`    ✗ ${AGENT_HANDLES[i]} failed:`, (e as Error).message?.slice(0, 80));
        }
        await sleep(800);
      }

      // --- Start tournament ---
      try {
        const startHash = await deployer.writeContract({
          address: coreAddr,
          abi: ArenaCoreAbi,
          functionName: "startTournament",
          args: [tournamentId],
        });
        await waitTx(publicClient, startHash);
        console.log(`  ✓ Tournament #${tournamentId} STARTED`);
      } catch (e) {
        console.log(`  ~ Tournament #${tournamentId} start skipped:`, (e as Error).message?.slice(0, 60));
      }

    } catch (e) {
      console.error(`  ✗ Failed to create ${t.name}:`, (e as Error).message?.slice(0, 80));
    }

    await sleep(2000);
  }

  // --- Summary ---
  console.log("\n========================================");
  console.log("=== SEED COMPLETE ===");
  console.log("========================================\n");

  console.log("AGENTS:");
  for (let i = 0; i < AGENT_HANDLES.length; i++) {
    console.log(`  ${AGENT_HANDLES[i]}: ${agentAddresses[i]}`);
  }

  console.log("\nTOURNAMENTS:");
  for (let i = 0; i < createdTournamentIds.length; i++) {
    const t = TOURNAMENTS[i];
    const gameNames = ["OracleDuel", "StrategyArena", "AuctionWars", "QuizBowl"];
    console.log(`  #${createdTournamentIds[i]}: ${t.name} [${gameNames[t.gameType]}]`);
  }

  const finalBalance = await publicClient.getBalance({ address: deployerAccount.address });
  console.log(`\nDeployer Balance: ${formatEther(finalBalance)} MON (used: ${formatEther(balance - finalBalance)} MON)`);
  console.log("\n✓ Agents registered + 4 tournaments created on Monad testnet!");
  console.log("  The scheduler will discover agents and run matches automatically.");
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
