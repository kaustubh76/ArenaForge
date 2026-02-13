/**
 * Frontend contract client — read-only access to ArenaForge contracts.
 * Chain is selected via VITE_CHAIN_ID (10143 = Monad Testnet, 31337 = Anvil).
 * Viem is lazily loaded to keep the main bundle small when running on mock data.
 */
import {
  GameType,
  type Tournament, type AgentProfileExtended, type Match,
  type Season, type SeasonalProfile, type TierReward, type RankTier,
  type Bet, type MatchPool, type BettorProfile,
  type ReplayMetadata, type MatchReplay, type ReplayRound,
} from '@/types/arena';

// Contract addresses from environment
const ARENA_CORE = (import.meta.env.VITE_ARENA_CORE_ADDRESS || '') as `0x${string}`;
const MATCH_REGISTRY = (import.meta.env.VITE_MATCH_REGISTRY_ADDRESS || '') as `0x${string}`;
const ESCROW = (import.meta.env.VITE_ESCROW_ADDRESS || '') as `0x${string}`;

// Game mode contract addresses
const ORACLE_DUEL = (import.meta.env.VITE_ORACLE_DUEL_ADDRESS || '') as `0x${string}`;
const STRATEGY_ARENA = (import.meta.env.VITE_STRATEGY_ARENA_ADDRESS || '') as `0x${string}`;
const AUCTION_WARS = (import.meta.env.VITE_AUCTION_WARS_ADDRESS || '') as `0x${string}`;
const QUIZ_BOWL = (import.meta.env.VITE_QUIZ_BOWL_ADDRESS || '') as `0x${string}`;

// Phase 2 contract addresses
const SEASONAL_RANKINGS = (import.meta.env.VITE_SEASONAL_RANKINGS_ADDRESS || '') as `0x${string}`;
const SPECTATOR_BETTING = (import.meta.env.VITE_SPECTATOR_BETTING_ADDRESS || '') as `0x${string}`;

// =========================================================================
// Lazy viem client — only loaded when chain access is attempted
// =========================================================================

type ViemClient = Awaited<ReturnType<typeof import('viem')['createPublicClient']>>;
type FormatEtherFn = typeof import('viem')['formatEther'];

let _client: ViemClient | null = null;
let _formatEther: FormatEtherFn | null = null;

async function getClient(): Promise<ViemClient> {
  if (_client) return _client;

  const { createPublicClient, http, defineChain, formatEther } = await import('viem');
  _formatEther = formatEther;

  const rpcUrl = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';
  const chainId = Number(import.meta.env.VITE_CHAIN_ID || '31337');
  const isLocal = chainId === 31337;

  const chain = defineChain({
    id: chainId,
    name: isLocal ? 'Localhost (Anvil)' : 'Monad Testnet',
    nativeCurrency: {
      decimals: 18,
      name: isLocal ? 'ETH' : 'MON',
      symbol: isLocal ? 'ETH' : 'MON',
    },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  _client = createPublicClient({
    chain,
    transport: http(),
  });

  return _client;
}

async function ethFormat(value: bigint): Promise<string> {
  if (_formatEther) return _formatEther(value);
  const { formatEther } = await import('viem');
  _formatEther = formatEther;
  return formatEther(value);
}

// =========================================================================
// ABI fragments (read-only, JSON format for proper tuple decoding)
// =========================================================================

const ArenaCoreAbi = [
  { type: 'function', name: 'getTournament', stateMutability: 'view', inputs: [{ name: 'id', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'name', type: 'string' }, { name: 'gameType', type: 'uint8' }, { name: 'format', type: 'uint8' }, { name: 'status', type: 'uint8' }, { name: 'entryStake', type: 'uint256' }, { name: 'maxParticipants', type: 'uint256' }, { name: 'currentParticipants', type: 'uint256' }, { name: 'prizePool', type: 'uint256' }, { name: 'startTime', type: 'uint256' }, { name: 'roundCount', type: 'uint256' }, { name: 'currentRound', type: 'uint256' }, { name: 'parametersHash', type: 'bytes32' }] }] },
  { type: 'function', name: 'getAgent', stateMutability: 'view', inputs: [{ name: 'agent', type: 'address' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'agentAddress', type: 'address' }, { name: 'moltbookHandle', type: 'string' }, { name: 'avatarURI', type: 'string' }, { name: 'elo', type: 'uint256' }, { name: 'matchesPlayed', type: 'uint256' }, { name: 'wins', type: 'uint256' }, { name: 'losses', type: 'uint256' }, { name: 'currentStreak', type: 'int256' }, { name: 'longestWinStreak', type: 'uint256' }, { name: 'registered', type: 'bool' }] }] },
  { type: 'function', name: 'getTournamentParticipants', stateMutability: 'view', inputs: [{ name: 'tournamentId', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'tournamentCounter', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'joinTournament', stateMutability: 'payable', inputs: [{ name: 'tournamentId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'updateAvatar', stateMutability: 'nonpayable', inputs: [{ name: '_avatarURI', type: 'string' }], outputs: [] },
] as const;

const MatchRegistryAbi = [
  { type: 'function', name: 'getMatch', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'tournamentId', type: 'uint256' }, { name: 'round', type: 'uint256' }, { name: 'player1', type: 'address' }, { name: 'player2', type: 'address' }, { name: 'winner', type: 'address' }, { name: 'resultHash', type: 'bytes32' }, { name: 'timestamp', type: 'uint256' }, { name: 'startTime', type: 'uint256' }, { name: 'duration', type: 'uint256' }, { name: 'status', type: 'uint8' }] }] },
  { type: 'function', name: 'getTournamentMatches', stateMutability: 'view', inputs: [{ name: 'tournamentId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256[]' }] },
  { type: 'function', name: 'matchCounter', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

const WagerEscrowAbi = [
  { type: 'function', name: 'tournamentPools', stateMutability: 'view', inputs: [{ name: 'tournamentId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

// Game mode ABIs (write functions)
const StrategyArenaAbi = [
  { type: 'function', name: 'commitMove', stateMutability: 'nonpayable', inputs: [{ name: 'matchId', type: 'uint256' }, { name: 'moveHash', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'revealMove', stateMutability: 'nonpayable', inputs: [{ name: 'matchId', type: 'uint256' }, { name: 'move', type: 'uint8' }, { name: 'salt', type: 'bytes32' }], outputs: [] },
  { type: 'function', name: 'getMatchState', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'player1Score', type: 'uint256' }, { name: 'player2Score', type: 'uint256' }, { name: 'currentRound', type: 'uint256' }, { name: 'totalRounds', type: 'uint256' }] }] },
] as const;

const OracleDuelAbi = [
  { type: 'function', name: 'makePrediction', stateMutability: 'nonpayable', inputs: [{ name: 'matchId', type: 'uint256' }, { name: 'bullish', type: 'bool' }], outputs: [] },
  { type: 'function', name: 'getMatchState', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'tokenSymbol', type: 'string' }, { name: 'snapshotPrice', type: 'uint256' }, { name: 'resolvedPrice', type: 'uint256' }, { name: 'resolved', type: 'bool' }] }] },
] as const;

const AuctionWarsAbi = [
  { type: 'function', name: 'submitBids', stateMutability: 'payable', inputs: [{ name: 'matchId', type: 'uint256' }, { name: 'boxIds', type: 'string[]' }, { name: 'amounts', type: 'uint256[]' }], outputs: [] },
  { type: 'function', name: 'getMatchState', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'totalBoxes', type: 'uint256' }, { name: 'revealed', type: 'bool' }] }] },
] as const;

const QuizBowlAbi = [
  { type: 'function', name: 'submitAnswer', stateMutability: 'nonpayable', inputs: [{ name: 'matchId', type: 'uint256' }, { name: 'questionIndex', type: 'uint256' }, { name: 'answer', type: 'uint8' }], outputs: [] },
  { type: 'function', name: 'getMatchState', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'player1Score', type: 'uint256' }, { name: 'player2Score', type: 'uint256' }, { name: 'currentQuestion', type: 'uint256' }, { name: 'totalQuestions', type: 'uint256' }] }] },
] as const;

// =========================================================================
// Phase 2 ABIs: Seasonal Rankings, Spectator Betting, Replay
// =========================================================================

const SeasonalRankingsAbi = [
  { type: 'function', name: 'getCurrentSeason', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }, { name: 'active', type: 'bool' }, { name: 'rewardsDistributed', type: 'bool' }, { name: 'totalPrizePool', type: 'uint256' }] }] },
  { type: 'function', name: 'getSeason', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'startTime', type: 'uint256' }, { name: 'endTime', type: 'uint256' }, { name: 'active', type: 'bool' }, { name: 'rewardsDistributed', type: 'bool' }, { name: 'totalPrizePool', type: 'uint256' }] }] },
  { type: 'function', name: 'getSeasonalProfile', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }, { name: 'agent', type: 'address' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'agent', type: 'address' }, { name: 'seasonId', type: 'uint256' }, { name: 'seasonalElo', type: 'uint256' }, { name: 'peakElo', type: 'uint256' }, { name: 'matchesPlayed', type: 'uint256' }, { name: 'wins', type: 'uint256' }, { name: 'losses', type: 'uint256' }, { name: 'tier', type: 'uint8' }, { name: 'placementComplete', type: 'bool' }, { name: 'placementMatches', type: 'uint256' }, { name: 'rewardClaimed', type: 'bool' }] }] },
  { type: 'function', name: 'getSeasonLeaderboard', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }, { name: 'limit', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'getSeasonParticipants', stateMutability: 'view', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'tierRewards', stateMutability: 'view', inputs: [{ name: 'tier', type: 'uint8' }], outputs: [{ name: 'tokenAmount', type: 'uint256' }, { name: 'badgeURI', type: 'string' }] },
  { type: 'function', name: 'currentSeasonId', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'isSeasonActive', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'getTimeRemaining', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'claimReward', stateMutability: 'nonpayable', inputs: [{ name: 'seasonId', type: 'uint256' }], outputs: [] },
] as const;

const SpectatorBettingAbi = [
  { type: 'function', name: 'getMatchPool', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'matchId', type: 'uint256' }, { name: 'player1', type: 'address' }, { name: 'player2', type: 'address' }, { name: 'totalPlayer1Bets', type: 'uint256' }, { name: 'totalPlayer2Bets', type: 'uint256' }, { name: 'bettingOpen', type: 'bool' }, { name: 'settled', type: 'bool' }, { name: 'winner', type: 'address' }] }] },
  { type: 'function', name: 'getBet', stateMutability: 'view', inputs: [{ name: 'betId', type: 'uint256' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'matchId', type: 'uint256' }, { name: 'bettor', type: 'address' }, { name: 'predictedWinner', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'odds', type: 'uint256' }, { name: 'timestamp', type: 'uint256' }, { name: 'status', type: 'uint8' }, { name: 'payout', type: 'uint256' }] }] },
  { type: 'function', name: 'getBettorProfile', stateMutability: 'view', inputs: [{ name: 'bettor', type: 'address' }], outputs: [{ name: '', type: 'tuple', components: [{ name: 'bettor', type: 'address' }, { name: 'totalBets', type: 'uint256' }, { name: 'wins', type: 'uint256' }, { name: 'losses', type: 'uint256' }, { name: 'totalWagered', type: 'uint256' }, { name: 'totalWon', type: 'uint256' }, { name: 'totalLost', type: 'uint256' }, { name: 'currentStreak', type: 'int256' }, { name: 'longestWinStreak', type: 'uint256' }] }] },
  { type: 'function', name: 'getBettorBets', stateMutability: 'view', inputs: [{ name: 'bettor', type: 'address' }], outputs: [{ name: '', type: 'uint256[]' }] },
  { type: 'function', name: 'getMatchBets', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256[]' }] },
  { type: 'function', name: 'calculateOdds', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }, { name: 'predictedWinner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'getImpliedOdds', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: 'player1Odds', type: 'uint256' }, { name: 'player2Odds', type: 'uint256' }] },
  { type: 'function', name: 'getTotalPoolSize', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'placeBet', stateMutability: 'payable', inputs: [{ name: 'matchId', type: 'uint256' }, { name: 'predictedWinner', type: 'address' }], outputs: [] },
  { type: 'function', name: 'claimWinnings', stateMutability: 'nonpayable', inputs: [{ name: 'betId', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'betCounter', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const;

// Extended MatchRegistry ABI for replay data
const MatchRegistryReplayAbi = [
  ...MatchRegistryAbi,
  { type: 'function', name: 'getReplayData', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: 'roundStateHashes', type: 'bytes32[]' }, { name: 'roundCount', type: 'uint256' }, { name: 'available', type: 'bool' }] },
  { type: 'function', name: 'isReplayAvailable', stateMutability: 'view', inputs: [{ name: 'matchId', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const;

// =========================================================================
// Converters: chain data → frontend types
// =========================================================================

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

interface ChainTournament {
  id: bigint;
  name: string;
  gameType: number;
  format: number;
  status: number;
  entryStake: bigint;
  maxParticipants: bigint;
  currentParticipants: bigint;
  prizePool: bigint;
  startTime: bigint;
  roundCount: bigint;
  currentRound: bigint;
  parametersHash: string;
}

interface ChainAgent {
  agentAddress: string;
  moltbookHandle: string;
  avatarURI: string;
  elo: bigint;
  matchesPlayed: bigint;
  wins: bigint;
  losses: bigint;
  currentStreak: bigint;
  longestWinStreak: bigint;
  registered: boolean;
}

interface ChainMatch {
  id: bigint;
  tournamentId: bigint;
  round: bigint;
  player1: string;
  player2: string;
  winner: string;
  resultHash: string;
  timestamp: bigint;
  startTime: bigint;
  duration: bigint;
  status: number;
}

// Game state types (exported for use in components)
export interface StrategyArenaState {
  player1Score: number;
  player2Score: number;
  currentRound: number;
  totalRounds: number;
}

export interface OracleDuelState {
  tokenSymbol: string;
  snapshotPrice: string;
  resolvedPrice: string | null;
  resolved: boolean;
}

export interface AuctionWarsState {
  totalBoxes: number;
  revealed: boolean;
}

export interface QuizBowlState {
  player1Score: number;
  player2Score: number;
  currentQuestion: number;
  totalQuestions: number;
}

async function toTournament(raw: ChainTournament): Promise<Tournament> {
  return {
    id: Number(raw.id),
    name: raw.name,
    gameType: raw.gameType,
    format: raw.format,
    status: raw.status,
    entryStake: await ethFormat(raw.entryStake),
    maxParticipants: Number(raw.maxParticipants),
    currentParticipants: Number(raw.currentParticipants),
    prizePool: await ethFormat(raw.prizePool),
    startTime: Number(raw.startTime) * 1000,
    roundCount: Number(raw.roundCount),
    currentRound: Number(raw.currentRound),
    parametersHash: raw.parametersHash,
  };
}

function toAgent(raw: ChainAgent): AgentProfileExtended {
  const wins = Number(raw.wins);
  const matchesPlayed = Number(raw.matchesPlayed);
  return {
    agentAddress: raw.agentAddress,
    moltbookHandle: raw.moltbookHandle,
    avatarUrl: raw.avatarURI || undefined,
    elo: Number(raw.elo),
    matchesPlayed,
    wins,
    losses: Number(raw.losses),
    registered: raw.registered,
    winRate: matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0,
    eloHistory: [1200, Number(raw.elo)],
    recentMatches: [],
    streak: Number(raw.currentStreak),
    longestWinStreak: Number(raw.longestWinStreak),
  };
}

function toMatch(raw: ChainMatch): Match {
  return {
    id: Number(raw.id),
    tournamentId: Number(raw.tournamentId),
    round: Number(raw.round),
    player1: raw.player1,
    player2: raw.player2,
    winner: raw.winner.toLowerCase() === ZERO_ADDRESS.toLowerCase() ? null : raw.winner,
    resultHash: raw.resultHash,
    timestamp: Number(raw.timestamp) * 1000,
    startTime: Number(raw.startTime) * 1000,
    duration: Number(raw.duration),
    status: raw.status,
  };
}

// =========================================================================
// Fetch functions (with rate limiting for testnet RPC: 15 req/sec)
// =========================================================================

const MAX_ITERATIONS = 200;
const RATE_LIMIT_DELAY = 250; // ms between requests to stay under testnet rate limit

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchAllTournaments(): Promise<Tournament[]> {
  if (!ARENA_CORE) throw new Error('VITE_ARENA_CORE_ADDRESS not set');
  const client = await getClient();

  const count = await client.readContract({
    address: ARENA_CORE,
    abi: ArenaCoreAbi,
    functionName: 'tournamentCounter',
  }) as bigint;

  const tournaments: Tournament[] = [];
  for (let i = 1; i <= Math.min(Number(count), MAX_ITERATIONS); i++) {
    await delay(RATE_LIMIT_DELAY);
    const raw = await client.readContract({
      address: ARENA_CORE,
      abi: ArenaCoreAbi,
      functionName: 'getTournament',
      args: [BigInt(i)],
    }) as unknown as ChainTournament;
    tournaments.push(await toTournament(raw));
  }

  return tournaments;
}

export async function fetchMatchesForTournament(tournamentId: number): Promise<Match[]> {
  if (!MATCH_REGISTRY) throw new Error('VITE_MATCH_REGISTRY_ADDRESS not set');
  const client = await getClient();

  const matchIds = await client.readContract({
    address: MATCH_REGISTRY,
    abi: MatchRegistryAbi,
    functionName: 'getTournamentMatches',
    args: [BigInt(tournamentId)],
  }) as bigint[];

  const matches: Match[] = [];
  for (const mid of matchIds.slice(0, MAX_ITERATIONS)) {
    await delay(RATE_LIMIT_DELAY);
    const raw = await client.readContract({
      address: MATCH_REGISTRY,
      abi: MatchRegistryAbi,
      functionName: 'getMatch',
      args: [mid],
    }) as unknown as ChainMatch;
    matches.push(toMatch(raw));
  }

  return matches;
}

export async function fetchTournamentParticipants(tournamentId: number): Promise<string[]> {
  if (!ARENA_CORE) return [];
  const client = await getClient();

  const participants = await client.readContract({
    address: ARENA_CORE,
    abi: ArenaCoreAbi,
    functionName: 'getTournamentParticipants',
    args: [BigInt(tournamentId)],
  }) as string[];

  return participants;
}

export async function fetchAgentsFromTournaments(tournamentIds: number[]): Promise<AgentProfileExtended[]> {
  if (!ARENA_CORE) throw new Error('VITE_ARENA_CORE_ADDRESS not set');
  const client = await getClient();

  const addressSet = new Set<string>();

  for (const tid of tournamentIds) {
    await delay(RATE_LIMIT_DELAY);
    const participants = await client.readContract({
      address: ARENA_CORE,
      abi: ArenaCoreAbi,
      functionName: 'getTournamentParticipants',
      args: [BigInt(tid)],
    }) as string[];
    participants.forEach(a => addressSet.add(a.toLowerCase()));
  }

  const agents: AgentProfileExtended[] = [];
  for (const addr of addressSet) {
    await delay(RATE_LIMIT_DELAY);
    const raw = await client.readContract({
      address: ARENA_CORE,
      abi: ArenaCoreAbi,
      functionName: 'getAgent',
      args: [addr as `0x${string}`],
    }) as unknown as ChainAgent;
    if (raw.registered) {
      agents.push(toAgent(raw));
    }
  }

  return agents;
}

export async function fetchPrizePool(tournamentId: number): Promise<string> {
  if (!ESCROW) return '0';
  const client = await getClient();
  const pool = await client.readContract({
    address: ESCROW,
    abi: WagerEscrowAbi,
    functionName: 'tournamentPools',
    args: [BigInt(tournamentId)],
  }) as bigint;
  return ethFormat(pool);
}

export function isConfigured(): boolean {
  return Boolean(ARENA_CORE && MATCH_REGISTRY);
}

// =========================================================================
// Game-specific state fetch functions
// =========================================================================

export async function fetchStrategyArenaState(matchId: number): Promise<StrategyArenaState | null> {
  if (!STRATEGY_ARENA) return null;
  const client = await getClient();
  try {
    const raw = await client.readContract({
      address: STRATEGY_ARENA,
      abi: StrategyArenaAbi,
      functionName: 'getMatchState',
      args: [BigInt(matchId)],
    }) as { player1Score: bigint; player2Score: bigint; currentRound: bigint; totalRounds: bigint };
    return {
      player1Score: Number(raw.player1Score),
      player2Score: Number(raw.player2Score),
      currentRound: Number(raw.currentRound),
      totalRounds: Number(raw.totalRounds),
    };
  } catch (e) {
    console.warn('[contracts] fetchStrategyArenaState failed:', e);
    return null;
  }
}

export async function fetchOracleDuelState(matchId: number): Promise<OracleDuelState | null> {
  if (!ORACLE_DUEL) return null;
  const client = await getClient();
  try {
    const raw = await client.readContract({
      address: ORACLE_DUEL,
      abi: OracleDuelAbi,
      functionName: 'getMatchState',
      args: [BigInt(matchId)],
    }) as { tokenSymbol: string; snapshotPrice: bigint; resolvedPrice: bigint; resolved: boolean };
    return {
      tokenSymbol: raw.tokenSymbol,
      snapshotPrice: await ethFormat(raw.snapshotPrice),
      resolvedPrice: raw.resolved ? await ethFormat(raw.resolvedPrice) : null,
      resolved: raw.resolved,
    };
  } catch (e) {
    console.warn('[contracts] fetchOracleDuelState failed:', e);
    return null;
  }
}

export async function fetchAuctionWarsState(matchId: number): Promise<AuctionWarsState | null> {
  if (!AUCTION_WARS) return null;
  const client = await getClient();
  try {
    const raw = await client.readContract({
      address: AUCTION_WARS,
      abi: AuctionWarsAbi,
      functionName: 'getMatchState',
      args: [BigInt(matchId)],
    }) as { totalBoxes: bigint; revealed: boolean };
    return {
      totalBoxes: Number(raw.totalBoxes),
      revealed: raw.revealed,
    };
  } catch (e) {
    console.warn('[contracts] fetchAuctionWarsState failed:', e);
    return null;
  }
}

export async function fetchQuizBowlState(matchId: number): Promise<QuizBowlState | null> {
  if (!QUIZ_BOWL) return null;
  const client = await getClient();
  try {
    const raw = await client.readContract({
      address: QUIZ_BOWL,
      abi: QuizBowlAbi,
      functionName: 'getMatchState',
      args: [BigInt(matchId)],
    }) as { player1Score: bigint; player2Score: bigint; currentQuestion: bigint; totalQuestions: bigint };
    return {
      player1Score: Number(raw.player1Score),
      player2Score: Number(raw.player2Score),
      currentQuestion: Number(raw.currentQuestion),
      totalQuestions: Number(raw.totalQuestions),
    };
  } catch (e) {
    console.warn('[contracts] fetchQuizBowlState failed:', e);
    return null;
  }
}

// Export contract addresses and ABIs for game action submissions
export const GameContracts = {
  strategyArena: { address: STRATEGY_ARENA, abi: StrategyArenaAbi },
  oracleDuel: { address: ORACLE_DUEL, abi: OracleDuelAbi },
  auctionWars: { address: AUCTION_WARS, abi: AuctionWarsAbi },
  quizBowl: { address: QUIZ_BOWL, abi: QuizBowlAbi },
} as const;

// Export ArenaCore for tournament join operations
export const ArenaCore = {
  address: ARENA_CORE,
  abi: ArenaCoreAbi,
} as const;

// Export the getClient function for write operations
export { getClient };

// =========================================================================
// Evolution data fetching from ParametersEvolved events
// =========================================================================

import type { EvolutionRecord, Mutation, EvolutionMetrics } from '@/types/arena';

const ParametersEvolvedEvent = {
  type: 'event',
  name: 'ParametersEvolved',
  inputs: [
    { name: 'tournamentId', type: 'uint256', indexed: true },
    { name: 'newParamsHash', type: 'bytes32', indexed: false },
  ],
} as const;

export async function fetchEvolutionRecords(
  fromBlock: bigint = BigInt(0),
  toBlock?: bigint
): Promise<EvolutionRecord[]> {
  if (!ARENA_CORE) return [];

  const client = await getClient();

  try {
    const logs = await client.getLogs({
      address: ARENA_CORE,
      event: ParametersEvolvedEvent,
      fromBlock,
      toBlock: toBlock || 'latest',
    });

    const records: EvolutionRecord[] = [];
    let prevHash = '0x0';

    for (const log of logs) {
      const tournamentId = Number(log.args.tournamentId);
      const newParamsHash = log.args.newParamsHash as string;

      // Create a basic evolution record from the event
      // Note: Full mutation details would require indexer or off-chain storage
      const record: EvolutionRecord = {
        tournamentId,
        round: records.filter(r => r.tournamentId === tournamentId).length + 1,
        previousParamsHash: prevHash,
        newParamsHash,
        mutations: generateMockMutations(newParamsHash),
        metrics: generateMockMetrics(),
        timestamp: log.blockNumber ? Number(log.blockNumber) * 1000 : Date.now(),
      };

      records.push(record);
      prevHash = newParamsHash;
    }

    return records;
  } catch (e) {
    console.warn('[contracts] fetchEvolutionRecords failed:', e);
    return [];
  }
}

// Generate placeholder mutations based on hash (real data would come from indexer)
function generateMockMutations(hash: string): Mutation[] {
  const mutations: Mutation[] = [];
  const hashNum = parseInt(hash.slice(2, 6), 16);

  if (hashNum % 3 === 0) {
    mutations.push({
      type: 'scale',
      factor: 1.15,
      strategy: 'strategyDefectCooperate',
      reason: 'Adjusted defection payoff based on player behavior',
    });
  }
  if (hashNum % 5 === 0) {
    mutations.push({
      type: 'increment',
      increment: 2,
      strategy: 'strategyRoundCount',
      reason: 'Increased round count for longer matches',
    });
  }
  if (mutations.length === 0) {
    mutations.push({
      type: 'scale',
      factor: 1.1,
      strategy: 'strategyCooperateCooperate',
      reason: 'Minor cooperation incentive adjustment',
    });
  }

  return mutations;
}

// Generate placeholder metrics (real data would come from indexer)
function generateMockMetrics(): EvolutionMetrics {
  return {
    averageStakeBehavior: 'moderate',
    dominantStrategy: 'mixed',
    strategyDistribution: { mixed: 4, tit_for_tat: 2, always_defect: 1 },
    averageMatchDuration: 45,
    drawRate: 0.15,
  };
}

// =========================================================================
// Phase 2: Seasonal Rankings Functions
// =========================================================================

interface ChainSeason {
  id: bigint;
  startTime: bigint;
  endTime: bigint;
  active: boolean;
  rewardsDistributed: boolean;
  totalPrizePool: bigint;
}

interface ChainSeasonalProfile {
  agent: string;
  seasonId: bigint;
  seasonalElo: bigint;
  peakElo: bigint;
  matchesPlayed: bigint;
  wins: bigint;
  losses: bigint;
  tier: number;
  placementComplete: boolean;
  placementMatches: bigint;
  rewardClaimed: boolean;
}

async function toSeason(raw: ChainSeason): Promise<Season> {
  return {
    id: Number(raw.id),
    startTime: Number(raw.startTime) * 1000,
    endTime: Number(raw.endTime) * 1000,
    active: raw.active,
    rewardsDistributed: raw.rewardsDistributed,
    totalPrizePool: await ethFormat(raw.totalPrizePool),
  };
}

function toSeasonalProfile(raw: ChainSeasonalProfile): SeasonalProfile {
  return {
    address: raw.agent,
    seasonalElo: Number(raw.seasonalElo),
    peakElo: Number(raw.peakElo),
    matchesPlayed: Number(raw.matchesPlayed),
    wins: Number(raw.wins),
    losses: Number(raw.losses),
    tier: raw.tier as RankTier,
    placementMatches: Number(raw.placementMatches),
    placementComplete: raw.placementComplete,
    rewardClaimed: raw.rewardClaimed,
  };
}

export async function fetchCurrentSeason(): Promise<Season | null> {
  if (!SEASONAL_RANKINGS) return null;
  const client = await getClient();

  try {
    const raw = await client.readContract({
      address: SEASONAL_RANKINGS,
      abi: SeasonalRankingsAbi,
      functionName: 'getCurrentSeason',
    }) as unknown as ChainSeason;

    if (Number(raw.id) === 0) return null;
    return toSeason(raw);
  } catch (e) {
    console.warn('[contracts] fetchCurrentSeason failed:', e);
    return null;
  }
}

export async function fetchSeasonalProfile(
  seasonId: number,
  address: string
): Promise<SeasonalProfile | null> {
  if (!SEASONAL_RANKINGS) return null;
  const client = await getClient();

  try {
    const raw = await client.readContract({
      address: SEASONAL_RANKINGS,
      abi: SeasonalRankingsAbi,
      functionName: 'getSeasonalProfile',
      args: [BigInt(seasonId), address as `0x${string}`],
    }) as unknown as ChainSeasonalProfile;

    if (raw.agent === ZERO_ADDRESS) return null;
    return toSeasonalProfile(raw);
  } catch (e) {
    console.warn('[contracts] fetchSeasonalProfile failed:', e);
    return null;
  }
}

export async function fetchSeasonLeaderboard(
  seasonId: number,
  limit: number = 100
): Promise<SeasonalProfile[]> {
  if (!SEASONAL_RANKINGS) return [];
  const client = await getClient();

  try {
    const addresses = await client.readContract({
      address: SEASONAL_RANKINGS,
      abi: SeasonalRankingsAbi,
      functionName: 'getSeasonLeaderboard',
      args: [BigInt(seasonId), BigInt(limit)],
    }) as string[];

    const profiles: SeasonalProfile[] = [];
    for (const addr of addresses) {
      await delay(RATE_LIMIT_DELAY);
      const profile = await fetchSeasonalProfile(seasonId, addr);
      if (profile) profiles.push(profile);
    }

    return profiles;
  } catch (e) {
    console.warn('[contracts] fetchSeasonLeaderboard failed:', e);
    return [];
  }
}

export async function fetchTierRewards(): Promise<TierReward[]> {
  if (!SEASONAL_RANKINGS) return [];
  const client = await getClient();

  const rewards: TierReward[] = [];
  try {
    for (let tier = 0; tier <= 5; tier++) {
      await delay(RATE_LIMIT_DELAY);
      const raw = await client.readContract({
        address: SEASONAL_RANKINGS,
        abi: SeasonalRankingsAbi,
        functionName: 'tierRewards',
        args: [tier],
      }) as unknown as readonly [bigint, string];

      rewards.push({
        tier: tier as RankTier,
        tokenAmount: await ethFormat(raw[0]),
        badgeURI: raw[1],
      });
    }
    return rewards;
  } catch (e) {
    console.warn('[contracts] fetchTierRewards failed:', e);
    return [];
  }
}

// Helper to get wallet client for write operations
async function getWalletClient() {
  if (typeof window !== 'undefined' && window.ethereum) {
    const { createWalletClient, custom, defineChain } = await import('viem');
    const rpcUrl = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';
    const chainId = Number(import.meta.env.VITE_CHAIN_ID || '31337');
    const isLocal = chainId === 31337;

    const chain = defineChain({
      id: chainId,
      name: isLocal ? 'Localhost (Anvil)' : 'Monad Testnet',
      nativeCurrency: {
        decimals: 18,
        name: isLocal ? 'ETH' : 'MON',
        symbol: isLocal ? 'ETH' : 'MON',
      },
      rpcUrls: { default: { http: [rpcUrl] } },
    });

    const walletClient = createWalletClient({
      chain,
      transport: custom(window.ethereum),
    });

    const [account] = await walletClient.getAddresses();
    if (!account) throw new Error('No wallet connected');

    return { walletClient, account };
  }
  throw new Error('No wallet provider found. Please connect your wallet.');
}

// Extend window type for ethereum provider
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

export async function claimSeasonReward(seasonId: number): Promise<boolean> {
  if (!SEASONAL_RANKINGS) {
    console.warn('[contracts] Seasonal rankings contract not configured');
    return false;
  }

  try {
    const { walletClient, account } = await getWalletClient();

    const hash = await walletClient.writeContract({
      address: SEASONAL_RANKINGS,
      abi: SeasonalRankingsAbi,
      functionName: 'claimReward',
      args: [BigInt(seasonId)],
      account,
    });

    console.log(`[contracts] Season reward claimed, tx: ${hash}`);
    return true;
  } catch (e) {
    console.error('[contracts] claimSeasonReward failed:', e);
    return false;
  }
}

// =========================================================================
// Phase 2: Spectator Betting Functions
// =========================================================================

interface ChainMatchPool {
  matchId: bigint;
  player1: string;
  player2: string;
  totalPlayer1Bets: bigint;
  totalPlayer2Bets: bigint;
  bettingOpen: boolean;
  settled: boolean;
  winner: string;
}

interface ChainBet {
  id: bigint;
  matchId: bigint;
  bettor: string;
  predictedWinner: string;
  amount: bigint;
  odds: bigint;
  timestamp: bigint;
  status: number;
  payout: bigint;
}

interface ChainBettorProfile {
  bettor: string;
  totalBets: bigint;
  wins: bigint;
  losses: bigint;
  totalWagered: bigint;
  totalWon: bigint;
  totalLost: bigint;
  currentStreak: bigint;
  longestWinStreak: bigint;
}

const ODDS_PRECISION = 1e18;

async function toMatchPool(raw: ChainMatchPool): Promise<MatchPool> {
  return {
    matchId: Number(raw.matchId),
    player1: raw.player1,
    player2: raw.player2,
    totalPlayer1Bets: await ethFormat(raw.totalPlayer1Bets),
    totalPlayer2Bets: await ethFormat(raw.totalPlayer2Bets),
    bettingOpen: raw.bettingOpen,
    settled: raw.settled,
  };
}

async function toBet(raw: ChainBet): Promise<Bet> {
  return {
    id: Number(raw.id),
    matchId: Number(raw.matchId),
    bettor: raw.bettor,
    predictedWinner: raw.predictedWinner,
    amount: await ethFormat(raw.amount),
    odds: (Number(raw.odds) / ODDS_PRECISION).toFixed(4),
    status: raw.status,
    payout: await ethFormat(raw.payout),
    timestamp: Number(raw.timestamp) * 1000,
  };
}

async function toBettorProfile(raw: ChainBettorProfile): Promise<BettorProfile> {
  const totalWagered = await ethFormat(raw.totalWagered);
  const totalWon = await ethFormat(raw.totalWon);
  const totalLost = await ethFormat(raw.totalLost);
  const wins = Number(raw.wins);
  const totalBets = Number(raw.totalBets);

  return {
    address: raw.bettor,
    totalBets,
    wins,
    losses: Number(raw.losses),
    totalWagered,
    totalWon,
    netProfit: (parseFloat(totalWon) - parseFloat(totalLost)).toFixed(6),
    currentStreak: Number(raw.currentStreak),
    longestWinStreak: Number(raw.longestWinStreak),
    winRate: totalBets > 0 ? (wins / totalBets) * 100 : 0,
  };
}

export async function fetchMatchPool(matchId: number): Promise<MatchPool | null> {
  if (!SPECTATOR_BETTING) return null;
  const client = await getClient();

  try {
    const raw = await client.readContract({
      address: SPECTATOR_BETTING,
      abi: SpectatorBettingAbi,
      functionName: 'getMatchPool',
      args: [BigInt(matchId)],
    }) as unknown as ChainMatchPool;

    if (Number(raw.matchId) === 0) return null;
    return toMatchPool(raw);
  } catch (e) {
    console.warn('[contracts] fetchMatchPool failed:', e);
    return null;
  }
}

export async function fetchUserBets(address: string): Promise<Bet[]> {
  if (!SPECTATOR_BETTING) return [];
  const client = await getClient();

  try {
    const betIds = await client.readContract({
      address: SPECTATOR_BETTING,
      abi: SpectatorBettingAbi,
      functionName: 'getBettorBets',
      args: [address as `0x${string}`],
    }) as bigint[];

    const bets: Bet[] = [];
    for (const betId of betIds.slice(0, MAX_ITERATIONS)) {
      await delay(RATE_LIMIT_DELAY);
      const raw = await client.readContract({
        address: SPECTATOR_BETTING,
        abi: SpectatorBettingAbi,
        functionName: 'getBet',
        args: [betId],
      }) as unknown as ChainBet;
      bets.push(await toBet(raw));
    }

    return bets;
  } catch (e) {
    console.warn('[contracts] fetchUserBets failed:', e);
    return [];
  }
}

export async function fetchBettorProfile(address: string): Promise<BettorProfile | null> {
  if (!SPECTATOR_BETTING) return null;
  const client = await getClient();

  try {
    const raw = await client.readContract({
      address: SPECTATOR_BETTING,
      abi: SpectatorBettingAbi,
      functionName: 'getBettorProfile',
      args: [address as `0x${string}`],
    }) as unknown as ChainBettorProfile;

    if (raw.bettor === ZERO_ADDRESS) return null;
    return toBettorProfile(raw);
  } catch (e) {
    console.warn('[contracts] fetchBettorProfile failed:', e);
    return null;
  }
}

export async function fetchTopBettors(limit: number = 50): Promise<BettorProfile[]> {
  if (!SPECTATOR_BETTING) return [];
  const client = await getClient();

  try {
    // Get total bet count to know how many bets exist
    const betCount = await client.readContract({
      address: SPECTATOR_BETTING,
      abi: SpectatorBettingAbi,
      functionName: 'betCounter',
    }) as bigint;

    if (betCount === BigInt(0)) return [];

    // Collect unique bettors from recent bets
    const seenBettors = new Set<string>();
    const profiles: BettorProfile[] = [];

    // Scan recent bets (up to 200) to find unique bettors
    const scanLimit = Math.min(Number(betCount), 200);
    for (let i = Number(betCount); i > 0 && seenBettors.size < limit * 2; i--) {
      await delay(RATE_LIMIT_DELAY);
      try {
        const bet = await client.readContract({
          address: SPECTATOR_BETTING,
          abi: SpectatorBettingAbi,
          functionName: 'getBet',
          args: [BigInt(i)],
        }) as unknown as ChainBet;

        if (bet.bettor !== ZERO_ADDRESS && !seenBettors.has(bet.bettor)) {
          seenBettors.add(bet.bettor);
        }
      } catch {
        // Skip invalid bet IDs
      }

      if (Number(betCount) - i >= scanLimit) break;
    }

    // Fetch profiles for discovered bettors
    for (const bettor of seenBettors) {
      if (profiles.length >= limit) break;
      await delay(RATE_LIMIT_DELAY);
      const profile = await fetchBettorProfile(bettor);
      if (profile && profile.totalBets > 0) {
        profiles.push(profile);
      }
    }

    // Sort by net profit (descending)
    profiles.sort((a, b) => parseFloat(b.netProfit) - parseFloat(a.netProfit));

    return profiles.slice(0, limit);
  } catch (e) {
    console.warn('[contracts] fetchTopBettors failed:', e);
    return [];
  }
}

export async function calculateOdds(matchId: number, prediction: string): Promise<string> {
  if (!SPECTATOR_BETTING) return '1.0';
  const client = await getClient();

  try {
    const odds = await client.readContract({
      address: SPECTATOR_BETTING,
      abi: SpectatorBettingAbi,
      functionName: 'calculateOdds',
      args: [BigInt(matchId), prediction as `0x${string}`],
    }) as bigint;

    return (Number(odds) / ODDS_PRECISION).toFixed(4);
  } catch (e) {
    console.warn('[contracts] calculateOdds failed:', e);
    return '1.0';
  }
}

export async function placeBet(
  matchId: number,
  predictedWinner: string,
  amount: string
): Promise<boolean> {
  if (!SPECTATOR_BETTING) {
    console.warn('[contracts] Spectator betting contract not configured');
    return false;
  }

  try {
    const { walletClient, account } = await getWalletClient();
    const { parseEther } = await import('viem');

    const hash = await walletClient.writeContract({
      address: SPECTATOR_BETTING,
      abi: SpectatorBettingAbi,
      functionName: 'placeBet',
      args: [BigInt(matchId), predictedWinner as `0x${string}`],
      value: parseEther(amount),
      account,
    });

    console.log(`[contracts] Bet placed for match ${matchId}, tx: ${hash}`);
    return true;
  } catch (e) {
    console.error('[contracts] placeBet failed:', e);
    return false;
  }
}

export async function claimBetWinnings(betId: number): Promise<boolean> {
  if (!SPECTATOR_BETTING) {
    console.warn('[contracts] Spectator betting contract not configured');
    return false;
  }

  try {
    const { walletClient, account } = await getWalletClient();

    const hash = await walletClient.writeContract({
      address: SPECTATOR_BETTING,
      abi: SpectatorBettingAbi,
      functionName: 'claimWinnings',
      args: [BigInt(betId)],
      account,
    });

    console.log(`[contracts] Bet winnings claimed for bet ${betId}, tx: ${hash}`);
    return true;
  } catch (e) {
    console.error('[contracts] claimBetWinnings failed:', e);
    return false;
  }
}

// =========================================================================
// Phase 2: Match Replay Functions
// =========================================================================

export async function fetchReplayMetadata(matchId: number): Promise<ReplayMetadata | null> {
  if (!MATCH_REGISTRY) return null;
  const client = await getClient();

  try {
    const raw = await client.readContract({
      address: MATCH_REGISTRY,
      abi: MatchRegistryReplayAbi,
      functionName: 'getReplayData',
      args: [BigInt(matchId)],
    }) as unknown as readonly [readonly `0x${string}`[], bigint, boolean];

    return {
      matchId,
      roundStateHashes: raw[0] as string[],
      roundCount: Number(raw[1]),
      available: raw[2],
    };
  } catch (e) {
    console.warn('[contracts] fetchReplayMetadata failed:', e);
    return null;
  }
}

export async function fetchReplayData(matchId: number): Promise<MatchReplay | null> {
  // Try GraphQL API first (has full round data from SQLite)
  try {
    const response = await fetch(
      import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query MatchReplay($matchId: Int!) {
            matchReplay(matchId: $matchId) {
              matchId
              gameType
              player1
              player2
              winner
              totalDuration
              rawStats
              rounds {
                roundNumber
                player1Action
                player2Action
                player1Score
                player2Score
                timestamp
                stateHash
              }
              metadata {
                matchId
                roundCount
                available
                roundHashes
              }
            }
          }`,
          variables: { matchId },
        }),
      }
    );

    const json = await response.json();
    const replay = json?.data?.matchReplay;

    if (replay && replay.rounds.length > 0) {
      const gameTypeMap: Record<string, GameType> = {
        ORACLE_DUEL: GameType.OracleDuel,
        STRATEGY_ARENA: GameType.StrategyArena,
        AUCTION_WARS: GameType.AuctionWars,
        QUIZ_BOWL: GameType.QuizBowl,
      };

      return {
        matchId: replay.matchId,
        gameType: gameTypeMap[replay.gameType] ?? GameType.OracleDuel,
        player1: replay.player1,
        player2: replay.player2,
        winner: replay.winner,
        rounds: replay.rounds.map((r: { roundNumber: number; player1Action: string | null; player2Action: string | null; player1Score: number; player2Score: number; timestamp: number; stateHash: string }) => ({
          roundNumber: r.roundNumber,
          player1Action: r.player1Action ? tryParseJSON(r.player1Action) : null,
          player2Action: r.player2Action ? tryParseJSON(r.player2Action) : null,
          player1Score: r.player1Score,
          player2Score: r.player2Score,
          timestamp: r.timestamp,
          stateHash: r.stateHash,
        })),
        totalDuration: replay.totalDuration,
        metadata: replay.metadata ? {
          matchId: replay.metadata.matchId,
          roundStateHashes: replay.metadata.roundHashes,
          roundCount: replay.metadata.roundCount,
          available: replay.metadata.available,
        } : { matchId, roundStateHashes: [], roundCount: replay.rounds.length, available: true },
      };
    }
  } catch (e) {
    console.warn('[contracts] GraphQL matchReplay failed, falling back to on-chain:', e);
  }

  // Fallback to on-chain data
  if (!MATCH_REGISTRY) return null;
  const client = await getClient();

  try {
    const matchRaw = await client.readContract({
      address: MATCH_REGISTRY,
      abi: MatchRegistryAbi,
      functionName: 'getMatch',
      args: [BigInt(matchId)],
    }) as unknown as ChainMatch;

    const metadata = await fetchReplayMetadata(matchId);
    if (!metadata || !metadata.available) return null;

    const rounds: ReplayRound[] = metadata.roundStateHashes.map((hash, index) => ({
      roundNumber: index + 1,
      player1Action: null,
      player2Action: null,
      player1Score: 0,
      player2Score: 0,
      timestamp: 0,
      stateHash: hash,
    }));

    const match = toMatch(matchRaw);

    return {
      matchId,
      gameType: 0 as GameType,
      player1: match.player1,
      player2: match.player2,
      winner: match.winner,
      rounds,
      totalDuration: match.duration ?? 0,
      metadata,
    };
  } catch (e) {
    console.warn('[contracts] fetchReplayData on-chain fallback failed:', e);
    return null;
  }
}

function tryParseJSON(value: string): unknown {
  try { return JSON.parse(value); }
  catch { return value; }
}

// Export Phase 2 contract references
export const SeasonalRankingsContract = {
  address: SEASONAL_RANKINGS,
  abi: SeasonalRankingsAbi,
} as const;

export const SpectatorBettingContract = {
  address: SPECTATOR_BETTING,
  abi: SpectatorBettingAbi,
} as const;
