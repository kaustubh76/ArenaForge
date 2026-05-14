import { getContract, type Abi, type Hash } from "viem";
import { publicClient, walletClient } from "./rpc";
import { getLogger } from "../utils/logger";
import { requireAddress, optionalAddress } from "../utils/env";

const log = getLogger("ContractClient");

/** Wait for tx receipt and throw if it failed */
async function confirmTx(hash: Hash, label?: string): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Transaction failed${label ? ` (${label})` : ""}: ${hash}`);
  }
}

// ABI fragments for the contracts we interact with (JSON format for proper tuple support)
const ArenaCoreAbi: Abi = [
  { type: "function", name: "registerAgent", stateMutability: "nonpayable", inputs: [{ name: "moltbookHandle", type: "string" }], outputs: [] },
  { type: "function", name: "createTournament", stateMutability: "nonpayable", inputs: [{ name: "name", type: "string" }, { name: "gameType", type: "uint8" }, { name: "format", type: "uint8" }, { name: "entryStake", type: "uint256" }, { name: "maxParticipants", type: "uint256" }, { name: "roundCount", type: "uint256" }, { name: "parametersHash", type: "bytes32" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "joinTournament", stateMutability: "payable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "startTournament", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "completeTournament", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "winner", type: "address" }], outputs: [] },
  { type: "function", name: "cancelTournament", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "advanceRound", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [] },
  { type: "function", name: "evolveParameters", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "newParametersHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "updateElo", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "newElo", type: "uint256" }, { name: "won", type: "bool" }], outputs: [] },
  { type: "function", name: "registerGameMode", stateMutability: "nonpayable", inputs: [{ name: "gameTypeId", type: "uint256" }, { name: "contractAddress", type: "address" }], outputs: [] },
  { type: "function", name: "getTournament", stateMutability: "view", inputs: [{ name: "id", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "name", type: "string" }, { name: "gameType", type: "uint8" }, { name: "format", type: "uint8" }, { name: "status", type: "uint8" }, { name: "entryStake", type: "uint256" }, { name: "maxParticipants", type: "uint256" }, { name: "currentParticipants", type: "uint256" }, { name: "prizePool", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "roundCount", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "parametersHash", type: "bytes32" }] }] },
  { type: "function", name: "getAgent", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "agentAddress", type: "address" }, { name: "moltbookHandle", type: "string" }, { name: "avatarURI", type: "string" }, { name: "elo", type: "uint256" }, { name: "matchesPlayed", type: "uint256" }, { name: "wins", type: "uint256" }, { name: "losses", type: "uint256" }, { name: "currentStreak", type: "int256" }, { name: "longestWinStreak", type: "uint256" }, { name: "registered", type: "bool" }] }] },
  { type: "function", name: "getTournamentParticipants", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [{ name: "", type: "address[]" }] },
  { type: "function", name: "isParticipant", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "tournamentCounter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "event", name: "TournamentCreated", inputs: [{ name: "id", type: "uint256", indexed: true }, { name: "gameType", type: "uint8", indexed: false }, { name: "entryStake", type: "uint256", indexed: false }] },
  { type: "event", name: "AgentRegistered", inputs: [{ name: "agent", type: "address", indexed: true }, { name: "moltbookHandle", type: "string", indexed: false }] },
  { type: "event", name: "AgentJoinedTournament", inputs: [{ name: "tournamentId", type: "uint256", indexed: true }, { name: "agent", type: "address", indexed: true }] },
  { type: "event", name: "TournamentStarted", inputs: [{ name: "tournamentId", type: "uint256", indexed: true }] },
  { type: "event", name: "TournamentCompleted", inputs: [{ name: "tournamentId", type: "uint256", indexed: true }, { name: "winner", type: "address", indexed: false }] },
  { type: "event", name: "ParametersEvolved", inputs: [{ name: "tournamentId", type: "uint256", indexed: true }, { name: "newParamsHash", type: "bytes32", indexed: false }] },
];

const WagerEscrowAbi: Abi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent", type: "address" }], outputs: [] },
  { type: "function", name: "lockForMatch", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent1", type: "address" }, { name: "agent2", type: "address" }], outputs: [] },
  { type: "function", name: "distributePrize", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "winner", type: "address" }, { name: "prizeAmount", type: "uint256" }], outputs: [] },
  { type: "function", name: "batchDistribute", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "recipients", type: "address[]" }, { name: "amounts", type: "uint256[]" }], outputs: [] },
  { type: "function", name: "refund", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent", type: "address" }], outputs: [] },
  { type: "function", name: "getEscrow", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "agent", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "tournamentId", type: "uint256" }, { name: "agent", type: "address" }, { name: "amount", type: "uint256" }, { name: "status", type: "uint8" }] }] },
  { type: "function", name: "tournamentPools", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
];

const MatchRegistryAbi: Abi = [
  { type: "function", name: "createMatch", stateMutability: "nonpayable", inputs: [{ name: "tournamentId", type: "uint256" }, { name: "round", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "startMatch", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }], outputs: [] },
  { type: "function", name: "recordResult", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "winner", type: "address" }, { name: "resultHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "getMatch", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "tournamentId", type: "uint256" }, { name: "round", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "winner", type: "address" }, { name: "resultHash", type: "bytes32" }, { name: "timestamp", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "duration", type: "uint256" }, { name: "status", type: "uint8" }] }] },
  { type: "function", name: "getTournamentMatches", stateMutability: "view", inputs: [{ name: "tournamentId", type: "uint256" }], outputs: [{ name: "", type: "uint256[]" }] },
  { type: "function", name: "getAgentMatches", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "uint256[]" }] },
  { type: "function", name: "matchCounter", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "event", name: "MatchCreated", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "tournamentId", type: "uint256", indexed: true }, { name: "player1", type: "address", indexed: false }, { name: "player2", type: "address", indexed: false }] },
  { type: "event", name: "MatchStarted", inputs: [{ name: "matchId", type: "uint256", indexed: true }] },
  { type: "event", name: "MatchCompleted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "winner", type: "address", indexed: false }] },
];

const OracleDuelAbi: Abi = [
  { type: "function", name: "initDuel", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "tokenAddress", type: "address" }, { name: "snapshotPrice", type: "uint256" }, { name: "durationSeconds", type: "uint256" }, { name: "bullPlayer", type: "address" }, { name: "bearPlayer", type: "address" }], outputs: [] },
  { type: "function", name: "resolveDuel", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "currentPrice", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "getDuel", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "matchId", type: "uint256" }, { name: "tokenAddress", type: "address" }, { name: "snapshotPrice", type: "uint256" }, { name: "resolutionTime", type: "uint256" }, { name: "bullPlayer", type: "address" }, { name: "bearPlayer", type: "address" }, { name: "resolvedPrice", type: "uint256" }, { name: "resolved", type: "bool" }] }] },
];

const StrategyArenaAbi: Abi = [
  { type: "function", name: "initMatch", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "totalRounds", type: "uint256" }, { name: "commitTimeout", type: "uint256" }, { name: "revealTimeout", type: "uint256" }], outputs: [] },
  { type: "function", name: "resolveRound", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }], outputs: [] },
  { type: "function", name: "advanceRound", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "commitTimeout", type: "uint256" }, { name: "revealTimeout", type: "uint256" }], outputs: [] },
  { type: "function", name: "forfeitRound", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "forfeiter", type: "address" }], outputs: [] },
  { type: "function", name: "getMatchState", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "totalRounds", type: "uint256" }, { name: "currentRound", type: "uint256" }, { name: "player1Score", type: "uint256" }, { name: "player2Score", type: "uint256" }, { name: "commitDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" }, { name: "initialized", type: "bool" }] }] },
  { type: "function", name: "getRound", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }, { name: "roundNum", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "player1Commitment", type: "bytes32" }, { name: "player2Commitment", type: "bytes32" }, { name: "player1Move", type: "uint8" }, { name: "player2Move", type: "uint8" }, { name: "player1Revealed", type: "bool" }, { name: "player2Revealed", type: "bool" }, { name: "resolved", type: "bool" }] }] },
  { type: "event", name: "MoveCommitted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }] },
  { type: "event", name: "MoveRevealed", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }, { name: "move", type: "uint8", indexed: false }] },
];

const AuctionWarsAbi: Abi = [
  { type: "function", name: "initMatch", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "players", type: "address[]" }, { name: "totalRounds", type: "uint256" }], outputs: [] },
  { type: "function", name: "startAuctionRound", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "mysteryBoxHash", type: "bytes32" }, { name: "biddingDuration", type: "uint256" }, { name: "revealDuration", type: "uint256" }], outputs: [] },
  { type: "function", name: "commitBid", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "roundNum", type: "uint256" }, { name: "bidHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "revealBid", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "roundNum", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "salt", type: "bytes32" }], outputs: [] },
  { type: "function", name: "resolveAuction", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "roundNum", type: "uint256" }, { name: "actualValue", type: "uint256" }], outputs: [] },
  { type: "function", name: "getScore", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }, { name: "player", type: "address" }], outputs: [{ name: "", type: "int256" }] },
  { type: "function", name: "getPlayers", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "address[]" }] },
  { type: "function", name: "getCurrentRound", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  // Auto-generated public getters from the public mappings.
  { type: "function", name: "auctionRounds", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }, { name: "roundNum", type: "uint256" }], outputs: [{ name: "mysteryBoxHash", type: "bytes32" }, { name: "biddingDeadline", type: "uint256" }, { name: "revealDeadline", type: "uint256" }, { name: "actualValue", type: "uint256" }, { name: "winner", type: "address" }, { name: "winningBid", type: "uint256" }, { name: "resolved", type: "bool" }] },
  { type: "function", name: "bids", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }, { name: "roundNum", type: "uint256" }, { name: "player", type: "address" }], outputs: [{ name: "agent", type: "address" }, { name: "bidHash", type: "bytes32" }, { name: "revealedAmount", type: "uint256" }, { name: "committed", type: "bool" }, { name: "revealed", type: "bool" }] },
  { type: "event", name: "BidCommitted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "agent", type: "address", indexed: false }] },
  { type: "event", name: "BidRevealed", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "agent", type: "address", indexed: false }, { name: "amount", type: "uint256", indexed: false }] },
];

const QuizBowlAbi: Abi = [
  { type: "function", name: "initMatch", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "players", type: "address[]" }, { name: "totalQuestions", type: "uint256" }, { name: "maxAnswerTime", type: "uint256" }], outputs: [] },
  { type: "function", name: "postQuestion", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "questionHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "commitAnswer", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "questionIndex", type: "uint256" }, { name: "answerHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "revealAnswer", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "questionIndex", type: "uint256" }, { name: "answer", type: "uint256" }, { name: "salt", type: "bytes32" }], outputs: [] },
  { type: "function", name: "resolveQuestion", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "questionIndex", type: "uint256" }, { name: "correctAnswer", type: "uint256" }], outputs: [] },
  { type: "function", name: "getScore", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }, { name: "player", type: "address" }], outputs: [{ name: "", type: "int256" }] },
  { type: "function", name: "getPlayers", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "address[]" }] },
  { type: "function", name: "getCurrentQuestion", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  // Auto-generated public getters from the public mappings.
  { type: "function", name: "questions", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }, { name: "questionIndex", type: "uint256" }], outputs: [{ name: "questionHash", type: "bytes32" }, { name: "correctAnswer", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "resolved", type: "bool" }] },
  { type: "function", name: "answers", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }, { name: "questionIndex", type: "uint256" }, { name: "player", type: "address" }], outputs: [{ name: "answerHash", type: "bytes32" }, { name: "revealedAnswer", type: "uint256" }, { name: "submitTimestamp", type: "uint256" }, { name: "committed", type: "bool" }, { name: "revealed", type: "bool" }, { name: "correct", type: "bool" }] },
  { type: "event", name: "AnswerCommitted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "questionIndex", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }] },
  { type: "event", name: "AnswerRevealed", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "questionIndex", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }, { name: "answer", type: "uint256", indexed: false }] },
];

// Phase 2: Seasonal Rankings ABI
const SeasonalRankingsAbi: Abi = [
  { type: "function", name: "recordSeasonalMatch", stateMutability: "nonpayable", inputs: [{ name: "winner", type: "address" }, { name: "loser", type: "address" }, { name: "eloChange", type: "int256" }], outputs: [] },
  { type: "function", name: "startNewSeason", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "endSeason", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "distributeSeasonRewards", stateMutability: "nonpayable", inputs: [{ name: "seasonId", type: "uint256" }], outputs: [] },
  { type: "function", name: "getCurrentSeason", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "tuple", components: [{ name: "id", type: "uint256" }, { name: "startTime", type: "uint256" }, { name: "endTime", type: "uint256" }, { name: "active", type: "bool" }, { name: "rewardsDistributed", type: "bool" }, { name: "totalPrizePool", type: "uint256" }] }] },
  { type: "function", name: "currentSeasonId", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "isSeasonActive", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
];

// Phase 2: Spectator Betting ABI
const SpectatorBettingAbi: Abi = [
  { type: "function", name: "openBetting", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }], outputs: [] },
  { type: "function", name: "closeBetting", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }], outputs: [] },
  { type: "function", name: "settleBets", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "actualWinner", type: "address" }], outputs: [] },
  { type: "function", name: "refundMatch", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }], outputs: [] },
  { type: "function", name: "getMatchPool", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "", type: "tuple", components: [{ name: "matchId", type: "uint256" }, { name: "player1", type: "address" }, { name: "player2", type: "address" }, { name: "totalPlayer1Bets", type: "uint256" }, { name: "totalPlayer2Bets", type: "uint256" }, { name: "bettingOpen", type: "bool" }, { name: "settled", type: "bool" }, { name: "winner", type: "address" }] }] },
];

// Phase 2: MatchRegistry Replay Extension ABI
const MatchRegistryReplayAbi: Abi = [
  { type: "function", name: "storeRoundState", stateMutability: "nonpayable", inputs: [{ name: "matchId", type: "uint256" }, { name: "stateHash", type: "bytes32" }], outputs: [] },
  { type: "function", name: "getReplayData", stateMutability: "view", inputs: [{ name: "matchId", type: "uint256" }], outputs: [{ name: "roundStateHashes", type: "bytes32[]" }, { name: "roundCount", type: "uint256" }, { name: "available", type: "bool" }] },
];

export class MonadContractClient {
  private arenaCore;
  private escrow;
  private matchRegistry;
  private oracleDuel;
  private strategyArena;
  private auctionWars;
  private quizBowl;
  // Phase 2 contracts
  private seasonalRankings;
  private spectatorBetting;
  private matchRegistryReplay;

  constructor() {
    if (!walletClient) throw new Error("Wallet client not initialized");

    // Boot-time validation: each required address must be present and a
    // well-formed 0x-prefixed 40-char hex string. A misconfiguration here
    // is the most common production failure mode — fail fast with a clear
    // message rather than wait for the first contract call to error opaquely.
    const coreAddr = requireAddress("ARENA_CORE_ADDRESS");
    const escrowAddr = requireAddress("ESCROW_ADDRESS");
    const registryAddr = requireAddress("MATCH_REGISTRY_ADDRESS");
    const oracleAddr = requireAddress("ORACLE_DUEL_ADDRESS");
    const strategyAddr = requireAddress("STRATEGY_ARENA_ADDRESS");
    const auctionAddr = requireAddress("AUCTION_WARS_ADDRESS");
    const quizAddr = requireAddress("QUIZ_BOWL_ADDRESS");
    // Phase 2 addresses are optional (contracts may not be deployed yet),
    // but a *malformed* value still throws so typos don't silently disable
    // the feature.
    const seasonalAddr = optionalAddress("SEASONAL_RANKINGS_ADDRESS");
    const bettingAddr = optionalAddress("SPECTATOR_BETTING_ADDRESS");

    log.info("Contract addresses validated", {
      core: coreAddr,
      escrow: escrowAddr,
      registry: registryAddr,
      oracle: oracleAddr,
      strategy: strategyAddr,
      auction: auctionAddr,
      quiz: quizAddr,
      seasonal: seasonalAddr ?? "(unset)",
      betting: bettingAddr ?? "(unset)",
    });

    this.arenaCore = getContract({
      address: coreAddr,
      abi: ArenaCoreAbi,
      client: { public: publicClient, wallet: walletClient },
    });

    this.escrow = getContract({
      address: escrowAddr,
      abi: WagerEscrowAbi,
      client: { public: publicClient, wallet: walletClient },
    });

    this.matchRegistry = getContract({
      address: registryAddr,
      abi: MatchRegistryAbi,
      client: { public: publicClient, wallet: walletClient },
    });

    this.oracleDuel = getContract({
      address: oracleAddr,
      abi: OracleDuelAbi,
      client: { public: publicClient, wallet: walletClient },
    });

    this.strategyArena = getContract({
      address: strategyAddr,
      abi: StrategyArenaAbi,
      client: { public: publicClient, wallet: walletClient },
    });

    this.auctionWars = getContract({
      address: auctionAddr,
      abi: AuctionWarsAbi,
      client: { public: publicClient, wallet: walletClient },
    });

    this.quizBowl = getContract({
      address: quizAddr,
      abi: QuizBowlAbi,
      client: { public: publicClient, wallet: walletClient },
    });

    // Phase 2 contracts (optional - may not be deployed yet)
    if (seasonalAddr) {
      this.seasonalRankings = getContract({
        address: seasonalAddr,
        abi: SeasonalRankingsAbi,
        client: { public: publicClient, wallet: walletClient },
      });
    }

    if (bettingAddr) {
      this.spectatorBetting = getContract({
        address: bettingAddr,
        abi: SpectatorBettingAbi,
        client: { public: publicClient, wallet: walletClient },
      });
    }

    // MatchRegistry replay extension (uses same address but extended ABI)
    this.matchRegistryReplay = getContract({
      address: registryAddr,
      abi: MatchRegistryReplayAbi,
      client: { public: publicClient, wallet: walletClient },
    });
  }

  // --- ArenaCore Write ---

  async createTournament(
    name: string,
    gameType: number,
    format: number,
    entryStake: bigint,
    maxParticipants: number,
    roundCount: number,
    parametersHash: `0x${string}`
  ): Promise<`0x${string}`> {
    const hash = await this.arenaCore.write.createTournament([
      name, gameType, format, entryStake, maxParticipants, roundCount, parametersHash,
    ]);
    await confirmTx(hash, "createTournament");
    return hash;
  }

  async startTournament(tournamentId: number): Promise<void> {
    const hash = await this.arenaCore.write.startTournament([BigInt(tournamentId)]);
    await confirmTx(hash, "startTournament");
  }

  async completeTournament(tournamentId: number, winner: string): Promise<void> {
    const hash = await this.arenaCore.write.completeTournament([
      BigInt(tournamentId), winner as `0x${string}`,
    ]);
    await confirmTx(hash, "completeTournament");
  }

  async advanceRound(tournamentId: number): Promise<void> {
    const hash = await this.arenaCore.write.advanceRound([BigInt(tournamentId)]);
    await confirmTx(hash, "advanceRound");
  }

  async evolveParameters(tournamentId: number, newHash: `0x${string}`): Promise<void> {
    const hash = await this.arenaCore.write.evolveParameters([BigInt(tournamentId), newHash]);
    await confirmTx(hash, "evolveParameters");
  }

  async updateElo(agent: string, newElo: number, won: boolean): Promise<void> {
    const hash = await this.arenaCore.write.updateElo([
      agent as `0x${string}`, BigInt(newElo), won,
    ]);
    await confirmTx(hash, "updateElo");
  }

  // --- Escrow Write ---

  async lockForMatch(tournamentId: number, agent1: string, agent2: string): Promise<void> {
    const hash = await this.escrow.write.lockForMatch([
      BigInt(tournamentId), agent1 as `0x${string}`, agent2 as `0x${string}`,
    ]);
    await confirmTx(hash, "lockForMatch");
  }

  async distributePrize(tournamentId: number, winner: string, amount: bigint): Promise<void> {
    const hash = await this.escrow.write.distributePrize([
      BigInt(tournamentId), winner as `0x${string}`, amount,
    ]);
    await confirmTx(hash, "distributePrize");
  }

  async batchDistribute(
    tournamentId: number,
    recipients: string[],
    amounts: bigint[]
  ): Promise<void> {
    const hash = await this.escrow.write.batchDistribute([
      BigInt(tournamentId),
      recipients as `0x${string}`[],
      amounts,
    ]);
    await confirmTx(hash, "batchDistribute");
  }

  // --- MatchRegistry Write ---

  async createMatch(
    tournamentId: number,
    round: number,
    player1: string,
    player2: string
  ): Promise<`0x${string}`> {
    const hash = await this.matchRegistry.write.createMatch([
      BigInt(tournamentId), BigInt(round),
      player1 as `0x${string}`, player2 as `0x${string}`,
    ]);
    await confirmTx(hash, "createMatch");
    return hash;
  }

  async startMatch(matchId: number): Promise<void> {
    const hash = await this.matchRegistry.write.startMatch([BigInt(matchId)]);
    await confirmTx(hash, "startMatch");
  }

  async recordResult(matchId: number, winner: string, resultHash: `0x${string}`): Promise<void> {
    const hash = await this.matchRegistry.write.recordResult([
      BigInt(matchId), winner as `0x${string}`, resultHash,
    ]);
    await confirmTx(hash, "recordResult");
  }

  // --- OracleDuel Write ---

  async initDuel(
    matchId: number,
    tokenAddress: string,
    snapshotPrice: bigint,
    durationSeconds: number,
    bullPlayer: string,
    bearPlayer: string
  ): Promise<void> {
    const hash = await this.oracleDuel.write.initDuel([
      BigInt(matchId), tokenAddress as `0x${string}`, snapshotPrice,
      BigInt(durationSeconds), bullPlayer as `0x${string}`, bearPlayer as `0x${string}`,
    ]);
    await confirmTx(hash, "initDuel");
  }

  async resolveDuel(matchId: number, currentPrice: bigint): Promise<void> {
    const hash = await this.oracleDuel.write.resolveDuel([BigInt(matchId), currentPrice]);
    await confirmTx(hash, "resolveDuel");
  }

  // --- StrategyArena Write ---

  async initStrategyMatch(
    matchId: number,
    player1: string,
    player2: string,
    totalRounds: number,
    commitTimeout: number,
    revealTimeout: number,
  ): Promise<void> {
    const hash = await this.strategyArena.write.initMatch([
      BigInt(matchId),
      player1 as `0x${string}`,
      player2 as `0x${string}`,
      BigInt(totalRounds),
      BigInt(commitTimeout),
      BigInt(revealTimeout),
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`initStrategyMatch tx failed: ${hash}`);
    log.info("Initialized StrategyArena match", { matchId });
  }

  /**
   * Read the per-round commit/reveal/resolved state from StrategyArena.
   * Returns null if the match isn't initialised on-chain or the read fails.
   *
   * Used by the engine to detect when both players have revealed on-chain
   * (the realistic path when players act directly on the contract rather
   * than via the backend's WebSocket-driven processAction).
   */
  async getStrategyRound(matchId: number, roundNum: number): Promise<{
    player1Commitment: `0x${string}`;
    player2Commitment: `0x${string}`;
    player1Move: number;
    player2Move: number;
    player1Revealed: boolean;
    player2Revealed: boolean;
    resolved: boolean;
  } | null> {
    try {
      const result = await this.strategyArena.read.getRound([
        BigInt(matchId), BigInt(roundNum),
      ]) as {
        player1Commitment: `0x${string}`;
        player2Commitment: `0x${string}`;
        player1Move: number;
        player2Move: number;
        player1Revealed: boolean;
        player2Revealed: boolean;
        resolved: boolean;
      };
      return result;
    } catch (error) {
      log.warn("getStrategyRound failed", { matchId, roundNum, error });
      return null;
    }
  }

  /**
   * Call StrategyArena.resolveRound on-chain. Only the arenaAgent can do this.
   * The contract reads the revealed moves, computes payoffs from the on-chain
   * payoff matrix, and updates per-player scores in the MatchState. Returns
   * the resulting (player1Score, player2Score) so the engine can determine
   * the round winner without re-running the calculation in TypeScript.
   */
  async resolveStrategyRound(matchId: number): Promise<{ player1Score: bigint; player2Score: bigint } | null> {
    try {
      const hash = await this.strategyArena.write.resolveRound([BigInt(matchId)]);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`resolveRound tx failed: ${hash}`);
      const state = await this.getStrategyMatchState(matchId);
      if (!state) return null;
      log.info("Resolved StrategyArena round", { matchId, p1Score: String(state.player1Score), p2Score: String(state.player2Score) });
      return { player1Score: state.player1Score, player2Score: state.player2Score };
    } catch (error) {
      log.warn("resolveStrategyRound failed", { matchId, error });
      return null;
    }
  }

  // --- AuctionWars Write ---

  async initAuctionMatch(matchId: number, players: string[], totalRounds: number): Promise<void> {
    const hash = await this.auctionWars.write.initMatch([
      BigInt(matchId), players as `0x${string}`[], BigInt(totalRounds),
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`initAuctionMatch tx failed: ${hash}`);
    log.info("Initialized AuctionWars match", { matchId });
  }

  async resolveAuctionRound(matchId: number, roundNum: number, actualValue: bigint): Promise<void> {
    const hash = await this.auctionWars.write.resolveAuction([
      BigInt(matchId), BigInt(roundNum), actualValue,
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`resolveAuction tx failed: ${hash}`);
    log.info("Resolved AuctionWars round", { matchId, roundNum });
  }

  async getAuctionScore(matchId: number, player: string): Promise<bigint> {
    return await this.auctionWars.read.getScore([BigInt(matchId), player as `0x${string}`]) as bigint;
  }

  async getAuctionCurrentRound(matchId: number): Promise<number> {
    return Number(await this.auctionWars.read.getCurrentRound([BigInt(matchId)]));
  }

  /**
   * Read the per-round struct from AuctionWars. Returns null on read failure.
   * Auto-generated getter from the `auctionRounds` public mapping.
   */
  async getAuctionRound(matchId: number, roundNum: number): Promise<{
    mysteryBoxHash: `0x${string}`;
    biddingDeadline: bigint;
    revealDeadline: bigint;
    actualValue: bigint;
    winner: `0x${string}`;
    winningBid: bigint;
    resolved: boolean;
  } | null> {
    try {
      // Solidity's auto-getter returns the struct as a tuple. viem decodes it
      // as a positional array when there are no output names — but we named
      // the outputs in the ABI, so it returns a named object.
      const result = await this.auctionWars.read.auctionRounds([
        BigInt(matchId), BigInt(roundNum),
      ]) as readonly [`0x${string}`, bigint, bigint, bigint, `0x${string}`, bigint, boolean];
      return {
        mysteryBoxHash: result[0],
        biddingDeadline: result[1],
        revealDeadline: result[2],
        actualValue: result[3],
        winner: result[4],
        winningBid: result[5],
        resolved: result[6],
      };
    } catch (error) {
      log.warn("getAuctionRound failed", { matchId, roundNum, error });
      return null;
    }
  }

  /**
   * Read a single bid for `player` in match/round. Returns null on read failure.
   * Auto-generated getter from the `bids` public mapping.
   */
  async getAuctionBid(matchId: number, roundNum: number, player: string): Promise<{
    agent: `0x${string}`;
    bidHash: `0x${string}`;
    revealedAmount: bigint;
    committed: boolean;
    revealed: boolean;
  } | null> {
    try {
      const result = await this.auctionWars.read.bids([
        BigInt(matchId), BigInt(roundNum), player as `0x${string}`,
      ]) as readonly [`0x${string}`, `0x${string}`, bigint, boolean, boolean];
      return {
        agent: result[0],
        bidHash: result[1],
        revealedAmount: result[2],
        committed: result[3],
        revealed: result[4],
      };
    } catch (error) {
      log.warn("getAuctionBid failed", { matchId, roundNum, player, error });
      return null;
    }
  }

  // --- QuizBowl Write ---

  async initQuizMatch(matchId: number, players: string[], totalQuestions: number, maxAnswerTime: number): Promise<void> {
    const hash = await this.quizBowl.write.initMatch([
      BigInt(matchId), players as `0x${string}`[], BigInt(totalQuestions), BigInt(maxAnswerTime),
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`initQuizMatch tx failed: ${hash}`);
    log.info("Initialized QuizBowl match", { matchId });
  }

  async resolveQuizQuestion(matchId: number, questionIndex: number, correctAnswer: number): Promise<void> {
    const hash = await this.quizBowl.write.resolveQuestion([
      BigInt(matchId), BigInt(questionIndex), BigInt(correctAnswer),
    ]);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`resolveQuestion tx failed: ${hash}`);
    log.info("Resolved QuizBowl question", { matchId, questionIndex });
  }

  async getQuizScore(matchId: number, player: string): Promise<bigint> {
    return await this.quizBowl.read.getScore([BigInt(matchId), player as `0x${string}`]) as bigint;
  }

  async getQuizCurrentQuestion(matchId: number): Promise<number> {
    return Number(await this.quizBowl.read.getCurrentQuestion([BigInt(matchId)]));
  }

  /**
   * Read the per-question struct from QuizBowl. Returns null on failure.
   * Auto-getter from the public `questions` mapping.
   */
  async getQuizQuestion(matchId: number, questionIndex: number): Promise<{
    questionHash: `0x${string}`;
    correctAnswer: bigint;
    deadline: bigint;
    resolved: boolean;
  } | null> {
    try {
      const result = await this.quizBowl.read.questions([
        BigInt(matchId), BigInt(questionIndex),
      ]) as readonly [`0x${string}`, bigint, bigint, boolean];
      return {
        questionHash: result[0],
        correctAnswer: result[1],
        deadline: result[2],
        resolved: result[3],
      };
    } catch (error) {
      log.warn("getQuizQuestion failed", { matchId, questionIndex, error });
      return null;
    }
  }

  /**
   * Read a single player's answer for a question. Returns null on failure.
   * Auto-getter from the public `answers` mapping.
   */
  async getQuizAnswer(matchId: number, questionIndex: number, player: string): Promise<{
    answerHash: `0x${string}`;
    revealedAnswer: bigint;
    submitTimestamp: bigint;
    committed: boolean;
    revealed: boolean;
    correct: boolean;
  } | null> {
    try {
      const result = await this.quizBowl.read.answers([
        BigInt(matchId), BigInt(questionIndex), player as `0x${string}`,
      ]) as readonly [`0x${string}`, bigint, bigint, boolean, boolean, boolean];
      return {
        answerHash: result[0],
        revealedAnswer: result[1],
        submitTimestamp: result[2],
        committed: result[3],
        revealed: result[4],
        correct: result[5],
      };
    } catch (error) {
      log.warn("getQuizAnswer failed", { matchId, questionIndex, player, error });
      return null;
    }
  }

  // --- Strategy Arena Read ---

  async getStrategyMatchState(matchId: number): Promise<{
    player1: string; player2: string; totalRounds: bigint; currentRound: bigint;
    player1Score: bigint; player2Score: bigint; initialized: boolean;
  } | null> {
    try {
      const result = await this.strategyArena.read.getMatchState([BigInt(matchId)]) as {
        player1: string; player2: string; totalRounds: bigint; currentRound: bigint;
        player1Score: bigint; player2Score: bigint; commitDeadline: bigint; revealDeadline: bigint; initialized: boolean;
      };
      if (!result.initialized) return null;
      return result;
    } catch (error) {
      log.error("getStrategyMatchState failed", { matchId, error });
      return null;
    }
  }

  // --- Read Operations ---

  async getTournament(id: number) {
    return await this.arenaCore.read.getTournament([BigInt(id)]);
  }

  async getAgent(address: string) {
    return await this.arenaCore.read.getAgent([address as `0x${string}`]);
  }

  async getTournamentParticipants(id: number): Promise<string[]> {
    const result = await this.arenaCore.read.getTournamentParticipants([BigInt(id)]);
    return result as string[];
  }

  async getTournamentCount(): Promise<number> {
    const count = await this.arenaCore.read.tournamentCounter();
    return Number(count);
  }

  async getMatch(id: number) {
    return await this.matchRegistry.read.getMatch([BigInt(id)]);
  }

  async getTournamentMatches(tournamentId: number): Promise<number[]> {
    const result = await this.matchRegistry.read.getTournamentMatches([BigInt(tournamentId)]);
    return (result as bigint[]).map(Number);
  }

  async getMatchCount(): Promise<number> {
    const count = await this.matchRegistry.read.matchCounter();
    return Number(count);
  }

  async getDuel(matchId: number) {
    return await this.oracleDuel.read.getDuel([BigInt(matchId)]);
  }

  async getTournamentPool(tournamentId: number): Promise<bigint> {
    return await this.escrow.read.tournamentPools([BigInt(tournamentId)]) as bigint;
  }

  // =========================================================================
  // Phase 2: Seasonal Rankings Methods
  // =========================================================================

  async recordSeasonalMatch(winner: string, loser: string, eloChange: number): Promise<void> {
    if (!this.seasonalRankings) {
      log.warn("SeasonalRankings not configured; skipping", { method: "recordSeasonalMatch" });
      return;
    }
    const hash = await this.seasonalRankings.write.recordSeasonalMatch([
      winner as `0x${string}`,
      loser as `0x${string}`,
      BigInt(eloChange),
    ]);
    await confirmTx(hash, "recordSeasonalMatch");
    log.info("Recorded seasonal match", { winner, loser, eloChange });
  }

  async startNewSeason(): Promise<void> {
    if (!this.seasonalRankings) {
      log.warn("SeasonalRankings not configured; skipping", { method: "startNewSeason" });
      return;
    }
    const hash = await this.seasonalRankings.write.startNewSeason([]);
    await confirmTx(hash, "startNewSeason");
    log.info("Started new season");
  }

  async endSeason(): Promise<void> {
    if (!this.seasonalRankings) {
      log.warn("SeasonalRankings not configured; skipping", { method: "endSeason" });
      return;
    }
    const hash = await this.seasonalRankings.write.endSeason([]);
    await confirmTx(hash, "endSeason");
    log.info("Ended current season");
  }

  async distributeSeasonRewards(seasonId: number): Promise<void> {
    if (!this.seasonalRankings) {
      log.warn("SeasonalRankings not configured; skipping", { method: "distributeSeasonRewards" });
      return;
    }
    const hash = await this.seasonalRankings.write.distributeSeasonRewards([BigInt(seasonId)]);
    await confirmTx(hash, "distributeSeasonRewards");
    log.info("Distributed season rewards", { seasonId });
  }

  async getCurrentSeasonId(): Promise<number | null> {
    if (!this.seasonalRankings) return null;
    const id = await this.seasonalRankings.read.currentSeasonId();
    return Number(id);
  }

  async isSeasonActive(): Promise<boolean> {
    if (!this.seasonalRankings) return false;
    return await this.seasonalRankings.read.isSeasonActive() as boolean;
  }

  async getCurrentSeason(): Promise<{
    id: number;
    startTime: number;
    endTime: number;
    active: boolean;
    rewardsDistributed: boolean;
    totalPrizePool: string;
  } | null> {
    if (!this.seasonalRankings) return null;
    try {
      const result = await this.seasonalRankings.read.getCurrentSeason() as {
        id: bigint;
        startTime: bigint;
        endTime: bigint;
        active: boolean;
        rewardsDistributed: boolean;
        totalPrizePool: bigint;
      };
      return {
        id: Number(result.id),
        startTime: Number(result.startTime),
        endTime: Number(result.endTime),
        active: result.active,
        rewardsDistributed: result.rewardsDistributed,
        totalPrizePool: (Number(result.totalPrizePool) / 1e18).toString(),
      };
    } catch (error) {
      log.error("getCurrentSeason failed", { error });
      return null;
    }
  }

  // =========================================================================
  // Phase 2: Spectator Betting Methods
  // =========================================================================

  async openBetting(matchId: number, player1: string, player2: string): Promise<void> {
    if (!this.spectatorBetting) {
      log.warn("SpectatorBetting not configured; skipping", { method: "openBetting" });
      return;
    }
    const hash = await this.spectatorBetting.write.openBetting([
      BigInt(matchId),
      player1 as `0x${string}`,
      player2 as `0x${string}`,
    ]);
    await confirmTx(hash, "openBetting");
    log.info("Opened betting", { matchId });
  }

  async closeBetting(matchId: number): Promise<void> {
    if (!this.spectatorBetting) {
      log.warn("SpectatorBetting not configured; skipping", { method: "closeBetting" });
      return;
    }
    const hash = await this.spectatorBetting.write.closeBetting([BigInt(matchId)]);
    await confirmTx(hash, "closeBetting");
    log.info("Closed betting", { matchId });
  }

  async settleBets(matchId: number, actualWinner: string): Promise<void> {
    if (!this.spectatorBetting) {
      log.warn("SpectatorBetting not configured; skipping", { method: "settleBets" });
      return;
    }
    const hash = await this.spectatorBetting.write.settleBets([
      BigInt(matchId),
      actualWinner as `0x${string}`,
    ]);
    await confirmTx(hash, "settleBets");
    log.info("Settled bets", { matchId, winner: actualWinner });
  }

  async refundMatchBets(matchId: number): Promise<void> {
    if (!this.spectatorBetting) {
      log.warn("SpectatorBetting not configured; skipping", { method: "refundMatchBets" });
      return;
    }
    const hash = await this.spectatorBetting.write.refundMatch([BigInt(matchId)]);
    await confirmTx(hash, "refundMatch");
    log.info("Refunded bets for cancelled match", { matchId });
  }

  async getMatchPool(matchId: number): Promise<{
    matchId: number;
    player1: string;
    player2: string;
    totalPlayer1Bets: string;
    totalPlayer2Bets: string;
    bettingOpen: boolean;
    settled: boolean;
  } | null> {
    if (!this.spectatorBetting) return null;
    try {
      const result = await this.spectatorBetting.read.getMatchPool([BigInt(matchId)]) as {
        matchId: bigint;
        player1: string;
        player2: string;
        totalPlayer1Bets: bigint;
        totalPlayer2Bets: bigint;
        bettingOpen: boolean;
        settled: boolean;
        winner: string;
      };
      return {
        matchId: Number(result.matchId),
        player1: result.player1,
        player2: result.player2,
        totalPlayer1Bets: (Number(result.totalPlayer1Bets) / 1e18).toString(),
        totalPlayer2Bets: (Number(result.totalPlayer2Bets) / 1e18).toString(),
        bettingOpen: result.bettingOpen,
        settled: result.settled,
      };
    } catch (error) {
      log.error("getMatchPool failed", { matchId, error });
      return null;
    }
  }

  // =========================================================================
  // Phase 2: Match Replay Methods
  // =========================================================================

  async storeRoundState(matchId: number, stateHash: `0x${string}`): Promise<void> {
    const hash = await this.matchRegistryReplay.write.storeRoundState([
      BigInt(matchId),
      stateHash,
    ]);
    await confirmTx(hash, "storeRoundState");
    log.info("Stored round state for match", { matchId });
  }

  async getReplayData(matchId: number): Promise<{ roundStateHashes: string[]; roundCount: number; available: boolean } | null> {
    try {
      const result = await this.matchRegistryReplay.read.getReplayData([BigInt(matchId)]);
      const [hashes, count, available] = result as [string[], bigint, boolean];
      return {
        roundStateHashes: hashes,
        roundCount: Number(count),
        available,
      };
    } catch (error) {
      log.error("getReplayData failed", { matchId, error });
      return null;
    }
  }
}
