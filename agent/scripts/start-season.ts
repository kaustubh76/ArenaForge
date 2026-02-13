// Script to start a new season for seasonal tracking
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "../monad/rpc";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const SEASONAL_RANKINGS_ABI = [
  {
    name: "startNewSeason",
    type: "function",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "currentSeasonId",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "seasons",
    type: "function",
    inputs: [{ name: "seasonId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "active", type: "bool" },
      { name: "rewardsDistributed", type: "bool" },
      { name: "totalPrizePool", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

async function main() {
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || process.env.ARENA_AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.error("DEPLOYER_PRIVATE_KEY not set");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log("Account:", account.address);

  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(),
  });

  const seasonalRankingsAddress = process.env.SEASONAL_RANKINGS_ADDRESS as `0x${string}`;
  if (!seasonalRankingsAddress) {
    console.error("SEASONAL_RANKINGS_ADDRESS not set in environment");
    process.exit(1);
  }
  console.log("SeasonalRankings:", seasonalRankingsAddress);

  // Check current season
  try {
    const currentSeasonId = await publicClient.readContract({
      address: seasonalRankingsAddress,
      abi: SEASONAL_RANKINGS_ABI,
      functionName: "currentSeasonId",
    });
    console.log("Current season ID:", currentSeasonId);

    if (currentSeasonId > 0n) {
      const season = await publicClient.readContract({
        address: seasonalRankingsAddress,
        abi: SEASONAL_RANKINGS_ABI,
        functionName: "seasons",
        args: [currentSeasonId],
      });
      console.log("Season data:", {
        id: Number(season[0]),
        startTime: new Date(Number(season[1]) * 1000).toISOString(),
        endTime: new Date(Number(season[2]) * 1000).toISOString(),
        active: season[3],
        rewardsDistributed: season[4],
        totalPrizePool: season[5].toString(),
      });

      if (season[3]) {
        console.log("Season is already active!");
        process.exit(0);
      }
    }
  } catch (err) {
    console.log("No current season, starting new one...");
  }

  // Start new season
  console.log("Starting new season...");

  try {
    const hash = await walletClient.writeContract({
      address: seasonalRankingsAddress,
      abi: SEASONAL_RANKINGS_ABI,
      functionName: "startNewSeason",
      args: [],
    });

    console.log("Transaction hash:", hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Status:", receipt.status);

    if (receipt.status === "success") {
      const newSeasonId = await publicClient.readContract({
        address: seasonalRankingsAddress,
        abi: SEASONAL_RANKINGS_ABI,
        functionName: "currentSeasonId",
      });
      console.log("New season started! Season ID:", newSeasonId);

      const season = await publicClient.readContract({
        address: seasonalRankingsAddress,
        abi: SEASONAL_RANKINGS_ABI,
        functionName: "seasons",
        args: [newSeasonId],
      });
      console.log("Season details:", {
        id: Number(season[0]),
        startTime: new Date(Number(season[1]) * 1000).toISOString(),
        endTime: new Date(Number(season[2]) * 1000).toISOString(),
        active: season[3],
      });
    }
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Failed to start season:", error.message);
  }
}

main().catch(console.error);
