/**
 * Seed Full dApp — drives every functional surface end-to-end on Monad Testnet.
 *
 * Goal: populate the deployed UI (https://dist-sigma-five-61.vercel.app/) by
 * producing real on-chain activity. Empty UI pages happen when contracts have
 * no completed matches, no betting pools, no A2A challenges, no token mints.
 * This script creates one of each.
 *
 * Architecture insight: the deployed ArenaCore contract restricts privileged
 * operations (createTournament, startTournament, createMatch, recordResult,
 * updateElo) to a single `arenaAgent` wallet (the deployer) — NOT our seed
 * wallet. So this script:
 *   1. Creates tournaments via the GraphQL `createTournament` admin mutation
 *      (the backend signs as arenaAgent on our behalf — admin token is unset
 *      on the Render deployment so the gate is currently open).
 *   2. Funds + registers ephemeral player wallets directly on-chain.
 *   3. Has players join the tournament (on-chain — joinTournament is public).
 *   4. Waits for the backend's auto-start + match-create cycle (~30s tick).
 *   5. Drives commit/reveal moves on the game-mode contract from the player
 *      wallets — this is the only step the backend can't do (it has no
 *      access to player private keys).
 *   6. Backend handles resolution, ELO update, prize distribution, and
 *      betting settlement automatically via its 30s heartbeat.
 *
 * Phases:
 *   A. Register 4 ephemeral player wallets.
 *   B. StrategyArena tournament (4 agents, swiss-1, full lifecycle).
 *   C. OracleDuel tournament (2 agents).
 *   D. AuctionWars tournament (2 agents).
 *   E. QuizBowl tournament (2 agents).
 *   F. Spectator bet via SpectatorBetting contract.
 *   G. A2A challenge via GraphQL.
 *   H. ARENA token buy via GraphQL.
 *
 * Usage:
 *   SEED_PRIVATE_KEY=0x... npm run seed:full   # or set in .env
 */
import * as dotenv from "dotenv";
dotenv.config();

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodePacked,
  defineChain,
  parseEther,
  formatEther,
  type Abi,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

// =========================================================================
// Config
// =========================================================================

const rpcUrl = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const graphqlUrl = process.env.GRAPHQL_URL || "https://arenaforge-agent.onrender.com/graphql";

const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { decimals: 18, name: "MON", symbol: "MON" },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const seedKey = (process.env.SEED_PRIVATE_KEY ||
  process.env.ARENA_AGENT_PRIVATE_KEY) as `0x${string}` | undefined;
if (!seedKey) {
  console.error("Set SEED_PRIVATE_KEY (or ARENA_AGENT_PRIVATE_KEY) in .env");
  process.exit(1);
}

const requireAddr = (name: string): `0x${string}` => {
  const v = process.env[name]?.trim();
  if (!v || !/^0x[0-9a-fA-F]{40}$/.test(v)) {
    throw new Error(`Missing/invalid ${name} in .env`);
  }
  return v as `0x${string}`;
};

const coreAddr = requireAddr("ARENA_CORE_ADDRESS");
const strategyAddr = requireAddr("STRATEGY_ARENA_ADDRESS");
const oracleAddr = requireAddr("ORACLE_DUEL_ADDRESS");
const auctionAddr = requireAddr("AUCTION_WARS_ADDRESS");
const quizAddr = requireAddr("QUIZ_BOWL_ADDRESS");
const bettingAddr = process.env.SPECTATOR_BETTING_ADDRESS as `0x${string}` | undefined;
const adminToken = process.env.ARENA_ADMIN_TOKEN || "";

// =========================================================================
// ABIs (subset — only what we call directly from player wallets)
// =========================================================================

const ArenaCoreAbi: Abi = [
  { type: "function", name: "registerAgent", stateMutability: "nonpayable", inputs: [{ name: "moltbookHandle", type: "string" }], outputs: [] },
  { type: "function", name: "joinTournament", stateMutability: "payable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "getAgent", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "tuple", components: [{ name: "agentAddress", type: "address" }, { name: "moltbookHandle", type: "string" }, { name: "avatarURI", type: "string" }, { name: "elo", type: "uint256" }, { name: "matchesPlayed", type: "uint256" }, { name: "wins", type: "uint256" }, { name: "losses", type: "uint256" }, { name: "currentStreak", type: "int256" }, { name: "longestWinStreak", type: "uint256" }, { name: "registered", type: "bool" }] }] },
  { type: "function", name: "getTournament", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "name", type: "string" }, { name: "gameType", type: "uint8" }, { name: "format", type: "uint8" }, { name: "status", type: "uint8" }, { name: "entryStake", type: "uint256" }, { name: "maxParticipants", type: "uint256" }, { name: "currentParticipants", type: "uint256" }, { name: "prizePool", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "roundCount", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "parametersHash", type: "bytes32" }] }] },
];

// MatchRegistry — for reading match data directly from chain (the backend's
// SQLite cache only surfaces RESOLVED matches via GraphQL, so during the
// drive phase we must read on-chain).
const registryAddr = requireAddr("MATCH_REGISTRY_ADDRESS");
const RegistryAbi: Abi = [
  { type: "function", name: "matchCounter", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getMatch", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "tournamentId", type: "uint256" }, { name: "round", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "winner", type: "address" }, { name: "resultHash", type: "bytes32" }, { name: "timestamp", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "duration", type: "uint256" }, { name: "status", type: "uint8" }] }] },
];

const StrategyAbi: Abi = [
  { type: "function", name: "commitMove", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "moveHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "revealMove", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "move", type: "uint8" }, { name: "salt", type: "bytes32" }], outputs: [] },
  { type: "function", name: "getMatchState", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "tuple", components: [{ name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "totalRounds", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "player1Score", type: "uint256" }, { name: "player2Score", type: "uint256" }, { name: "commitDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" }, { name: "initialized", type: "bool" }] }] },
];

const AuctionAbi: Abi = [
  { type: "function", name: "commitBid", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "roundNum", type: "uint256" }, { name: "bidHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "revealBid", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "roundNum", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "salt", type: "bytes32" }], outputs: [] },
];

const QuizAbi: Abi = [
  { type: "function", name: "commitAnswer", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "questionIndex", type: "uint256" }, { name: "answerHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "revealAnswer", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "questionIndex", type: "uint256" }, { name: "answer", type: "uint256" }, { name: "salt", type: "bytes32" }], outputs: [] },
];

const BettingAbi: Abi = [
  { type: "function", name: "placeBet", stateMutability: "payable", inputs: [{ name: "matchId", type: "uint256" }, { name: "predictedWinner", type: "address" }], outputs: [] },
];

// =========================================================================
// Clients & helpers
// =========================================================================

const publicClient = createPublicClient({ chain: monadTestnet, transport: http(rpcUrl) });
const seedAccount = privateKeyToAccount(seedKey);
const seed = createWalletClient({ chain: monadTestnet, transport: http(rpcUrl), account: seedAccount });

async function waitTx(hash: `0x${string}`): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Reverted: ${hash}`);
}

/**
 * Retry a contract write that depends on a backend-driven prerequisite tx.
 *
 * The backend ticks every ~30s; sometimes our player tries to commit/reveal/
 * bet before the backend has finished the prerequisite (initMatch /
 * startAuctionRound / postQuestion / openBetting). Those reverts have
 * specific reasons we recognise and retry on.
 *
 * Anything else (e.g. "Hash mismatch", "Already committed", or a network
 * error) bubbles up immediately — those are real bugs we don't want to mask.
 */
async function retryOnBackendRace<T>(
  fn: () => Promise<T>,
  opts: { tag: string; maxAttempts?: number; delayMs?: number } = { tag: "tx" }
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 12; // 12 × 10s = 2 min headroom
  const delayMs = opts.delayMs ?? 10000;
  const RETRY_REASONS = [
    "Not initialized",       // game-mode contract hasn't seen initMatch yet
    "Pool not found",        // SpectatorBetting hasn't seen openBetting yet
    "Question not found",    // QuizBowl hasn't seen postQuestion yet
    "All questions posted",  // race past posting (try once more after backend ticks)
    "insufficient balance",  // Monad's known balance-check race after funding
  ];
  let lastErr: unknown = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (e: unknown) {
      lastErr = e;
      const msg = String(
        (e as { shortMessage?: string }).shortMessage ?? (e as Error).message ?? e
      );
      const retryable = RETRY_REASONS.some(r => msg.includes(r));
      if (!retryable) throw e;
      if (i === maxAttempts - 1) break;
      console.log(`    ${opts.tag}: backend race (${msg.split('\n')[0].slice(0, 80)}), retrying ${i + 1}/${maxAttempts}...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const COOPERATE = 1;
const DEFECT = 2;

interface Player {
  account: ReturnType<typeof privateKeyToAccount>;
  wallet: ReturnType<typeof createWalletClient>;
  handle: string;
}

function makePlayer(handle: string): Player {
  const key = generatePrivateKey();
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ chain: monadTestnet, transport: http(rpcUrl), account });
  return { account, wallet, handle };
}

async function fundPlayer(p: Player, amount: bigint): Promise<void> {
  const hash = await seed.sendTransaction({
    to: p.account.address,
    value: amount,
    chain: monadTestnet,
  });
  await waitTx(hash);
  // Monad has a known gap between receipt-confirmation and contract-visible
  // state finalization. Poll up to 30s, then add 1.5s buffer.
  for (let i = 0; i < 30; i++) {
    const bal = await publicClient.getBalance({ address: p.account.address });
    if (bal >= amount / 2n) {
      await new Promise(r => setTimeout(r, 1500));
      return;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Funding ${p.account.address} not visible after 30s`);
}

async function registerPlayer(p: Player): Promise<void> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const hash = await p.wallet.writeContract({
        address: coreAddr, abi: ArenaCoreAbi, functionName: "registerAgent",
        args: [p.handle],
      });
      await waitTx(hash);
      return;
    } catch (e: unknown) {
      lastErr = e;
      const msg = String((e as { shortMessage?: string }).shortMessage || e);
      if (msg.includes("insufficient balance")) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function joinTournament(p: Player, tournamentId: bigint, stake: bigint): Promise<void> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const hash = await p.wallet.writeContract({
        address: coreAddr, abi: ArenaCoreAbi, functionName: "joinTournament",
        args: [tournamentId], value: stake,
      });
      await waitTx(hash);
      return;
    } catch (e: unknown) {
      lastErr = e;
      const msg = String((e as { shortMessage?: string }).shortMessage || e);
      if (msg.includes("insufficient balance")) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

interface GqlResponse<T> { data?: T; errors?: Array<{ message: string }>; }

async function gql<T>(query: string): Promise<GqlResponse<T>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
  const res = await fetch(graphqlUrl, {
    method: "POST", headers, body: JSON.stringify({ query }),
  });
  return await res.json() as GqlResponse<T>;
}

async function gqlCreateTournament(opts: {
  name: string; gameType: "ORACLE_DUEL" | "STRATEGY_ARENA" | "AUCTION_WARS" | "QUIZ_BOWL";
  format: "SWISS_SYSTEM" | "SINGLE_ELIMINATION" | "DOUBLE_ELIMINATION";
  entryStake: string; maxParticipants: number; roundCount: number;
}): Promise<bigint> {
  const r = await gql<{ createTournament: { id: number; name: string } }>(
    `mutation { createTournament(input: { name: "${opts.name}", gameType: ${opts.gameType}, format: ${opts.format}, entryStake: "${opts.entryStake}", maxParticipants: ${opts.maxParticipants}, roundCount: ${opts.roundCount} }) { id name } }`
  );
  if (r.errors) throw new Error(`createTournament failed: ${JSON.stringify(r.errors)}`);
  if (!r.data?.createTournament) throw new Error(`createTournament empty: ${JSON.stringify(r)}`);
  return BigInt(r.data.createTournament.id);
}

interface OnChainMatch {
  id: number; tournamentId: number; round: number;
  player1: `0x${string}`; player2: `0x${string}`;
  winner: `0x${string}`; status: number; // 0=Pending, 1=InProgress, 2=Completed
}

async function readOnChainMatch(matchId: number): Promise<OnChainMatch | null> {
  try {
    const m = await publicClient.readContract({
      address: registryAddr, abi: RegistryAbi, functionName: "getMatch",
      args: [BigInt(matchId)],
    }) as { id: bigint; tournamentId: bigint; round: bigint; player1: `0x${string}`; player2: `0x${string}`; winner: `0x${string}`; status: number };
    return {
      id: Number(m.id), tournamentId: Number(m.tournamentId), round: Number(m.round),
      player1: m.player1, player2: m.player2, winner: m.winner, status: m.status,
    };
  } catch {
    return null;
  }
}

async function pollOnChainMatchesForTournament(tournamentId: bigint, expectedCount: number, timeoutMs = 240000): Promise<OnChainMatch[]> {
  const start = Date.now();
  let lastMatchCounter = 0n;
  while (Date.now() - start < timeoutMs) {
    const counter = await publicClient.readContract({
      address: registryAddr, abi: RegistryAbi, functionName: "matchCounter",
    }) as bigint;
    if (counter > lastMatchCounter) {
      // Scan recent matches for ones in our tournament. Look back up to 30
      // matches — the backend created them all at once when the tournament started.
      const tournamentMatches: OnChainMatch[] = [];
      const scanFrom = counter > 30n ? counter - 30n + 1n : 1n;
      for (let i = scanFrom; i <= counter; i++) {
        const m = await readOnChainMatch(Number(i));
        if (m && m.tournamentId === Number(tournamentId)) tournamentMatches.push(m);
      }
      if (tournamentMatches.length >= expectedCount) return tournamentMatches;
      lastMatchCounter = counter;
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Timed out waiting for ${expectedCount} on-chain matches in tournament ${tournamentId}`);
}

async function pollForMatchCompletion(matchId: number, timeoutMs = 240000): Promise<OnChainMatch> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = await readOnChainMatch(matchId);
    if (m && m.status === 2) return m; // Completed
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Timed out waiting for match ${matchId} to complete`);
}

// =========================================================================
// PHASE B: Strategy Arena (commit/reveal driver)
// =========================================================================

async function driveStrategyMatch(matchId: number, p1: Player, p2: Player): Promise<void> {
  // p1 cooperates, p2 defects → p2 wins
  const salt1 = keccak256(encodePacked(["string"], [`s1_m${matchId}_${Date.now()}`]));
  const salt2 = keccak256(encodePacked(["string"], [`s2_m${matchId}_${Date.now()}`]));
  const hash1 = keccak256(encodePacked(["uint8", "bytes32"], [COOPERATE, salt1]));
  const hash2 = keccak256(encodePacked(["uint8", "bytes32"], [DEFECT, salt2]));

  console.log(`    p1 commit...`);
  await retryOnBackendRace(async () => {
    const h = await p1.wallet.writeContract({
      address: strategyAddr, abi: StrategyAbi, functionName: "commitMove",
      args: [BigInt(matchId), hash1],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p1 commit` });

  console.log(`    p2 commit...`);
  await retryOnBackendRace(async () => {
    const h = await p2.wallet.writeContract({
      address: strategyAddr, abi: StrategyAbi, functionName: "commitMove",
      args: [BigInt(matchId), hash2],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p2 commit` });

  console.log(`    p1 reveal (Cooperate)...`);
  await retryOnBackendRace(async () => {
    const h = await p1.wallet.writeContract({
      address: strategyAddr, abi: StrategyAbi, functionName: "revealMove",
      args: [BigInt(matchId), COOPERATE, salt1],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p1 reveal` });

  console.log(`    p2 reveal (Defect)...`);
  await retryOnBackendRace(async () => {
    const h = await p2.wallet.writeContract({
      address: strategyAddr, abi: StrategyAbi, functionName: "revealMove",
      args: [BigInt(matchId), DEFECT, salt2],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p2 reveal` });
  // Backend's heartbeat picks up "both revealed" → resolveRound + recordResult.
}

async function runStrategyArena(players: Player[], stake: bigint): Promise<bigint> {
  console.log("\n--- Phase B: StrategyArena Tournament ---");
  const stakeStr = formatEther(stake);
  const tid = await gqlCreateTournament({
    name: `Seed Strategy ${Date.now() % 10000}`,
    gameType: "STRATEGY_ARENA", format: "SWISS_SYSTEM",
    entryStake: stakeStr, maxParticipants: 4, roundCount: 1,
  });
  console.log(`  Tournament ID: ${tid}`);

  for (const p of players) {
    await joinTournament(p, tid, stake);
    console.log(`  ${p.handle} joined`);
  }

  console.log(`  Waiting for backend to auto-start + create matches on-chain...`);
  const matches = await pollOnChainMatchesForTournament(tid, 2);
  console.log(`  Backend created ${matches.length} on-chain matches`);

  // Match each backend-created match to player wallets and drive commit/reveal
  for (const m of matches) {
    const p1 = players.find(p => p.account.address.toLowerCase() === m.player1.toLowerCase());
    const p2 = players.find(p => p.account.address.toLowerCase() === m.player2.toLowerCase());
    if (!p1 || !p2) {
      console.log(`  Match ${m.id}: could not match players (p1=${m.player1}, p2=${m.player2}), skipping`);
      continue;
    }
    console.log(`  Match #${m.id}: ${p1.handle} vs ${p2.handle}`);
    try {
      await driveStrategyMatch(m.id, p1, p2);
      console.log(`    Waiting for backend to resolve + record...`);
      await pollForMatchCompletion(m.id, 180000);
      console.log(`    Match #${m.id} completed`);
    } catch (e: unknown) {
      console.log(`    Drive failed: ${(e as Error).message?.slice(0, 200)}`);
    }
  }

  return tid;
}

// =========================================================================
// PHASE C: Oracle Duel (no player action needed — backend handles snapshot/resolve)
// =========================================================================

async function runOracleDuel(players: Player[], stake: bigint): Promise<bigint> {
  console.log("\n--- Phase C: OracleDuel Tournament ---");
  const stakeStr = formatEther(stake);
  const tid = await gqlCreateTournament({
    name: `Seed Oracle ${Date.now() % 10000}`,
    gameType: "ORACLE_DUEL", format: "SINGLE_ELIMINATION",
    entryStake: stakeStr, maxParticipants: 2, roundCount: 1,
  });
  console.log(`  Tournament ID: ${tid}`);

  for (const p of players) {
    await joinTournament(p, tid, stake);
    console.log(`  ${p.handle} joined`);
  }

  console.log(`  Waiting for backend to create + drive duel...`);
  try {
    const matches = await pollOnChainMatchesForTournament(tid, 1, 180000);
    console.log(`  Match #${matches[0].id} created. Waiting for backend resolution...`);
    await pollForMatchCompletion(matches[0].id, 240000);
    console.log(`  Match #${matches[0].id} completed`);
  } catch (e: unknown) {
    console.log(`  Oracle drive timeout: ${(e as Error).message}`);
  }
  return tid;
}

// =========================================================================
// PHASE D: Auction Wars (commit/reveal bid driver)
// =========================================================================

async function driveAuctionMatch(matchId: number, p1: Player, p2: Player): Promise<void> {
  const bid1 = parseEther("0.05");
  const bid2 = parseEther("0.08");
  const salt1 = keccak256(encodePacked(["string"], [`b1_${matchId}_${Date.now()}`]));
  const salt2 = keccak256(encodePacked(["string"], [`b2_${matchId}_${Date.now()}`]));
  const bidHash1 = keccak256(encodePacked(["uint256", "bytes32"], [bid1, salt1]));
  const bidHash2 = keccak256(encodePacked(["uint256", "bytes32"], [bid2, salt2]));

  console.log(`    p1 bid commit...`);
  await retryOnBackendRace(async () => {
    const h = await p1.wallet.writeContract({
      address: auctionAddr, abi: AuctionAbi, functionName: "commitBid",
      args: [BigInt(matchId), 1n, bidHash1],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p1 bid commit` });

  console.log(`    p2 bid commit...`);
  await retryOnBackendRace(async () => {
    const h = await p2.wallet.writeContract({
      address: auctionAddr, abi: AuctionAbi, functionName: "commitBid",
      args: [BigInt(matchId), 1n, bidHash2],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p2 bid commit` });

  console.log(`    p1 bid reveal (0.05)...`);
  await retryOnBackendRace(async () => {
    const h = await p1.wallet.writeContract({
      address: auctionAddr, abi: AuctionAbi, functionName: "revealBid",
      args: [BigInt(matchId), 1n, bid1, salt1],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p1 bid reveal` });

  console.log(`    p2 bid reveal (0.08)...`);
  await retryOnBackendRace(async () => {
    const h = await p2.wallet.writeContract({
      address: auctionAddr, abi: AuctionAbi, functionName: "revealBid",
      args: [BigInt(matchId), 1n, bid2, salt2],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p2 bid reveal` });
}

async function runAuctionWars(players: Player[], stake: bigint): Promise<bigint> {
  console.log("\n--- Phase D: AuctionWars Tournament ---");
  const stakeStr = formatEther(stake);
  const tid = await gqlCreateTournament({
    name: `Seed Auction ${Date.now() % 10000}`,
    gameType: "AUCTION_WARS", format: "SINGLE_ELIMINATION",
    entryStake: stakeStr, maxParticipants: 2, roundCount: 1,
  });
  console.log(`  Tournament ID: ${tid}`);

  for (const p of players) {
    await joinTournament(p, tid, stake);
    console.log(`  ${p.handle} joined`);
  }

  console.log(`  Waiting for backend to create match on-chain...`);
  try {
    const matches = await pollOnChainMatchesForTournament(tid, 1, 180000);
    const m = matches[0];
    const p1 = players.find(p => p.account.address.toLowerCase() === m.player1.toLowerCase());
    const p2 = players.find(p => p.account.address.toLowerCase() === m.player2.toLowerCase());
    if (p1 && p2) {
      console.log(`  Match #${m.id}: ${p1.handle} vs ${p2.handle}`);
      await driveAuctionMatch(m.id, p1, p2);
      console.log(`  Waiting for backend resolution...`);
      await pollForMatchCompletion(m.id, 240000);
      console.log(`  Match #${m.id} completed`);
    }
  } catch (e: unknown) {
    console.log(`  Auction drive failed: ${(e as Error).message?.slice(0, 200)}`);
  }
  return tid;
}

// =========================================================================
// PHASE E: Quiz Bowl (commit/reveal answer driver)
// =========================================================================

async function driveQuizMatch(matchId: number, p1: Player, p2: Player): Promise<void> {
  const correctAnswer = 42n;
  const wrongAnswer = 7n;
  const salt1 = keccak256(encodePacked(["string"], [`a1_${matchId}_${Date.now()}`]));
  const salt2 = keccak256(encodePacked(["string"], [`a2_${matchId}_${Date.now()}`]));
  const ansHash1 = keccak256(encodePacked(["uint256", "bytes32"], [correctAnswer, salt1]));
  const ansHash2 = keccak256(encodePacked(["uint256", "bytes32"], [wrongAnswer, salt2]));

  console.log(`    p1 answer commit...`);
  await retryOnBackendRace(async () => {
    const h = await p1.wallet.writeContract({
      address: quizAddr, abi: QuizAbi, functionName: "commitAnswer",
      args: [BigInt(matchId), 0n, ansHash1],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p1 answer commit` });

  console.log(`    p2 answer commit...`);
  await retryOnBackendRace(async () => {
    const h = await p2.wallet.writeContract({
      address: quizAddr, abi: QuizAbi, functionName: "commitAnswer",
      args: [BigInt(matchId), 0n, ansHash2],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p2 answer commit` });

  console.log(`    p1 answer reveal (42)...`);
  await retryOnBackendRace(async () => {
    const h = await p1.wallet.writeContract({
      address: quizAddr, abi: QuizAbi, functionName: "revealAnswer",
      args: [BigInt(matchId), 0n, correctAnswer, salt1],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p1 answer reveal` });

  console.log(`    p2 answer reveal (7)...`);
  await retryOnBackendRace(async () => {
    const h = await p2.wallet.writeContract({
      address: quizAddr, abi: QuizAbi, functionName: "revealAnswer",
      args: [BigInt(matchId), 0n, wrongAnswer, salt2],
    });
    await waitTx(h);
  }, { tag: `m${matchId} p2 answer reveal` });
}

async function runQuizBowl(players: Player[], stake: bigint): Promise<bigint> {
  console.log("\n--- Phase E: QuizBowl Tournament ---");
  const stakeStr = formatEther(stake);
  const tid = await gqlCreateTournament({
    name: `Seed Quiz ${Date.now() % 10000}`,
    gameType: "QUIZ_BOWL", format: "SINGLE_ELIMINATION",
    entryStake: stakeStr, maxParticipants: 2, roundCount: 1,
  });
  console.log(`  Tournament ID: ${tid}`);

  for (const p of players) {
    await joinTournament(p, tid, stake);
    console.log(`  ${p.handle} joined`);
  }

  console.log(`  Waiting for backend to create match on-chain...`);
  try {
    const matches = await pollOnChainMatchesForTournament(tid, 1, 180000);
    const m = matches[0];
    const p1 = players.find(p => p.account.address.toLowerCase() === m.player1.toLowerCase());
    const p2 = players.find(p => p.account.address.toLowerCase() === m.player2.toLowerCase());
    if (p1 && p2) {
      console.log(`  Match #${m.id}: ${p1.handle} vs ${p2.handle}`);
      await driveQuizMatch(m.id, p1, p2);
      console.log(`  Waiting for backend resolution...`);
      await pollForMatchCompletion(m.id, 240000);
      console.log(`  Match #${m.id} completed`);
    }
  } catch (e: unknown) {
    console.log(`  Quiz drive failed: ${(e as Error).message?.slice(0, 200)}`);
  }
  return tid;
}

// =========================================================================
// PHASE F: Spectator betting on a live match
// =========================================================================

async function runSpectatorBet(bettors: Player[], targetMatchId: number, p1Addr: string, p2Addr: string): Promise<void> {
  if (!bettingAddr) {
    console.log("\n--- Phase F: SpectatorBetting (SKIPPED — SPECTATOR_BETTING_ADDRESS unset) ---");
    return;
  }
  console.log(`\n--- Phase F: SpectatorBetting on match #${targetMatchId} ---`);
  for (let i = 0; i < bettors.length; i++) {
    const b = bettors[i];
    const pick = (i % 2 === 0 ? p1Addr : p2Addr) as `0x${string}`;
    const amount = parseEther(i % 2 === 0 ? "0.005" : "0.01");
    try {
      await retryOnBackendRace(async () => {
        const h = await b.wallet.writeContract({
          address: bettingAddr, abi: BettingAbi, functionName: "placeBet",
          args: [BigInt(targetMatchId), pick],
          value: amount,
        });
        await waitTx(h);
      }, { tag: `bettor ${i} placeBet` });
      console.log(`  Bettor ${i} bet ${formatEther(amount)} MON on ${pick.slice(0, 10)}…`);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string }).shortMessage || (e as Error).message;
      console.log(`  Bettor ${i} bet failed: ${String(msg).slice(0, 200)}`);
    }
  }
}

// =========================================================================
// PHASE G: A2A challenge via GraphQL
// =========================================================================

async function runA2AChallenge(challenger: Player, challenged: Player): Promise<void> {
  console.log("\n--- Phase G: A2A Challenge ---");
  const r = await gql<{ sendA2AChallenge: { id: number; status: string } }>(
    `mutation { sendA2AChallenge(targetAgent: "${challenged.account.address}", gameType: STRATEGY_ARENA, stake: "0.005") { id challenger challenged status } }`
  );
  if (r.errors) {
    console.log(`  errors: ${JSON.stringify(r.errors).slice(0, 200)}`);
    return;
  }
  if (r.data?.sendA2AChallenge?.id) {
    const cid = r.data.sendA2AChallenge.id;
    console.log(`  Challenge #${cid} sent`);
    const a = await gql<{ respondToChallenge: { status: string } }>(
      `mutation { respondToChallenge(challengeId: ${cid}, accept: true) { id status } }`
    );
    if (a.errors) console.log(`  accept errors: ${JSON.stringify(a.errors).slice(0, 200)}`);
    else console.log(`  Challenge accepted: ${a.data?.respondToChallenge?.status}`);
  }
}

// =========================================================================
// PHASE H: ARENA token buy
// =========================================================================

async function runTokenBuy(): Promise<void> {
  console.log("\n--- Phase H: ARENA Token Buy ---");
  const r = await gql<{ buyArenaToken: { success: boolean; txHash?: string } }>(
    `mutation { buyArenaToken(amountMON: "0.01") { success txHash } }`
  );
  if (r.errors) {
    console.log(`  errors: ${JSON.stringify(r.errors).slice(0, 200)}`);
    return;
  }
  if (r.data?.buyArenaToken?.success) {
    console.log(`  Token buy succeeded: ${r.data.buyArenaToken.txHash}`);
  } else {
    console.log(`  Token buy result: ${JSON.stringify(r.data).slice(0, 200)}`);
  }
}

// =========================================================================
// MAIN
// =========================================================================

async function main(): Promise<void> {
  const seedBalance = await publicClient.getBalance({ address: seedAccount.address });
  console.log(`Seed wallet: ${seedAccount.address}`);
  console.log(`Balance: ${formatEther(seedBalance)} MON`);
  console.log(`GraphQL: ${graphqlUrl}`);

  // Need ~4.6 MON for funding the 6 ephemeral wallets + ~0.5 MON seed-wallet
  // gas overhead = 5.1 MON minimum. Be slightly generous.
  if (seedBalance < parseEther("5.2")) {
    console.error(`Need at least 5.2 MON. Have ${formatEther(seedBalance)}.`);
    console.error(`Top up the seed wallet (${seedAccount.address}) and re-run.`);
    process.exit(1);
  }

  const stake = parseEther("0.005");

  // === Phase A: Make 4 player wallets + 2 bettors ===
  console.log("\n--- Phase A: Ephemeral Wallets ---");
  const players = [
    makePlayer(`SeedAlpha_${Date.now() % 10000}`),
    makePlayer(`SeedBeta_${Date.now() % 10000 + 1}`),
    makePlayer(`SeedGamma_${Date.now() % 10000 + 2}`),
    makePlayer(`SeedDelta_${Date.now() % 10000 + 3}`),
  ];
  const bettors = [
    makePlayer(`SeedBettor1_${Date.now() % 10000 + 4}`),
    makePlayer(`SeedBettor2_${Date.now() % 10000 + 5}`),
  ];

  for (const p of players) {
    await fundPlayer(p, parseEther("1.0"));
    await registerPlayer(p);
    console.log(`  ${p.handle} → ${p.account.address}`);
  }
  for (const b of bettors) {
    await fundPlayer(b, parseEther("0.3"));
    await registerPlayer(b);
    console.log(`  ${b.handle} (bettor) → ${b.account.address}`);
  }

  // === Phases B-E: Run tournaments via GraphQL + on-chain joins + commit/reveal ===
  let tidB: bigint | null = null, tidC: bigint | null = null, tidD: bigint | null = null, tidE: bigint | null = null;

  try { tidB = await runStrategyArena(players, stake); }
  catch (e: unknown) { console.log(`  Phase B failed: ${(e as Error).message?.slice(0, 200)}`); }

  try { tidC = await runOracleDuel(players.slice(0, 2), stake); }
  catch (e: unknown) { console.log(`  Phase C failed: ${(e as Error).message?.slice(0, 200)}`); }

  try { tidD = await runAuctionWars(players.slice(2, 4), stake); }
  catch (e: unknown) { console.log(`  Phase D failed: ${(e as Error).message?.slice(0, 200)}`); }

  try { tidE = await runQuizBowl(players.slice(0, 2), stake); }
  catch (e: unknown) { console.log(`  Phase E failed: ${(e as Error).message?.slice(0, 200)}`); }

  // === Phase F: Spectator bet — needs an IN_PROGRESS match. We create a
  // dedicated 2-person strategy tournament, let the backend create the
  // match (which auto-opens betting), bet BEFORE driving commit/reveal,
  // then drive the match. ===
  try {
    console.log("\n--- Phase F: SpectatorBetting (dedicated match) ---");
    const tidF = await gqlCreateTournament({
      name: `Seed Bet ${Date.now() % 10000}`,
      gameType: "STRATEGY_ARENA", format: "SINGLE_ELIMINATION",
      entryStake: formatEther(stake), maxParticipants: 2, roundCount: 1,
    });
    console.log(`  Bet-tournament ID: ${tidF}`);
    await joinTournament(players[2], tidF, stake);
    console.log(`  ${players[2].handle} joined`);
    await joinTournament(players[3], tidF, stake);
    console.log(`  ${players[3].handle} joined`);
    console.log(`  Waiting for match...`);
    const fmatches = await pollOnChainMatchesForTournament(tidF, 1, 180000);
    const fm = fmatches[0];
    console.log(`  Match #${fm.id} created. Placing bets while match is live...`);
    await runSpectatorBet(bettors, fm.id, fm.player1, fm.player2);
    // Now drive the match
    const p1 = players.find(p => p.account.address.toLowerCase() === fm.player1.toLowerCase());
    const p2 = players.find(p => p.account.address.toLowerCase() === fm.player2.toLowerCase());
    if (p1 && p2) {
      console.log(`  Driving match #${fm.id}...`);
      await driveStrategyMatch(fm.id, p1, p2);
      console.log(`  Waiting for backend resolution + bet settlement...`);
      await pollForMatchCompletion(fm.id, 240000);
      console.log(`  Match completed; bets settled by backend`);
    }
  } catch (e: unknown) {
    console.log(`  Phase F failed: ${(e as Error).message?.slice(0, 200)}`);
  }

  // === Phase G: A2A challenge ===
  await runA2AChallenge(players[0], players[1]);

  // === Phase H: Token buy ===
  await runTokenBuy();

  // === Summary — read live state from chain so the user can verify ===
  console.log("\n========================================");
  console.log("SEED RUN COMPLETE — on-chain verification");
  console.log("========================================");

  // Per-player ELO + match record (proves backend recorded results)
  for (const p of [...players, ...bettors]) {
    try {
      const a = await publicClient.readContract({
        address: coreAddr, abi: ArenaCoreAbi, functionName: "getAgent",
        args: [p.account.address],
      }) as { elo: bigint; matchesPlayed: bigint; wins: bigint; losses: bigint; registered: boolean };
      const registered = a.registered ? "✓" : "✗";
      console.log(`  ${registered} ${p.handle.padEnd(22)} ${p.account.address}  ELO=${a.elo}  W=${a.wins} L=${a.losses} (played ${a.matchesPlayed})`);
    } catch {
      console.log(`  ? ${p.handle.padEnd(22)} ${p.account.address}  (getAgent failed)`);
    }
  }

  // Total on-chain match count + status of last 10 matches
  try {
    const matchCount = await publicClient.readContract({
      address: registryAddr, abi: RegistryAbi, functionName: "matchCounter",
    }) as bigint;
    console.log(`\n  Total on-chain matches: ${matchCount}`);
    const scanFrom = matchCount > 10n ? matchCount - 10n + 1n : 1n;
    console.log(`  Last ${matchCount - scanFrom + 1n} matches:`);
    for (let i = scanFrom; i <= matchCount; i++) {
      const m = await readOnChainMatch(Number(i));
      if (!m) continue;
      const statusName = m.status === 0 ? "Pending" : m.status === 1 ? "InProgress" : "Completed";
      const winner = m.status === 2 ? `winner=${m.winner.slice(0, 10)}…` : "";
      console.log(`    #${m.id.toString().padEnd(3)} t${m.tournamentId} r${m.round}  ${statusName.padEnd(11)} ${winner}`);
    }
  } catch (e: unknown) {
    console.log(`  match summary failed: ${(e as Error).message?.slice(0, 200)}`);
  }

  console.log(`\n  Tournaments produced this run:`);
  console.log(`    StrategyArena: ${tidB ?? "FAILED"}`);
  console.log(`    OracleDuel:    ${tidC ?? "FAILED"}`);
  console.log(`    AuctionWars:   ${tidD ?? "FAILED"}`);
  console.log(`    QuizBowl:      ${tidE ?? "FAILED"}`);

  // Final balance — what the seed wallet has left
  const finalBal = await publicClient.getBalance({ address: seedAccount.address });
  console.log(`\n  Seed wallet remaining: ${formatEther(finalBal)} MON (started ${formatEther(seedBalance)})`);

  console.log("========================================");
  console.log(`Live UI: https://dist-sigma-five-61.vercel.app/`);
  console.log(`GraphQL: ${graphqlUrl}`);
}

main().catch(err => {
  console.error("\nSEED FAILED:", err);
  process.exit(1);
});
