import { getContract, type Abi } from "viem";
import { publicClient, walletClient } from "./rpc";

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
  { type: "function", name: "getAgent", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "agentAddress", type: "address" }, { name: "moltbookHandle", type: "string" }, { name: "elo", type: "uint256" }, { name: "matchesPlayed", type: "uint256" }, { name: "wins", type: "uint256" }, { name: "losses", type: "uint256" }, { name: "registered", type: "bool" }] }] },
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
  { type: "event", name: "MoveCommitted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }] },
  { type: "event", name: "MoveRevealed", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }, { name: "move", type: "uint8", indexed: false }] },
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
  // Phase 2 contracts
  private seasonalRankings;
  private spectatorBetting;
  private matchRegistryReplay;

  constructor() {
    if (!walletClient) throw new Error("Wallet client not initialized");

    const coreAddr = process.env.ARENA_CORE_ADDRESS as `0x${string}`;
    const escrowAddr = process.env.ESCROW_ADDRESS as `0x${string}`;
    const registryAddr = process.env.MATCH_REGISTRY_ADDRESS as `0x${string}`;
    const oracleAddr = process.env.ORACLE_DUEL_ADDRESS as `0x${string}`;
    const strategyAddr = process.env.STRATEGY_ARENA_ADDRESS as `0x${string}`;
    // Phase 2 addresses
    const seasonalAddr = process.env.SEASONAL_RANKINGS_ADDRESS as `0x${string}` | undefined;
    const bettingAddr = process.env.SPECTATOR_BETTING_ADDRESS as `0x${string}` | undefined;

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
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async startTournament(tournamentId: number): Promise<void> {
    const hash = await this.arenaCore.write.startTournament([BigInt(tournamentId)]);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async completeTournament(tournamentId: number, winner: string): Promise<void> {
    const hash = await this.arenaCore.write.completeTournament([
      BigInt(tournamentId), winner as `0x${string}`,
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async advanceRound(tournamentId: number): Promise<void> {
    const hash = await this.arenaCore.write.advanceRound([BigInt(tournamentId)]);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async evolveParameters(tournamentId: number, newHash: `0x${string}`): Promise<void> {
    const hash = await this.arenaCore.write.evolveParameters([BigInt(tournamentId), newHash]);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async updateElo(agent: string, newElo: number, won: boolean): Promise<void> {
    const hash = await this.arenaCore.write.updateElo([
      agent as `0x${string}`, BigInt(newElo), won,
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  // --- Escrow Write ---

  async lockForMatch(tournamentId: number, agent1: string, agent2: string): Promise<void> {
    const hash = await this.escrow.write.lockForMatch([
      BigInt(tournamentId), agent1 as `0x${string}`, agent2 as `0x${string}`,
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async distributePrize(tournamentId: number, winner: string, amount: bigint): Promise<void> {
    const hash = await this.escrow.write.distributePrize([
      BigInt(tournamentId), winner as `0x${string}`, amount,
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
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
    await publicClient.waitForTransactionReceipt({ hash });
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
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async startMatch(matchId: number): Promise<void> {
    const hash = await this.matchRegistry.write.startMatch([BigInt(matchId)]);
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async recordResult(matchId: number, winner: string, resultHash: `0x${string}`): Promise<void> {
    const hash = await this.matchRegistry.write.recordResult([
      BigInt(matchId), winner as `0x${string}`, resultHash,
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
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
    await publicClient.waitForTransactionReceipt({ hash });
  }

  async resolveDuel(matchId: number, currentPrice: bigint): Promise<void> {
    const hash = await this.oracleDuel.write.resolveDuel([BigInt(matchId), currentPrice]);
    await publicClient.waitForTransactionReceipt({ hash });
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
      console.warn("[ContractClient] SeasonalRankings not configured, skipping recordSeasonalMatch");
      return;
    }
    const hash = await this.seasonalRankings.write.recordSeasonalMatch([
      winner as `0x${string}`,
      loser as `0x${string}`,
      BigInt(eloChange),
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Chain] Recorded seasonal match: winner=${winner}, eloChange=${eloChange}`);
  }

  async startNewSeason(): Promise<void> {
    if (!this.seasonalRankings) {
      console.warn("[ContractClient] SeasonalRankings not configured, skipping startNewSeason");
      return;
    }
    const hash = await this.seasonalRankings.write.startNewSeason([]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log("[Chain] Started new season");
  }

  async endSeason(): Promise<void> {
    if (!this.seasonalRankings) {
      console.warn("[ContractClient] SeasonalRankings not configured, skipping endSeason");
      return;
    }
    const hash = await this.seasonalRankings.write.endSeason([]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log("[Chain] Ended current season");
  }

  async distributeSeasonRewards(seasonId: number): Promise<void> {
    if (!this.seasonalRankings) {
      console.warn("[ContractClient] SeasonalRankings not configured, skipping distributeSeasonRewards");
      return;
    }
    const hash = await this.seasonalRankings.write.distributeSeasonRewards([BigInt(seasonId)]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Chain] Distributed rewards for season ${seasonId}`);
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
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Phase 2: Spectator Betting Methods
  // =========================================================================

  async openBetting(matchId: number, player1: string, player2: string): Promise<void> {
    if (!this.spectatorBetting) {
      console.warn("[ContractClient] SpectatorBetting not configured, skipping openBetting");
      return;
    }
    const hash = await this.spectatorBetting.write.openBetting([
      BigInt(matchId),
      player1 as `0x${string}`,
      player2 as `0x${string}`,
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Chain] Opened betting for match ${matchId}`);
  }

  async closeBetting(matchId: number): Promise<void> {
    if (!this.spectatorBetting) {
      console.warn("[ContractClient] SpectatorBetting not configured, skipping closeBetting");
      return;
    }
    const hash = await this.spectatorBetting.write.closeBetting([BigInt(matchId)]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Chain] Closed betting for match ${matchId}`);
  }

  async settleBets(matchId: number, actualWinner: string): Promise<void> {
    if (!this.spectatorBetting) {
      console.warn("[ContractClient] SpectatorBetting not configured, skipping settleBets");
      return;
    }
    const hash = await this.spectatorBetting.write.settleBets([
      BigInt(matchId),
      actualWinner as `0x${string}`,
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Chain] Settled bets for match ${matchId}, winner: ${actualWinner}`);
  }

  async refundMatchBets(matchId: number): Promise<void> {
    if (!this.spectatorBetting) {
      console.warn("[ContractClient] SpectatorBetting not configured, skipping refundMatchBets");
      return;
    }
    const hash = await this.spectatorBetting.write.refundMatch([BigInt(matchId)]);
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Chain] Refunded bets for cancelled match ${matchId}`);
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
    } catch {
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
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[Chain] Stored round state for match ${matchId}`);
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
    } catch {
      return null;
    }
  }
}
