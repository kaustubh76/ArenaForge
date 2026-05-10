// Balance check + optional faucet top-up. Used at boot and from the
// autonomous scheduler to keep the agent's wallet funded without operators
// having to babysit faucet.monad.xyz.

import { parseEther, formatEther } from "viem";
import { publicClient } from "./rpc";
import { FaucetClient } from "./faucet";
import { getLogger } from "../utils/logger";
import { envFlag } from "../utils/env";

const log = getLogger("Balance");

/** Default minimum balance threshold below which we warn / topup (0.5 MON). */
const DEFAULT_MIN_BALANCE_MON = 0.5;

export interface BalanceCheckResult {
  /** Wallet address checked. */
  address: `0x${string}`;
  /** Current on-chain balance in wei. */
  balance: bigint;
  /** Minimum threshold in wei. */
  threshold: bigint;
  /** True if balance < threshold. */
  belowThreshold: boolean;
  /** True if a faucet topup was attempted (and AUTO_FAUCET_TOPUP=true). */
  faucetAttempted: boolean;
  /** Faucet result detail (only present when faucetAttempted is true). */
  faucetResult?: "ok" | "cooldown" | "invalid_address" | "network" | "http_error" | "disabled" | "unknown";
}

function thresholdWei(): bigint {
  const raw = process.env.MIN_BALANCE_MON?.trim();
  const n = raw && raw.length > 0 ? Number(raw) : DEFAULT_MIN_BALANCE_MON;
  if (!Number.isFinite(n) || n < 0) return parseEther(String(DEFAULT_MIN_BALANCE_MON));
  return parseEther(String(n));
}

/**
 * Read the on-chain balance for `address`, log a warning if it's below the
 * configured threshold, and (when `AUTO_FAUCET_TOPUP=true`) attempt a
 * faucet claim. Returns a structured result so callers can react.
 *
 * Never throws — exposes failures via the result object so boot can decide
 * whether a low balance is fatal (it isn't — the agent can still serve
 * read traffic) or just an ops alert.
 */
export async function checkBalanceAndMaybeTopup(
  address: `0x${string}`,
  faucet: FaucetClient,
): Promise<BalanceCheckResult> {
  const threshold = thresholdWei();

  let balance: bigint;
  try {
    balance = await publicClient.getBalance({ address });
  } catch (error) {
    log.error("getBalance failed", { address, error });
    return {
      address,
      balance: BigInt(0),
      threshold,
      belowThreshold: true,
      faucetAttempted: false,
    };
  }

  const belowThreshold = balance < threshold;
  const balanceMon = formatEther(balance);
  const thresholdMon = formatEther(threshold);

  if (!belowThreshold) {
    log.info("Wallet balance OK", { address, balanceMon, thresholdMon });
    return { address, balance, threshold, belowThreshold: false, faucetAttempted: false };
  }

  log.warn("Wallet balance below threshold", { address, balanceMon, thresholdMon });

  if (!envFlag("AUTO_FAUCET_TOPUP")) {
    log.info(
      "Skipping automatic faucet topup (set AUTO_FAUCET_TOPUP=true to enable, or run `npm run faucet:topup`)",
    );
    return { address, balance, threshold, belowThreshold: true, faucetAttempted: false };
  }

  const claim = await faucet.claim(address);
  if (claim.ok) {
    log.info("Faucet topup attempted; new balance will be visible after the claim transaction confirms", {
      address,
      txHash: claim.value.txHash,
      amount: claim.value.amount,
    });
    return {
      address,
      balance,
      threshold,
      belowThreshold: true,
      faucetAttempted: true,
      faucetResult: "ok",
    };
  }

  return {
    address,
    balance,
    threshold,
    belowThreshold: true,
    faucetAttempted: true,
    faucetResult: claim.error.reason,
  };
}
