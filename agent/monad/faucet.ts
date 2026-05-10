// Monad Testnet faucet client.
//
// Lets the agent (and operator scripts) request testnet MON for any wallet
// without forcing humans to visit faucet.monad.xyz manually. Used for:
//   - Boot-time top-up when agent balance < MIN_BALANCE_MON (gated by
//     AUTO_FAUCET_TOPUP=true so operators opt in explicitly).
//   - Periodic re-check from the autonomous scheduler.
//   - Manual `npm run faucet:topup [<addr>]` ops invocation.
//
// Faucet endpoints rate-limit per-address (typically 1 claim per 12-24h).
// We surface that as `{ ok: false, reason: "cooldown" }` so callers can
// log + skip rather than retry-loop into a ban.
//
// HTTP transport is injectable so tests don't make real network calls.

import { getLogger } from "../utils/logger";
import { tryAsync, type Result } from "../utils/result";

const log = getLogger("Faucet");

/** Default Monad testnet faucet endpoint (overridable via MONAD_FAUCET_URL). */
const DEFAULT_FAUCET_URL = "https://faucet.monad.xyz/api/claim";
const DEFAULT_TIMEOUT_MS = 15_000;

export type FaucetFailureReason =
  | "cooldown" // Rate-limited per address
  | "invalid_address" // Faucet rejected the input
  | "network" // Transport-level error
  | "http_error" // Non-2xx response without a structured reason
  | "disabled" // Operator turned the integration off
  | "unknown";

export interface FaucetClaim {
  address: `0x${string}`;
  txHash?: `0x${string}` | string;
  /** Faucet's reported amount (string to preserve big-number precision). */
  amount?: string;
}

export interface FaucetClientConfig {
  /** Endpoint URL. Default: Monad public testnet faucet. */
  url?: string;
  /** Request timeout in ms. Default: 15s. */
  timeoutMs?: number;
  /**
   * Inject `fetch` for tests. Defaults to globalThis.fetch.
   * Signature mirrors WHATWG fetch.
   */
  fetchImpl?: typeof fetch;
  /**
   * When false the client refuses to make any network call and returns
   * `{ ok: false, reason: "disabled" }`. Default: true.
   */
  enabled?: boolean;
}

interface FaucetSuccessBody {
  txHash?: string;
  hash?: string;
  amount?: string | number;
}

interface FaucetErrorBody {
  error?: string;
  message?: string;
  retryAfter?: number;
}

export class FaucetClient {
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly enabled: boolean;

  constructor(config: FaucetClientConfig = {}) {
    this.url = config.url ?? DEFAULT_FAUCET_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.enabled = config.enabled ?? true;
  }

  /**
   * Request testnet funds for `address` from the faucet. Returns a Result
   * — `ok` carries the claim record (txHash / amount when available),
   * `err` carries a typed reason so callers can log appropriately.
   *
   * Does NOT throw on network or 4xx errors; that's what the Result is for.
   * Throws only on programmer error (e.g. invalid 0x address shape).
   */
  async claim(address: string): Promise<Result<FaucetClaim, { reason: FaucetFailureReason; detail?: string }>> {
    if (!this.enabled) {
      return { ok: false, error: { reason: "disabled" } };
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      log.warn("Faucet claim rejected: malformed address", { address });
      return { ok: false, error: { reason: "invalid_address", detail: address } };
    }
    const target = address as `0x${string}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const result = await tryAsync(async () => {
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: target }),
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text.length > 0 ? JSON.parse(text) : null;
      } catch {
        // Non-JSON response — preserve text for diagnostics.
        parsed = { rawText: text };
      }
      return { status: response.status, body: parsed };
    });

    clearTimeout(timer);

    if (!result.ok) {
      log.error("Faucet claim network error", { address: target, error: result.error });
      return { ok: false, error: { reason: "network", detail: result.error.message } };
    }

    const { status, body } = result.value;

    // Cooldown / rate-limit signaling. Different faucet implementations use
    // different shapes (HTTP 429, or 400 + body.error mentioning cooldown).
    if (status === 429) {
      const detail =
        (body && typeof body === "object" && "retryAfter" in body
          ? String((body as FaucetErrorBody).retryAfter)
          : undefined) ?? "rate-limited";
      log.warn("Faucet cooldown", { address: target, detail });
      return { ok: false, error: { reason: "cooldown", detail } };
    }

    if (status >= 400) {
      const errBody = (body ?? {}) as FaucetErrorBody;
      const detail = errBody.error ?? errBody.message ?? `HTTP ${status}`;
      const reason: FaucetFailureReason = /cooldown|rate.?limit|already|wait/i.test(detail)
        ? "cooldown"
        : /invalid|address/i.test(detail)
        ? "invalid_address"
        : "http_error";
      log.warn("Faucet claim rejected by server", { address: target, status, detail, reason });
      return { ok: false, error: { reason, detail } };
    }

    const okBody = (body ?? {}) as FaucetSuccessBody;
    const txHash = okBody.txHash ?? okBody.hash;
    const amount = okBody.amount !== undefined ? String(okBody.amount) : undefined;
    log.info("Faucet claim succeeded", { address: target, txHash, amount });
    return { ok: true, value: { address: target, txHash, amount } };
  }
}

/** Convenience singleton honoring env config. */
export function createFaucetClient(): FaucetClient {
  const url = process.env.MONAD_FAUCET_URL?.trim() || DEFAULT_FAUCET_URL;
  return new FaucetClient({ url });
}
