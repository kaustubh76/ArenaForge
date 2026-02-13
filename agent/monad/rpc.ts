import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";

dotenv.config();

export const monad = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "MON",
    symbol: "MON",
  },
  rpcUrls: {
    default: {
      http: [process.env.MONAD_RPC_URL || "https://rpc.monad.xyz"],
    },
  },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "MON",
    symbol: "MON",
  },
  rpcUrls: {
    default: {
      http: [process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz"],
    },
  },
});

export const localhost = defineChain({
  id: 31337,
  name: "Localhost (Anvil)",
  nativeCurrency: {
    decimals: 18,
    name: "MON",
    symbol: "MON",
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
  },
});

const isLocal = process.env.USE_LOCAL === "true";
const isTestnet = process.env.USE_TESTNET === "true";
const activeChain = isLocal ? localhost : isTestnet ? monadTestnet : monad;

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

const privateKey = process.env.ARENA_AGENT_PRIVATE_KEY;

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

export function getAgentAddress(): string {
  if (!account) throw new Error("ARENA_AGENT_PRIVATE_KEY not set");
  return account.address;
}
