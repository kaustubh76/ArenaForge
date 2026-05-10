// Manual faucet top-up.
//
// Usage:
//   npm run faucet:topup                        # tops up the agent wallet
//   npm run faucet:topup -- 0xYourAddress       # tops up a specific address
//
// Always uses the real Monad testnet faucet (or whatever MONAD_FAUCET_URL
// is set to). Honors AUTO_FAUCET_TOPUP gate is bypassed because this is an
// explicit operator action.

import * as dotenv from "dotenv";
dotenv.config();

import { formatEther, parseEther } from "viem";
import { publicClient, getAgentAddress } from "../monad/rpc";
import { createFaucetClient } from "../monad/faucet";
import { getLogger } from "../utils/logger";

const log = getLogger("FaucetTopup");

async function main(): Promise<void> {
  const argAddress = process.argv[2]?.trim();
  let target: `0x${string}`;

  if (argAddress) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(argAddress)) {
      log.error("Invalid address argument", { argAddress });
      process.exit(2);
    }
    target = argAddress as `0x${string}`;
  } else {
    try {
      target = getAgentAddress() as `0x${string}`;
    } catch (error) {
      log.error("No address arg and no agent wallet configured", { error });
      process.exit(2);
    }
  }

  log.info("Requesting faucet top-up", { address: target });

  // Show balance before
  let before: bigint;
  try {
    before = await publicClient.getBalance({ address: target });
    log.info("Current balance", { address: target, balanceMon: formatEther(before) });
  } catch (error) {
    log.warn("getBalance failed (proceeding with claim anyway)", { error });
    before = BigInt(0);
  }

  const faucet = createFaucetClient();
  const result = await faucet.claim(target);

  if (!result.ok) {
    log.error("Faucet claim failed", { address: target, ...result.error });
    // Actionable guidance for the most common failure modes.
    if (result.error.reason === "cooldown") {
      console.error("");
      console.error("FAUCET COOLDOWN. The Monad public faucet rate-limits both per-address");
      console.error("(~24h between claims) AND per-IP. Two recovery paths:");
      console.error("");
      console.error("  1. Wait for cooldown to lift, then re-run:");
      console.error(`       npm run faucet:topup -- ${target}`);
      console.error("");
      console.error("  2. Use the human-driven web faucet (no per-IP cap if you're on a");
      console.error("     different network or the public Captcha gate clears you):");
      console.error("       https://faucet.monad.xyz");
      console.error(`       Address to fund: ${target}`);
      console.error("");
      console.error("  3. Or transfer MON from a different funded wallet you control.");
      console.error("");
    } else if (result.error.reason === "network") {
      console.error("");
      console.error("FAUCET NETWORK ERROR — check MONAD_FAUCET_URL or your connection.");
      console.error("");
    }
    process.exit(1);
  }

  log.info("Faucet claim accepted", {
    address: target,
    txHash: result.value.txHash,
    amount: result.value.amount,
  });

  // Best-effort: poll for balance increase up to 30s. Faucets vary in how
  // quickly they confirm, so we don't fail the script if the balance
  // doesn't change within the window — the txHash is what matters.
  const target_increase = parseEther("0.001"); // any noticeable bump counts
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const now = await publicClient.getBalance({ address: target });
      if (now >= before + target_increase) {
        log.info("Balance increased", {
          address: target,
          balanceMon: formatEther(now),
          deltaMon: formatEther(now - before),
        });
        return;
      }
    } catch {
      // ignore — try again
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  log.warn("Claim succeeded but balance didn't update within 30s. Tx may still be pending; check explorer.", {
    txHash: result.value.txHash,
  });
}

main().catch((error) => {
  log.error("faucet:topup script failed", { error });
  process.exit(1);
});
