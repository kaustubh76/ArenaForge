/**
 * dApp Health Check — per-page UI readiness report.
 *
 * Probes the live GraphQL endpoint + on-chain state for the data each
 * frontend page needs to render non-empty, then prints a one-line PASS /
 * NEEDS DATA / BROKEN status per page. Intended to be run after every
 * deploy to answer the question: "is the UI actually lit up?"
 *
 * Usage:
 *   npm run health:check
 *   GRAPHQL_URL=... npm run health:check    # override target
 */
import * as dotenv from "dotenv";
dotenv.config();

import { createPublicClient, http, defineChain, formatEther, type Abi } from "viem";

const graphqlUrl = process.env.GRAPHQL_URL || "https://arenaforge-agent.onrender.com/graphql";
const rpcUrl = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });

const coreAddr = process.env.ARENA_CORE_ADDRESS as `0x${string}` | undefined;
const registryAddr = process.env.MATCH_REGISTRY_ADDRESS as `0x${string}` | undefined;

const RegistryAbi: Abi = [
  { type: "function", name: "matchCounter", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getMatch", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "tournamentId", type: "uint256" }, { name: "round", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "winner", type: "address" }, { name: "resultHash", type: "bytes32" }, { name: "timestamp", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "duration", type: "uint256" }, { name: "status", type: "uint8" }] }] },
];

const strategyAddr = process.env.STRATEGY_ARENA_ADDRESS as `0x${string}` | undefined;
const StrategyAbi: Abi = [
  { type: "function", name: "getMatchState", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [{ name: "p1", type: "address" }, { name: "p2", type: "address" }, { name: "totalRounds", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "p1Score", type: "uint256" }, { name: "p2Score", type: "uint256" }, { name: "commitDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" }, { name: "initialized", type: "bool" }] }] },
];

interface GqlResponse<T> { data?: T; errors?: Array<{ message: string }>; }

async function gql<T>(query: string): Promise<GqlResponse<T>> {
  try {
    const res = await fetch(graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return { errors: [{ message: `HTTP ${res.status}` }] };
    return await res.json() as GqlResponse<T>;
  } catch (e: unknown) {
    return { errors: [{ message: (e as Error).message }] };
  }
}

type Status = "PASS" | "NEEDS DATA" | "BROKEN" | "WARN";

interface PageResult {
  page: string;
  route: string;
  status: Status;
  detail: string;
}

const results: PageResult[] = [];

function record(page: string, route: string, status: Status, detail: string): void {
  results.push({ page, route, status, detail });
}

// =========================================================================
// Probes
// =========================================================================

async function probeArenaLobby(): Promise<void> {
  const r = await gql<{ tournaments: Array<{ id: number; status: string }>; agents: Array<{ address: string }> }>(
    `{ tournaments { id status } agents { address } }`
  );
  if (r.errors) {
    record("ArenaLobby", "/", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  const ts = r.data?.tournaments ?? [];
  const ags = r.data?.agents ?? [];
  if (ts.length === 0) {
    record("ArenaLobby", "/", "NEEDS DATA", "0 tournaments");
  } else {
    record("ArenaLobby", "/", "PASS",
      `${ts.length} tournaments (${ts.filter(t => t.status === "ACTIVE").length} active, ${ts.filter(t => t.status === "COMPLETED").length} completed), ${ags.length} agents`);
  }
}

async function probeLeaderboard(): Promise<void> {
  const r = await gql<{ agents: Array<{ address: string; elo: number; matchesPlayed: number }> }>(
    `{ agents { address elo matchesPlayed } }`
  );
  if (r.errors) {
    record("Leaderboard", "/leaderboard", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  const ags = r.data?.agents ?? [];
  const withMatches = ags.filter(a => a.matchesPlayed > 0);
  if (ags.length === 0) {
    record("Leaderboard", "/leaderboard", "NEEDS DATA", "0 agents registered");
  } else if (withMatches.length === 0) {
    record("Leaderboard", "/leaderboard", "WARN",
      `${ags.length} agents but none have matchesPlayed>0 — chart will show flat ELO`);
  } else {
    record("Leaderboard", "/leaderboard", "PASS",
      `${ags.length} agents (${withMatches.length} with match history)`);
  }
}

async function probeMatchHistory(): Promise<void> {
  // Two probes: (1) bulk matches resolver — must surface on-chain matches
  // even when matchStore is empty (post-deploy this should pull from chain).
  // (2) single match by ID — confirms the loader path works.
  const r = await gql<{ matches: Array<{ id: number; winner: string | null; player1: string; status: string }> }>(
    `{ matches(limit: 20) { id winner player1 status } }`
  );
  if (r.errors) {
    record("Match History", "(global)", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  const ms = r.data?.matches ?? [];
  const withWinners = ms.filter(m => m.winner && m.winner !== "0x0000000000000000000000000000000000000000");
  const withPlayers = ms.filter(m => m.player1 && m.player1 !== "");

  // Cross-check: if on-chain has matches but bulk query returns 0, the
  // resolver fallback I added isn't live yet (Render hasn't redeployed).
  if (ms.length === 0 && registryAddr) {
    try {
      const onChainCount = await publicClient.readContract({
        address: registryAddr, abi: RegistryAbi, functionName: "matchCounter",
      }) as bigint;
      if (onChainCount > 0n) {
        record("Match History", "(global)", "WARN",
          `0 in GraphQL but ${onChainCount} on-chain — resolver fallback not deployed yet (push commit 4443a19)`);
        return;
      }
    } catch { /* ignore */ }
  }

  if (ms.length === 0) {
    record("Match History", "(global)", "NEEDS DATA", "0 matches anywhere");
  } else if (withPlayers.length === 0) {
    record("Match History", "(global)", "WARN",
      `${ms.length} matches but all have empty player1 — resolver should pull raw player addresses`);
  } else if (withWinners.length === 0) {
    record("Match History", "(global)", "WARN",
      `${ms.length} matches but 0 have non-zero winners — recordResult never fired with a real winner`);
  } else {
    record("Match History", "(global)", "PASS",
      `${ms.length} matches (${withWinners.length} with winners, ${withPlayers.length} with player addresses)`);
  }
}

async function probeAgentProfile(): Promise<void> {
  const r = await gql<{ agents: Array<{ address: string; matchesPlayed: number }> }>(
    `{ agents { address matchesPlayed } }`
  );
  if (r.errors) {
    record("Agent Profile", "/agent/:address", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  const ags = r.data?.agents ?? [];
  const withHistory = ags.filter(a => a.matchesPlayed > 0);
  if (ags.length === 0) {
    record("Agent Profile", "/agent/:address", "NEEDS DATA", "no agents to drill into");
  } else if (withHistory.length === 0) {
    record("Agent Profile", "/agent/:address", "WARN",
      `${ags.length} agents exist but none have any matches — profiles will show empty match history, no win rate, no ELO chart`);
  } else {
    record("Agent Profile", "/agent/:address", "PASS",
      `${withHistory.length}/${ags.length} agents have match history`);
  }
}

async function probeSeason(): Promise<void> {
  const r = await gql<{
    currentSeason: { id: number; active: boolean } | null;
    seasonalLeaderboard: Array<{ address: string; seasonalElo: number }>;
  }>(`{ currentSeason { id active } seasonalLeaderboard(seasonId: 1) { address seasonalElo } }`);
  if (r.errors) {
    record("Season", "/season", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  if (!r.data?.currentSeason) {
    record("Season", "/season", "NEEDS DATA", "no active season");
    return;
  }
  const lb = r.data.seasonalLeaderboard ?? [];
  if (lb.length === 0) {
    record("Season", "/season", "WARN",
      `Season ${r.data.currentSeason.id} active but seasonal leaderboard empty — needs recordSeasonalMatch calls (fires after match completion)`);
  } else {
    record("Season", "/season", "PASS",
      `Season ${r.data.currentSeason.id} active, ${lb.length} agents on leaderboard`);
  }
}

async function probeEvolution(): Promise<void> {
  // evolutionHistory takes a tournamentId arg; check tournament 1
  const r = await gql<{ evolutionHistory: Array<{ round: number }> }>(
    `{ evolutionHistory(tournamentId: 1) { round } }`
  );
  if (r.errors) {
    record("Evolution Dashboard", "/evolution", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  const evs = r.data?.evolutionHistory ?? [];
  if (evs.length === 0) {
    record("Evolution Dashboard", "/evolution", "NEEDS DATA",
      "0 evolution records — fires only after multi-round tournament completion");
  } else {
    record("Evolution Dashboard", "/evolution", "PASS", `${evs.length} evolution records on tournament 1`);
  }
}

async function probeSpectatorBetting(): Promise<void> {
  const r = await gql<{ topBettors: Array<{ address: string; totalBets: number }> }>(
    `{ topBettors(limit: 20) { address totalBets } }`
  );
  if (r.errors) {
    record("SpectatorHub / Bettor", "/spectator", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  const lb = r.data?.topBettors ?? [];
  if (lb.length === 0) {
    record("SpectatorHub / Bettor", "/spectator", "NEEDS DATA", "0 bettors in store (placeBet may have happened on-chain but matchStore not seeded)");
  } else {
    record("SpectatorHub / Bettor", "/spectator", "PASS", `${lb.length} bettors on leaderboard`);
  }
}

async function probeA2A(): Promise<void> {
  const r = await gql<{
    a2aChallenges: Array<{ id: number; status: string }>;
    a2aMessages: Array<{ id: number }>;
  }>(`{ a2aChallenges { id status } a2aMessages(limit: 5) { id } }`);
  if (r.errors) {
    record("A2A Command Center", "/a2a", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  const cs = r.data?.a2aChallenges ?? [];
  const msgs = r.data?.a2aMessages ?? [];
  if (cs.length === 0 && msgs.length === 0) {
    record("A2A Command Center", "/a2a", "NEEDS DATA", "no challenges or messages yet");
  } else {
    record("A2A Command Center", "/a2a", "PASS",
      `${cs.length} challenges, ${msgs.length} messages`);
  }
}

async function probeToken(): Promise<void> {
  const r = await gql<{ arenaToken: { address: string } | null }>(
    `{ arenaToken { address } }`
  );
  if (r.errors) {
    record("Token Page", "/token", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  if (!r.data?.arenaToken) {
    record("Token Page", "/token", "NEEDS DATA",
      "ARENA token not launched — needs deployer-side launch tx (out of scope of seed script)");
  } else {
    record("Token Page", "/token", "PASS", `Token at ${r.data.arenaToken.address}`);
  }
}

async function probeReplays(): Promise<void> {
  // A replay needs storeRoundState calls to have fired during match resolution.
  // We don't have a direct GraphQL query for "list of replayable matches"
  // but a completed match implies replay should be available.
  const r = await gql<{ matches: Array<{ id: number; winner: string | null }> }>(
    `{ matches(limit: 5) { id winner } }`
  );
  if (r.errors) {
    record("Replay Page", "/replay/:id", "BROKEN", `GraphQL error: ${r.errors[0].message}`);
    return;
  }
  const completed = (r.data?.matches ?? []).filter(m => m.winner);
  if (completed.length === 0) {
    record("Replay Page", "/replay/:id", "NEEDS DATA", "no completed matches to replay");
    return;
  }
  // Check if any of these have replay data
  const probe = completed[0];
  const r2 = await gql<{ matchReplay: { rounds: unknown[] } | null }>(
    `{ matchReplay(matchId: ${probe.id}) { rounds { __typename } } }`
  );
  if (r2.errors) {
    record("Replay Page", "/replay/:id", "WARN",
      `${completed.length} completed matches but matchReplay query errors: ${r2.errors[0].message}`);
  } else if (!r2.data?.matchReplay) {
    record("Replay Page", "/replay/:id", "WARN",
      `${completed.length} completed matches but matchReplay returns null — storeRoundState may not be firing`);
  } else {
    record("Replay Page", "/replay/:id", "PASS",
      `replay available for match ${probe.id} (${r2.data.matchReplay.rounds.length} rounds)`);
  }
}

async function probeOnChainMatches(): Promise<void> {
  if (!registryAddr) {
    record("On-chain matches", "(MatchRegistry)", "WARN", "MATCH_REGISTRY_ADDRESS unset, skipping");
    return;
  }
  try {
    const counter = await publicClient.readContract({
      address: registryAddr, abi: RegistryAbi, functionName: "matchCounter",
    }) as bigint;
    record("On-chain matches", "(MatchRegistry)", "PASS",
      `${counter} matches in MatchRegistry`);
  } catch (e: unknown) {
    record("On-chain matches", "(MatchRegistry)", "BROKEN", (e as Error).message?.slice(0, 100) ?? "unknown");
  }
}

async function probeStrategyInit(): Promise<void> {
  // Walks the last N matches and checks whether the StrategyArena contract
  // recognises them as initialised. Filters by MatchRegistry.timestamp so
  // historical matches from setup-arena.ts (months old) don't mask the
  // current state of the deployed backend patch.
  if (!registryAddr || !strategyAddr) {
    record("Strategy init fix", "(on-chain)", "WARN", "registry/strategy address unset, skipping");
    return;
  }
  try {
    const counter = await publicClient.readContract({
      address: registryAddr, abi: RegistryAbi, functionName: "matchCounter",
    }) as bigint;
    if (counter === 0n) {
      record("Strategy init fix", "(on-chain)", "NEEDS DATA", "no matches yet");
      return;
    }
    // Only consider matches created in the last 24 hours — historical
    // matches from setup-arena.ts predate the recent backend patch and
    // were initialised by a different code path, so they shouldn't count
    // toward "is the patch live now".
    const recentCutoff = BigInt(Math.floor(Date.now() / 1000) - 24 * 3600);
    const scanFrom = counter > 30n ? counter - 30n + 1n : 1n;
    let recentStrategyMatches = 0;
    let recentInitialized = 0;
    let oldStrategyMatches = 0;
    for (let i = counter; i >= scanFrom; i--) {
      const m = await publicClient.readContract({
        address: registryAddr, abi: RegistryAbi, functionName: "getMatch",
        args: [i],
      }) as { id: bigint; timestamp: bigint; player1: `0x${string}`; status: number };
      const isRecent = m.timestamp >= recentCutoff;
      try {
        const s = await publicClient.readContract({
          address: strategyAddr, abi: StrategyAbi, functionName: "getMatchState",
          args: [i],
        }) as { initialized: boolean; p1: `0x${string}` };
        // Skip if MatchRegistry shows non-zero player addresses but
        // StrategyArena state is empty — that match isn't a Strategy match.
        // A Strategy match is identified by having any data in StrategyArena
        // OR by being in a Strategy tournament (which we'd need to look up).
        // Heuristic: if StrategyArena state has p1 set, OR if MatchRegistry
        // shows the match COMPLETED with winner=0x0 and timestamp recent,
        // it might be a forfeit-resolved Strategy match where init failed.
        const hasStrategyState = s.p1 !== "0x0000000000000000000000000000000000000000";
        if (hasStrategyState && isRecent) {
          recentStrategyMatches++;
          if (s.initialized) recentInitialized++;
        } else if (hasStrategyState) {
          oldStrategyMatches++;
        }
      } catch { /* skip */ }
    }
    if (recentStrategyMatches === 0 && oldStrategyMatches === 0) {
      record("Strategy init fix", "(on-chain)", "NEEDS DATA",
        `no Strategy matches in last 30 records`);
    } else if (recentStrategyMatches === 0) {
      record("Strategy init fix", "(on-chain)", "NEEDS DATA",
        `${oldStrategyMatches} historical Strategy matches but no recent ones — re-run seed:full to test live state`);
    } else if (recentInitialized === 0) {
      record("Strategy init fix", "(on-chain)", "BROKEN",
        `${recentStrategyMatches} recent Strategy matches but 0 initialized — backend patch (4443a19) NOT deployed; matches will forfeit-resolve as draws`);
    } else if (recentInitialized < recentStrategyMatches) {
      record("Strategy init fix", "(on-chain)", "WARN",
        `${recentInitialized}/${recentStrategyMatches} recent Strategy matches initialized — partial deploy or transient init failures`);
    } else {
      record("Strategy init fix", "(on-chain)", "PASS",
        `${recentInitialized}/${recentStrategyMatches} recent Strategy matches initialized — patch live`);
    }
  } catch (e: unknown) {
    record("Strategy init fix", "(on-chain)", "BROKEN", (e as Error).message?.slice(0, 100) ?? "unknown");
  }
}

async function probeFrontendBundle(): Promise<void> {
  const url = "https://dist-sigma-five-61.vercel.app/";
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      record("Deployed Frontend", url, "BROKEN", `HTTP ${res.status}`);
      return;
    }
    const html = await res.text();
    const m = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (!m) {
      record("Deployed Frontend", url, "WARN", "could not find bundle src");
      return;
    }
    const bundleUrl = `https://dist-sigma-five-61.vercel.app${m[1]}`;
    const bres = await fetch(bundleUrl);
    const bundle = await bres.text();
    const hasLiveBackend = bundle.includes("arenaforge-agent.onrender.com");
    const hasLocalhost = bundle.includes("localhost:4000");
    if (hasLiveBackend && !hasLocalhost) {
      record("Deployed Frontend", url, "PASS", "bundle points at live backend");
    } else if (hasLocalhost && !hasLiveBackend) {
      record("Deployed Frontend", url, "BROKEN",
        "bundle hardcoded to localhost:4000 — Vercel env vars not set; see DEPLOY_FIX.md §A");
    } else if (hasLiveBackend && hasLocalhost) {
      record("Deployed Frontend", url, "WARN",
        "bundle has both live and localhost URLs — partial config");
    } else {
      record("Deployed Frontend", url, "WARN",
        "bundle has neither live nor localhost URLs — unexpected");
    }
  } catch (e: unknown) {
    record("Deployed Frontend", url, "BROKEN", (e as Error).message?.slice(0, 200) ?? "unknown");
  }
}

// =========================================================================
// Main
// =========================================================================

async function main(): Promise<void> {
  console.log(`\n=== dApp Health Check ===`);
  console.log(`GraphQL: ${graphqlUrl}`);
  console.log(`RPC:     ${rpcUrl}`);
  console.log("");

  // Run probes (sequential — output is more readable, latency is fine)
  await probeFrontendBundle();
  await probeArenaLobby();
  await probeLeaderboard();
  await probeAgentProfile();
  await probeMatchHistory();
  await probeReplays();
  await probeSeason();
  await probeEvolution();
  await probeSpectatorBetting();
  await probeA2A();
  await probeToken();
  await probeOnChainMatches();
  await probeStrategyInit();

  // Render
  const widthPage = Math.max(...results.map(r => r.page.length));
  const widthRoute = Math.max(...results.map(r => r.route.length));
  const statusColor: Record<Status, string> = {
    PASS: "\x1b[32m",        // green
    "NEEDS DATA": "\x1b[33m", // yellow
    WARN: "\x1b[35m",        // magenta
    BROKEN: "\x1b[31m",      // red
  };
  const reset = "\x1b[0m";
  console.log("Page".padEnd(widthPage) + "  " + "Route".padEnd(widthRoute) + "  " + "Status".padEnd(11) + "  Detail");
  console.log("─".repeat(widthPage + widthRoute + 11 + 6));
  for (const r of results) {
    console.log(
      r.page.padEnd(widthPage) + "  " +
      r.route.padEnd(widthRoute) + "  " +
      statusColor[r.status] + r.status.padEnd(11) + reset + "  " +
      r.detail
    );
  }

  // Summary
  const counts = { PASS: 0, "NEEDS DATA": 0, WARN: 0, BROKEN: 0 };
  for (const r of results) counts[r.status]++;
  console.log("");
  console.log(`Summary: ${counts.PASS} pass, ${counts["NEEDS DATA"]} needs-data, ${counts.WARN} warn, ${counts.BROKEN} broken`);

  // Exit non-zero if anything is BROKEN — useful for CI / scripts
  if (counts.BROKEN > 0) process.exit(1);
}

main().catch(err => {
  console.error("\nHEALTH CHECK FAILED:", err);
  process.exit(1);
});
