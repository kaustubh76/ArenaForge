import type { TokenInfo } from "../game-engine/game-mode.interface";
import { TokenBucketRateLimiter } from "../utils/rate-limiter";
import { throttledFetch } from "../utils/throttled-fetch";

export class NadFunClient {
  private baseUrl: string;
  private rateLimiter: TokenBucketRateLimiter;

  constructor(isTestnet: boolean = false) {
    this.baseUrl = isTestnet
      ? "https://dev-api.nad.fun"
      : (process.env.NADFUN_API_URL || "https://api.nadapp.net");

    this.rateLimiter = new TokenBucketRateLimiter({
      maxTokens: 3,
      refillRate: 1,
    });
  }

  private get fetchConfig() {
    return { rateLimiter: this.rateLimiter, serviceName: "NadFun" };
  }

  async getTokenPrice(tokenAddress: string): Promise<bigint> {
    try {
      const response = await throttledFetch(
        `${this.baseUrl}/tokens/${tokenAddress}`,
        undefined,
        this.fetchConfig
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as Record<string, unknown>;
      return BigInt((data.price as string) || "0");
    } catch (error) {
      console.error(`Failed to get token price for ${tokenAddress}:`, error);
      return BigInt(0);
    }
  }

  async getActiveTokens(): Promise<TokenInfo[]> {
    try {
      const response = await throttledFetch(
        `${this.baseUrl}/tokens?status=active&limit=100`,
        undefined,
        this.fetchConfig
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as Record<string, unknown>;
      return ((data.tokens || []) as Record<string, unknown>[]).map(this.mapToken);
    } catch (error) {
      console.error("Failed to get active tokens:", error);
      return [];
    }
  }

  async getRandomActiveToken(
    minLiquidity: bigint = BigInt(10e18),
    maxAge: number = 86400
  ): Promise<TokenInfo | null> {
    const tokens = await this.getActiveTokens();
    const now = Math.floor(Date.now() / 1000);

    const eligible = tokens.filter(
      (t) =>
        t.curveLiquidity >= minLiquidity &&
        now - t.lastTradeTimestamp < maxAge &&
        !t.graduated
    );

    if (eligible.length === 0) return null;
    return eligible[Math.floor(Math.random() * eligible.length)];
  }

  async getTokensByVolume(limit: number = 20): Promise<TokenInfo[]> {
    try {
      const response = await throttledFetch(
        `${this.baseUrl}/tokens?sort=volume&limit=${limit}`,
        undefined,
        this.fetchConfig
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as Record<string, unknown>;
      return ((data.tokens || []) as Record<string, unknown>[]).map(this.mapToken);
    } catch (error) {
      console.error("Failed to get tokens by volume:", error);
      return [];
    }
  }

  private mapToken(raw: Record<string, unknown>): TokenInfo {
    return {
      address: String(raw.address || ""),
      name: String(raw.name || ""),
      symbol: String(raw.symbol || ""),
      price: BigInt(String(raw.price || "0")),
      marketCap: BigInt(String(raw.marketCap || "0")),
      volume24h: BigInt(String(raw.volume24h || "0")),
      graduated: Boolean(raw.graduated),
      curveLiquidity: BigInt(String(raw.curveLiquidity || "0")),
      lastTradeTimestamp: Number(raw.lastTradeTimestamp || 0),
      hourlyVolatility: Number(raw.hourlyVolatility || 0),
    };
  }
}
