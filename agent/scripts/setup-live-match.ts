// Script to set up a live match with betting for testing
import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { monadTestnet } from "../monad/rpc";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const ARENA_CORE_ABI = [
  {
    name: "registerAgent",
    type: "function",
    inputs: [{ name: "moltbookHandle", type: "string" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getAgent",
    type: "function",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "agentAddress", type: "address" },
          { name: "moltbookHandle", type: "string" },
          { name: "elo", type: "uint256" },
          { name: "matchesPlayed", type: "uint256" },
          { name: "wins", type: "uint256" },
          { name: "losses", type: "uint256" },
          { name: "registered", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

const MATCH_REGISTRY_ABI = [
  {
    name: "createMatch",
    type: "function",
    inputs: [
      { name: "tournamentId", type: "uint256" },
      { name: "round", type: "uint256" },
      { name: "player1", type: "address" },
      { name: "player2", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    name: "startMatch",
    type: "function",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "matchCounter",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "getMatch",
    type: "function",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "tournamentId", type: "uint256" },
          { name: "round", type: "uint256" },
          { name: "player1", type: "address" },
          { name: "player2", type: "address" },
          { name: "winner", type: "address" },
          { name: "resultHash", type: "bytes32" },
          { name: "timestamp", type: "uint256" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

const SPECTATOR_BETTING_ABI = [
  {
    name: "openBetting",
    type: "function",
    inputs: [
      { name: "matchId", type: "uint256" },
      { name: "player1", type: "address" },
      { name: "player2", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "getMatchPool",
    type: "function",
    inputs: [{ name: "matchId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "matchId", type: "uint256" },
          { name: "player1", type: "address" },
          { name: "player2", type: "address" },
          { name: "totalPlayer1Bets", type: "uint256" },
          { name: "totalPlayer2Bets", type: "uint256" },
          { name: "bettingOpen", type: "bool" },
          { name: "settled", type: "bool" },
          { name: "winner", type: "address" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.ARENA_AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Private key not set");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log("Operator account:", account.address);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  const arenaCoreAddress = process.env.ARENA_CORE_ADDRESS as `0x${string}`;
  const matchRegistryAddress = process.env.MATCH_REGISTRY_ADDRESS as `0x${string}`;
  const spectatorBettingAddress = process.env.SPECTATOR_BETTING_ADDRESS as `0x${string}`;

  console.log("ArenaCore:", arenaCoreAddress);
  console.log("MatchRegistry:", matchRegistryAddress);
  console.log("SpectatorBetting:", spectatorBettingAddress);

  // Generate two new player addresses
  const player1Key = generatePrivateKey();
  const player2Key = generatePrivateKey();
  const player1 = privateKeyToAccount(player1Key);
  const player2 = privateKeyToAccount(player2Key);

  console.log("\nPlayer 1:", player1.address);
  console.log("Player 2:", player2.address);

  // Create wallets for players
  const player1Wallet = createWalletClient({
    account: player1,
    chain: monadTestnet,
    transport: http(),
  });

  const player2Wallet = createWalletClient({
    account: player2,
    chain: monadTestnet,
    transport: http(),
  });

  // Fund player wallets
  console.log("\nFunding player wallets...");
  const fundAmount = parseEther("0.1");

  try {
    const tx1 = await walletClient.sendTransaction({
      to: player1.address,
      value: fundAmount,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx1 });
    console.log("Funded player 1");

    const tx2 = await walletClient.sendTransaction({
      to: player2.address,
      value: fundAmount,
    });
    await publicClient.waitForTransactionReceipt({ hash: tx2 });
    console.log("Funded player 2");
  } catch (e: unknown) {
    console.error("Failed to fund wallets:", (e as Error).message);
  }

  // Register agents
  console.log("\nRegistering agents...");
  try {
    const reg1 = await player1Wallet.writeContract({
      address: arenaCoreAddress,
      abi: ARENA_CORE_ABI,
      functionName: "registerAgent",
      args: ["CryptoWarrior_" + Math.floor(Math.random() * 1000)],
    });
    await publicClient.waitForTransactionReceipt({ hash: reg1 });
    console.log("Registered player 1");

    const reg2 = await player2Wallet.writeContract({
      address: arenaCoreAddress,
      abi: ARENA_CORE_ABI,
      functionName: "registerAgent",
      args: ["NeuralNinja_" + Math.floor(Math.random() * 1000)],
    });
    await publicClient.waitForTransactionReceipt({ hash: reg2 });
    console.log("Registered player 2");
  } catch (e: unknown) {
    console.error("Agent registration failed:", (e as Error).message);
    // Continue anyway - might already be registered
  }

  // Create match
  console.log("\nCreating match...");
  try {
    const createMatchTx = await walletClient.writeContract({
      address: matchRegistryAddress,
      abi: MATCH_REGISTRY_ABI,
      functionName: "createMatch",
      args: [BigInt(1), BigInt(1), player1.address, player2.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: createMatchTx });
    console.log("Match created");

    // Get match ID
    const matchCount = await publicClient.readContract({
      address: matchRegistryAddress,
      abi: MATCH_REGISTRY_ABI,
      functionName: "matchCounter",
    });
    const matchId = Number(matchCount);
    console.log("Match ID:", matchId);

    // Start match
    console.log("\nStarting match...");
    const startTx = await walletClient.writeContract({
      address: matchRegistryAddress,
      abi: MATCH_REGISTRY_ABI,
      functionName: "startMatch",
      args: [BigInt(matchId)],
    });
    await publicClient.waitForTransactionReceipt({ hash: startTx });
    console.log("Match started");

    // Open betting
    console.log("\nOpening betting...");
    const openBettingTx = await walletClient.writeContract({
      address: spectatorBettingAddress,
      abi: SPECTATOR_BETTING_ABI,
      functionName: "openBetting",
      args: [BigInt(matchId), player1.address, player2.address],
    });
    await publicClient.waitForTransactionReceipt({ hash: openBettingTx });
    console.log("Betting opened");

    // Verify
    const match = await publicClient.readContract({
      address: matchRegistryAddress,
      abi: MATCH_REGISTRY_ABI,
      functionName: "getMatch",
      args: [BigInt(matchId)],
    });
    console.log("\nMatch status:", match.status === 1 ? "IN_PROGRESS" : match.status);

    const pool = await publicClient.readContract({
      address: spectatorBettingAddress,
      abi: SPECTATOR_BETTING_ABI,
      functionName: "getMatchPool",
      args: [BigInt(matchId)],
    });
    console.log("Betting open:", pool.bettingOpen);

    console.log("\n=== SUCCESS ===");
    console.log("Match ID:", matchId);
    console.log("Player 1:", player1.address);
    console.log("Player 2:", player2.address);
    console.log("Betting: OPEN");
    console.log("\nView at: http://localhost:5177/spectator");
  } catch (e: unknown) {
    console.error("Failed:", (e as Error).message);
    process.exit(1);
  }
}

main().catch(console.error);
