import {
  initSDK,
  type NadFunSDK,
  type CurveState,
  parseEther,
} from "@nadfun/sdk";
import type { Address } from "viem";

export interface TokenMetrics {
  address: string;
  name: string;
  symbol: string;
  price: string;
  marketCap: string;
  volume24h: string;
  holders: number;
  bondingCurveProgress: number;
  graduated: boolean;
  locked: boolean;
}

export interface TokenLaunchResult {
  tokenAddress: string;
  poolAddress: string;
  txHash: string;
  imageUri: string;
  metadataUri: string;
}

interface TokenManagerConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  network: "testnet" | "mainnet";
  existingTokenAddress?: string;
}

export class TokenManager {
  private sdk: NadFunSDK;
  private config: TokenManagerConfig;
  private tokenAddress: string | null = null;
  private cachedMetrics: TokenMetrics | null = null;
  private lastMetricsFetch = 0;
  private previousPrice: bigint = BigInt(0);

  // Track price milestones for Moltbook posts
  private allTimeHigh: bigint = BigInt(0);
  private lastMilestonePrice: bigint = BigInt(0);

  constructor(config: TokenManagerConfig) {
    this.config = config;
    this.sdk = initSDK({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      network: config.network,
    });

    if (config.existingTokenAddress) {
      this.tokenAddress = config.existingTokenAddress;
    }
  }

  /**
   * Launch the ARENA token on nad.fun bonding curve.
   */
  async launchToken(params?: {
    initialBuyAmount?: bigint;
  }): Promise<TokenLaunchResult> {
    if (this.tokenAddress) {
      throw new Error(`Token already launched at ${this.tokenAddress}`);
    }

    console.log("[TokenManager] Launching ARENA token on nad.fun...");

    // Generate a simple SVG logo as a Buffer for the token image
    const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="64" fill="#1a1a2e"/>
      <text x="256" y="200" font-family="monospace" font-size="120" fill="#a855f7" text-anchor="middle" font-weight="bold">AF</text>
      <text x="256" y="320" font-family="monospace" font-size="48" fill="#22d3ee" text-anchor="middle">ARENA</text>
      <text x="256" y="380" font-family="monospace" font-size="32" fill="#6b7280" text-anchor="middle">FORGE</text>
    </svg>`;

    const imageBuffer = Buffer.from(logoSvg, "utf-8");

    const result = await this.sdk.createToken({
      name: "ArenaForge",
      symbol: "ARENA",
      description:
        "ArenaForge is an autonomous AI gaming arena on Monad where AI agents compete in tournaments, evolve strategies, and battle for prizes. The ARENA token powers the arena economy.",
      image: imageBuffer,
      imageContentType: "image/svg+xml",
      website: "https://arenaforge.gg",
      twitter: "https://x.com/ArenaForge",
      initialBuyAmount: params?.initialBuyAmount ?? parseEther("0.1"),
    });

    this.tokenAddress = result.tokenAddress;

    console.log(`[TokenManager] ARENA token launched!`);
    console.log(`  Address: ${result.tokenAddress}`);
    console.log(`  Pool: ${result.poolAddress}`);
    console.log(`  TX: ${result.transactionHash}`);

    return {
      tokenAddress: result.tokenAddress,
      poolAddress: result.poolAddress,
      txHash: result.transactionHash,
      imageUri: result.imageUri,
      metadataUri: result.metadataUri,
    };
  }

  /**
   * Get current token metrics. Cached for 30 seconds.
   */
  async getTokenMetrics(): Promise<TokenMetrics | null> {
    if (!this.tokenAddress) return null;

    const now = Date.now();
    if (this.cachedMetrics && now - this.lastMetricsFetch < 30_000) {
      return this.cachedMetrics;
    }

    try {
      const addr = this.tokenAddress as Address;

      // Fetch curve state + graduation/lock status in parallel
      const [curveState, graduated, locked, progress] = await Promise.all([
        this.sdk.getCurveState(addr),
        this.sdk.isGraduated(addr),
        this.sdk.isLocked(addr),
        this.sdk.getProgress(addr),
      ]);

      // Calculate price from curve reserves
      const price = this.calculatePrice(curveState);

      // Track ATH
      if (price > this.allTimeHigh) {
        this.allTimeHigh = price;
      }

      this.previousPrice = price;
      const progressPercent = Number(progress) / 100;

      this.cachedMetrics = {
        address: this.tokenAddress,
        name: "ArenaForge",
        symbol: "ARENA",
        price: price.toString(),
        marketCap: this.calculateMarketCap(curveState).toString(),
        volume24h: "0", // Would need indexer for accurate volume
        holders: 0, // Would need indexer
        bondingCurveProgress: progressPercent,
        graduated,
        locked,
      };

      this.lastMetricsFetch = now;
      return this.cachedMetrics;
    } catch (error) {
      console.error("[TokenManager] Failed to fetch metrics:", error);
      return this.cachedMetrics; // Return stale cache on error
    }
  }

  /**
   * Buy ARENA tokens (e.g., to fund prize pools).
   */
  async buyTokens(amountInMON: bigint, slippage = 5): Promise<string> {
    if (!this.tokenAddress) throw new Error("Token not launched");

    const txHash = await this.sdk.simpleBuy({
      token: this.tokenAddress as Address,
      amountIn: amountInMON,
      slippagePercent: slippage,
    });

    console.log(`[TokenManager] Bought tokens for ${amountInMON} MON. TX: ${txHash}`);
    return txHash;
  }

  /**
   * Sell ARENA tokens (e.g., for treasury management).
   */
  async sellTokens(amountInTokens: bigint, slippage = 5): Promise<string> {
    if (!this.tokenAddress) throw new Error("Token not launched");

    const txHash = await this.sdk.simpleSell({
      token: this.tokenAddress as Address,
      amountIn: amountInTokens,
      slippagePercent: slippage,
    });

    console.log(`[TokenManager] Sold ${amountInTokens} tokens. TX: ${txHash}`);
    return txHash;
  }

  /**
   * Check if price has hit a milestone worth posting about.
   */
  checkMilestones(): {
    isNewATH: boolean;
    significantPriceChange: boolean;
    changePercent: number;
  } {
    const isNewATH =
      this.previousPrice > BigInt(0) &&
      this.previousPrice >= this.allTimeHigh &&
      this.previousPrice > this.lastMilestonePrice;

    let changePercent = 0;
    if (this.lastMilestonePrice > BigInt(0)) {
      changePercent =
        Number(
          ((this.previousPrice - this.lastMilestonePrice) * BigInt(10000)) /
            this.lastMilestonePrice
        ) / 100;
    }

    const significantPriceChange = Math.abs(changePercent) >= 10;

    if (isNewATH || significantPriceChange) {
      this.lastMilestonePrice = this.previousPrice;
    }

    return { isNewATH, significantPriceChange, changePercent };
  }

  getTokenAddress(): string | null {
    return this.tokenAddress;
  }

  isLaunched(): boolean {
    return this.tokenAddress !== null;
  }

  getAllTimeHigh(): bigint {
    return this.allTimeHigh;
  }

  private calculatePrice(curveState: CurveState): bigint {
    if (curveState.virtualTokenReserve === BigInt(0)) return BigInt(0);
    // Price = virtualMonReserve / virtualTokenReserve (in wei per token)
    return (
      (curveState.virtualMonReserve * BigInt(1e18)) /
      curveState.virtualTokenReserve
    );
  }

  private calculateMarketCap(curveState: CurveState): bigint {
    const price = this.calculatePrice(curveState);
    // Total supply is targetTokenAmount (the total tokens that can be bought)
    return (price * curveState.targetTokenAmount) / BigInt(1e18);
  }
}
