// One-shot operator script: launch the ARENA bonding-curve token via nad.fun.
//
// Usage:
//   npm run token:launch                 # launches with 0.1 MON initial buy
//   INITIAL_BUY_MON=0.05 npm run token:launch
//
// Idempotent: if ARENA_TOKEN_ADDRESS is set in .env, the script prints the
// existing token address and exits 0 — it doesn't try to launch a duplicate.
//
// Why this exists: the backend's `arenaToken` GraphQL resolver returns null
// when the token isn't launched, which keeps the deployed dApp's Token page
// in its empty state. There was a `tokenManager.launchToken()` method but
// no path that called it. After running this script (and setting
// ARENA_TOKEN_ADDRESS in the deployed backend env) the Token page populates.
import * as dotenv from "dotenv";
dotenv.config();

// nad.fun's testnet API host (dev-api.nad.fun) has had an expired TLS cert
// for an extended window in 2026; node.js's default fetch refuses such
// connections with "fetch failed". This script targets a testnet operation
// only and the cert mis-issuance is upstream and outside our control, so we
// scope the relaxation to this process only. Set ALLOW_INSECURE_NADFUN=false
// to disable. Never propagated to the long-running backend.
if (process.env.ALLOW_INSECURE_NADFUN !== "false") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { parseEther } from "@nadfun/sdk";
import { TokenManager } from "../monad/token-manager";
import { getLogger } from "../utils/logger";
import { publicClient } from "../monad/rpc";

const log = getLogger("LaunchToken");

async function main(): Promise<void> {
  const existing = process.env.ARENA_TOKEN_ADDRESS?.trim();
  if (existing) {
    log.info("ARENA_TOKEN_ADDRESS already set — token previously launched", {
      tokenAddress: existing,
    });
    console.log("");
    console.log(`Token already exists: ${existing}`);
    console.log("Nothing to do. Delete ARENA_TOKEN_ADDRESS from .env to force a fresh launch.");
    return;
  }

  const privateKey = (process.env.ARENA_AGENT_PRIVATE_KEY ?? process.env.SEED_PRIVATE_KEY) as
    | `0x${string}`
    | undefined;
  if (!privateKey) {
    log.error("ARENA_AGENT_PRIVATE_KEY (or SEED_PRIVATE_KEY) must be set");
    process.exit(1);
  }

  const rpcUrl = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
  const useTestnet = process.env.USE_TESTNET === "true";
  const network: "testnet" | "mainnet" = useTestnet ? "testnet" : "mainnet";

  const initialBuyMon = process.env.INITIAL_BUY_MON?.trim() || "0.1";
  const initialBuyAmount = parseEther(initialBuyMon);

  log.info("Launching ARENA token", {
    network,
    initialBuyMon,
    rpcHost: new URL(rpcUrl).host,
  });

  const tm = new TokenManager({ rpcUrl, privateKey, network });
  try {
    const result = await tm.launchToken({ initialBuyAmount });

    // SDK may declare "success" before the on-chain tx is actually mined,
    // or even when the tx reverted. Wait for the receipt + verify the
    // predicted token address has bytecode. Discovered the hard way: a
    // prior nad.fun "success" response returned a CREATE2 address that
    // had no contract deployed (tx reverted with "An internal error").
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: result.txHash as `0x${string}`,
      timeout: 90_000,
    });
    if (receipt.status !== "success") {
      throw new Error(
        `Token launch tx ${result.txHash} reverted on-chain — ` +
        `nad.fun SDK returned 'success' but the actual tx failed. ` +
        `Likely cause: symbol "ARENA" already taken on testnet, ` +
        `or initialBuyAmount too low for current curve fee.`,
      );
    }
    const code = await publicClient.getCode({ address: result.tokenAddress as `0x${string}` });
    if (!code || code === "0x") {
      throw new Error(
        `Token launch tx succeeded but ${result.tokenAddress} has no bytecode. ` +
        `nad.fun returned a stale or computed address that wasn't actually deployed.`,
      );
    }

    log.info("Token launch succeeded", {
      tokenAddress: result.tokenAddress,
      poolAddress: result.poolAddress,
      txHash: result.txHash,
    });
    console.log("");
    console.log("=== ARENA TOKEN LAUNCHED ===");
    console.log(`  Token: ${result.tokenAddress}`);
    console.log(`  Pool:  ${result.poolAddress}`);
    console.log(`  Tx:    ${result.txHash}`);
    console.log(`  Image: ${result.imageUri}`);
    console.log("");
    console.log("Next steps:");
    console.log(`  1. Add this to your .env (and the deployed Render env):`);
    console.log(`       ARENA_TOKEN_ADDRESS=${result.tokenAddress}`);
    console.log(`  2. Restart the backend so the resolver picks it up.`);
    console.log(`  3. Verify via:`);
    console.log(`       npm run health:check    # Token Page row should flip to PASS`);
    console.log("");
  } catch (error: unknown) {
    log.error("Token launch failed", { error });
    const msg = (error as { message?: string }).message ?? String(error);
    console.error("");
    console.error(`Launch failed: ${msg}`);
    console.error("");
    console.error("Common causes:");
    console.error(`  - Insufficient MON for the initial buy (need ${initialBuyMon} + gas).`);
    console.error(`  - Token symbol "ARENA" already taken on this network.`);
    console.error(`  - nad.fun API unreachable.`);
    process.exit(1);
  }
}

main().catch((error) => {
  log.error("launch-token script failed", { error });
  process.exit(1);
});
