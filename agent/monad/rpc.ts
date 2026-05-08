import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";
import { getLogger } from "../utils/logger";
import { requireEnv, envFlag } from "../utils/env";

dotenv.config();

const log = getLogger("RPC");

// Three chain definitions. NOTE: Monad mainnet is not live as of this writing,
// so the `monad` definition reuses the testnet chain id (10143) as a forward-
// compat placeholder. The boot-time check below refuses to run with that
// placeholder unless the operator explicitly opts in via USE_MONAD_MAINNET=true,
// preventing the silent "I thought I was on mainnet" footgun.

export const monad = defineChain({
  id: 10143,
  name: "Monad Mainnet (placeholder)",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  rpcUrls: {
    default: { http: [process.env.MONAD_RPC_URL || "https://rpc.monad.xyz"] },
  },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  rpcUrls: {
    default: { http: [process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz"] },
  },
});

export const localhost = defineChain({
  id: 31337,
  name: "Localhost (Anvil)",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
});

const isLocal = envFlag("USE_LOCAL");
const isTestnet = envFlag("USE_TESTNET");
const useMonadMainnet = envFlag("USE_MONAD_MAINNET");

// --- Boot-time chain selection with no silent fallbacks ---
// Reject ambiguous configs: the operator MUST pick one of {local, testnet,
// mainnet} via the corresponding env flag. The previous behavior (default to
// `monad` mainnet placeholder when nothing was set) silently routed agents
// running with stale `.env` files to the wrong chain.

function pickChain(): { chain: typeof localhost | typeof monadTestnet | typeof monad; label: string } {
  const flags = [isLocal, isTestnet, useMonadMainnet].filter(Boolean).length;
  if (flags === 0) {
    throw new Error(
      "No chain selected. Set exactly one of USE_LOCAL=true, USE_TESTNET=true, or USE_MONAD_MAINNET=true."
    );
  }
  if (flags > 1) {
    throw new Error(
      "Multiple chain flags set. Set exactly one of USE_LOCAL, USE_TESTNET, USE_MONAD_MAINNET."
    );
  }

  if (isLocal) return { chain: localhost, label: "localhost (anvil, id=31337)" };
  if (isTestnet) {
    // Validate the testnet RPC URL is configured (env or default).
    const url = process.env.MONAD_TESTNET_RPC_URL?.trim() || "https://testnet-rpc.monad.xyz";
    if (!/^https?:\/\//.test(url)) {
      throw new Error(
        `MONAD_TESTNET_RPC_URL must be an http(s) URL (got "${url.slice(0, 40)}…")`
      );
    }
    return { chain: monadTestnet, label: `monad-testnet (id=10143, rpc=${url})` };
  }
  // mainnet branch — opt-in only.
  const url = requireEnv("MONAD_RPC_URL");
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`MONAD_RPC_URL must be an http(s) URL (got "${url.slice(0, 40)}…")`);
  }
  return { chain: monad, label: `monad-mainnet (id=10143, rpc=${url})` };
}

const { chain: activeChain, label: chainLabel } = pickChain();

// RPC timeout configuration (30 seconds default, configurable via env)
const RPC_TIMEOUT_MS = Number(process.env.RPC_TIMEOUT_MS) || 30000;
const RPC_RETRY_COUNT = Number(process.env.RPC_RETRY_COUNT) || 3;
const RPC_RETRY_DELAY_MS = Number(process.env.RPC_RETRY_DELAY_MS) || 1000;

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(undefined, {
    timeout: RPC_TIMEOUT_MS,
    retryCount: RPC_RETRY_COUNT,
    retryDelay: RPC_RETRY_DELAY_MS,
  }),
});

const privateKey = process.env.ARENA_AGENT_PRIVATE_KEY?.trim();

export const account = privateKey
  ? privateKeyToAccount(privateKey as `0x${string}`)
  : undefined;

export const walletClient = account
  ? createWalletClient({
      chain: activeChain,
      transport: http(undefined, {
        timeout: RPC_TIMEOUT_MS,
        retryCount: RPC_RETRY_COUNT,
        retryDelay: RPC_RETRY_DELAY_MS,
      }),
      account,
    })
  : undefined;

log.info("Chain selected", {
  chain: chainLabel,
  walletConfigured: !!walletClient,
  timeoutMs: RPC_TIMEOUT_MS,
  retries: RPC_RETRY_COUNT,
});

/** Re-exported for callers that want to log the active chain themselves. */
export const activeChainLabel = chainLabel;

export function getAgentAddress(): string {
  if (!account) throw new Error("ARENA_AGENT_PRIVATE_KEY not set");
  return account.address;
}
