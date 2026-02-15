// GraphQL Resolvers

import type { MonadContractClient } from "../../monad/contract-client";
import type { MatchStore } from "../../persistence/match-store";
import type { ArenaManager } from "../../arena-manager";
import type { DataLoaders, MatchData, AgentData } from "./dataloaders";
import {
  gameTypeToEnum,
  tournamentFormatToEnum,
  tournamentStatusToEnum,
  matchStatusToEnum,
  enumToGameType,
  enumToTournamentFormat,
  rankTierToEnum,
  betStatusToEnum,
} from "./schema";
import { getClaudeAnalysisService } from "../../claude";
import type { TokenManager } from "../../monad/token-manager";
import type { AutonomousScheduler } from "../../autonomous/scheduler";
import type { A2ACoordinator } from "../../autonomous/a2a-coordinator";
import { normalizeAddress } from "../../utils/normalize";
import { clampLimit, clampOffset, validateId, validateAddress } from "../../utils/validate";

export interface ResolverContext {
  loaders: DataLoaders;
  contractClient: MonadContractClient;
  matchStore: MatchStore | null;
  arenaManager?: ArenaManager;
  tokenManager?: TokenManager;
  scheduler?: AutonomousScheduler;
  a2aCoordinator?: A2ACoordinator;
}

export const resolvers = {
  Query: {
    // Tournament queries
    tournaments: async (
      _: unknown,
      args: { status?: string; gameType?: string; format?: string; limit?: number; offset?: number },
      context: ResolverContext
    ) => {
      const count = await context.contractClient.getTournamentCount();
      const tournaments = [];

      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;

      for (let i = 1; i <= count; i++) {
        const tournament = await context.loaders.tournamentLoader.load(i);
        if (!tournament) continue;

        // Filter by status
        if (args.status && tournamentStatusToEnum(tournament.status) !== args.status) {
          continue;
        }

        // Filter by game type
        if (args.gameType && gameTypeToEnum(tournament.gameType) !== args.gameType) {
          continue;
        }

        // Filter by format
        if (args.format && tournamentFormatToEnum(tournament.format) !== args.format) {
          continue;
        }

        tournaments.push(tournament);
      }

      return tournaments.slice(offset, offset + limit).map((t) => ({
        ...t,
        gameType: gameTypeToEnum(t.gameType),
        format: tournamentFormatToEnum(t.format),
        status: tournamentStatusToEnum(t.status),
      }));
    },

    tournament: async (_: unknown, args: { id: number }, context: ResolverContext) => {
      validateId(args.id, "tournament ID");
      const tournament = await context.loaders.tournamentLoader.load(args.id);
      if (!tournament) return null;

      return {
        ...tournament,
        gameType: gameTypeToEnum(tournament.gameType),
        format: tournamentFormatToEnum(tournament.format),
        status: tournamentStatusToEnum(tournament.status),
      };
    },

    tournamentCount: async (_: unknown, __: unknown, context: ResolverContext) => {
      return await context.contractClient.getTournamentCount();
    },

    // Match queries
    matches: async (
      _: unknown,
      args: { tournamentId?: number; status?: string; limit?: number; offset?: number },
      context: ResolverContext
    ) => {
      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);

      if (args.tournamentId) {
        const matches = await context.loaders.tournamentMatchesLoader.load(args.tournamentId);
        return matches.slice(offset, offset + limit).map((m: MatchData) => ({
          ...m,
          status: matchStatusToEnum(m.status),
          gameType: gameTypeToEnum(m.gameType),
        }));
      }

      // Get recent matches from store
      if (context.matchStore) {
        const recentMatches = context.matchStore.getRecentMatches(limit + offset);
        return recentMatches.slice(offset, offset + limit).map((r) => ({
          id: r.matchId,
          tournamentId: r.tournamentId,
          round: r.round,
          player1: r.loser ?? "",
          player2: r.winner ?? "",
          winner: r.winner,
          resultHash: "",
          timestamp: 0,
          status: matchStatusToEnum(2),
          gameType: gameTypeToEnum(r.gameType),
          stats: {
            duration: r.duration,
            isUpset: r.isUpset,
            isDraw: r.isDraw,
          },
        }));
      }

      return [];
    },

    match: async (_: unknown, args: { id: number }, context: ResolverContext) => {
      const match = await context.loaders.matchLoader.load(args.id);
      if (!match) return null;

      return {
        ...match,
        status: matchStatusToEnum(match.status),
        gameType: gameTypeToEnum(match.gameType),
        stats: {
          duration: match.duration,
          isUpset: match.isUpset,
          isDraw: match.isDraw,
        },
      };
    },

    liveMatches: async (_: unknown, __: unknown, context: ResolverContext) => {
      // Get matches with status InProgress
      const count = await context.contractClient.getMatchCount();
      const liveMatches = [];

      for (let i = Math.max(1, count - 50); i <= count; i++) {
        const match = await context.loaders.matchLoader.load(i);
        if (match && match.status === 1) {
          liveMatches.push({
            ...match,
            status: "IN_PROGRESS",
            gameType: gameTypeToEnum(match.gameType),
          });
        }
      }

      return liveMatches;
    },

    recentMatches: async (_: unknown, args: { limit?: number }, context: ResolverContext) => {
      const limit = args.limit ?? 20;

      if (context.matchStore) {
        const matches = context.matchStore.getRecentMatches(limit);
        return matches.map((r) => ({
          id: r.matchId,
          tournamentId: r.tournamentId,
          round: r.round,
          player1: r.loser ?? "",
          player2: r.winner ?? "",
          winner: r.winner,
          resultHash: "",
          timestamp: 0,
          status: "COMPLETED",
          gameType: gameTypeToEnum(r.gameType),
          stats: {
            duration: r.duration,
            isUpset: r.isUpset,
            isDraw: r.isDraw,
          },
        }));
      }

      return [];
    },

    // Agent queries
    agents: async (
      _: unknown,
      args: { limit?: number; offset?: number; sortBy?: string },
      context: ResolverContext
    ) => {
      // This would need a way to enumerate all agents
      // For now, return empty - would need index contract or off-chain indexer
      return [];
    },

    agent: async (_: unknown, args: { address: string }, context: ResolverContext) => {
      validateAddress(args.address);
      const agent = await context.loaders.agentLoader.load(args.address);
      if (!agent) return null;

      return {
        ...agent,
        winRate: agent.matchesPlayed > 0 ? agent.wins / agent.matchesPlayed : 0,
      };
    },

    // Leaderboard
    leaderboard: async (
      _: unknown,
      args: { gameType?: string; limit?: number; offset?: number },
      context: ResolverContext
    ) => {
      // Would need an off-chain indexer to efficiently track leaderboard
      // For now, return empty
      return {
        entries: [],
        total: 0,
        hasMore: false,
      };
    },

    // Evolution history
    evolutionHistory: async (
      _: unknown,
      args: { tournamentId: number },
      context: ResolverContext
    ) => {
      // Would need to track evolution events off-chain
      return [];
    },

    // Arena stats
    arenaStats: async (_: unknown, __: unknown, context: ResolverContext) => {
      const tournamentCount = await context.contractClient.getTournamentCount();
      const matchCount = await context.contractClient.getMatchCount();

      let activeTournaments = 0;
      let liveMatchCount = 0;
      for (let i = 1; i <= tournamentCount; i++) {
        const t = await context.loaders.tournamentLoader.load(i);
        if (t && (t.status === 0 || t.status === 1)) {
          activeTournaments++;
        }
      }

      for (let i = Math.max(1, matchCount - 50); i <= matchCount; i++) {
        const m = await context.loaders.matchLoader.load(i);
        if (m && m.status === 1) {
          liveMatchCount++;
        }
      }

      return {
        totalTournaments: tournamentCount,
        activeTournaments,
        totalMatches: matchCount,
        liveMatches: liveMatchCount,
        totalAgents: 0, // Would need agent index
        totalPrizeDistributed: "0", // Would need to track
      };
    },

    // =========================================================================
    // Head-to-Head Analytics
    // =========================================================================

    headToHead: async (
      _: unknown,
      args: { agent1: string; agent2: string },
      context: ResolverContext
    ) => {
      if (!context.matchStore) return null;
      validateAddress(args.agent1, "agent1");
      validateAddress(args.agent2, "agent2");

      const matches = context.matchStore.getMatchesBetweenAgents(args.agent1, args.agent2);
      if (matches.length === 0) return null;

      const a1 = normalizeAddress(args.agent1);
      const a2 = normalizeAddress(args.agent2);

      let agent1Wins = 0;
      let agent2Wins = 0;
      let draws = 0;

      const h2hMatches = matches.map(m => {
        if (m.isDraw) {
          draws++;
        } else if (m.winner ? normalizeAddress(m.winner) === a1 : false) {
          agent1Wins++;
        } else if (m.winner ? normalizeAddress(m.winner) === a2 : false) {
          agent2Wins++;
        }

        return {
          matchId: m.matchId,
          tournamentId: m.tournamentId,
          gameType: gameTypeToEnum(m.gameType),
          winner: m.winner,
          isDraw: m.isDraw,
          duration: m.duration,
          timestamp: 0,
        };
      });

      return {
        agent1: args.agent1,
        agent2: args.agent2,
        agent1Wins,
        agent2Wins,
        draws,
        totalMatches: matches.length,
        matches: h2hMatches,
      };
    },

    // =========================================================================
    // Phase 2: Seasonal Rankings Queries
    // =========================================================================

    currentSeason: async (_: unknown, __: unknown, context: ResolverContext) => {
      const season = await context.contractClient.getCurrentSeason();
      if (!season) return null;
      return {
        ...season,
        participantCount: 0, // Would need indexer
      };
    },

    season: async (_: unknown, args: { id: number }, context: ResolverContext) => {
      validateId(args.id, "season ID");
      // For now, only return current season
      const season = await context.contractClient.getCurrentSeason();
      if (!season || season.id !== args.id) return null;
      return {
        ...season,
        participantCount: 0,
      };
    },

    seasonalProfile: async (
      _: unknown,
      args: { seasonId: number; address: string },
      context: ResolverContext
    ) => {
      validateId(args.seasonId, "season ID");
      validateAddress(args.address);
      // For now return mock data based on agent
      const agent = await context.loaders.agentLoader.load(args.address);
      if (!agent) return null;

      // Calculate tier based on ELO
      let tier = 0; // IRON
      if (agent.elo >= 1600) tier = 5; // DIAMOND
      else if (agent.elo >= 1500) tier = 4; // PLATINUM
      else if (agent.elo >= 1400) tier = 3; // GOLD
      else if (agent.elo >= 1300) tier = 2; // SILVER
      else if (agent.elo >= 1200) tier = 1; // BRONZE

      return {
        seasonId: args.seasonId,
        address: args.address,
        seasonalElo: agent.elo,
        peakElo: agent.elo, // Use current ELO as peak (would need contract call for actual peak)
        matchesPlayed: agent.matchesPlayed,
        wins: agent.wins,
        losses: agent.losses,
        tier: rankTierToEnum(tier),
        placementComplete: agent.matchesPlayed >= 5,
        placementMatches: Math.min(agent.matchesPlayed, 5),
      };
    },

    mySeasonalProfile: async (
      _: unknown,
      args: { seasonId: number },
      context: ResolverContext
    ) => {
      // Would need user context - return null for now
      return null;
    },

    seasonalLeaderboard: async (
      _: unknown,
      args: { seasonId: number; limit?: number; offset?: number },
      context: ResolverContext
    ) => {
      // Would need indexer for leaderboard
      return [];
    },

    // =========================================================================
    // Phase 2: Spectator Betting Queries
    // =========================================================================

    matchPool: async (_: unknown, args: { matchId: number }, context: ResolverContext) => {
      validateId(args.matchId, "match ID");
      const pool = await context.contractClient.getMatchPool(args.matchId);
      return pool;
    },

    bettableMatches: async (_: unknown, __: unknown, context: ResolverContext) => {
      // Get in-progress matches that have betting open
      const count = await context.contractClient.getMatchCount();
      const bettableMatches = [];

      for (let i = Math.max(1, count - 20); i <= count; i++) {
        const match = await context.loaders.matchLoader.load(i);
        if (match && match.status === 1) { // IN_PROGRESS
          const pool = await context.contractClient.getMatchPool(i);
          if (pool && pool.bettingOpen) {
            bettableMatches.push({
              ...match,
              status: "IN_PROGRESS",
              gameType: gameTypeToEnum(match.gameType),
            });
          }
        }
      }

      return bettableMatches;
    },

    userBets: async (
      _: unknown,
      args: { address: string; status?: string; limit?: number },
      context: ResolverContext
    ) => {
      // Would need SpectatorBetting.getUserBets() or indexer
      return [];
    },

    bettorProfile: async (_: unknown, args: { address: string }, context: ResolverContext) => {
      // Would need SpectatorBetting.getBettorProfile() or indexer
      return null;
    },

    topBettors: async (_: unknown, args: { limit?: number }, context: ResolverContext) => {
      // Would need indexer
      return [];
    },

    // =========================================================================
    // Phase 2: Match Replay Queries
    // =========================================================================

    replayMetadata: async (_: unknown, args: { matchId: number }, context: ResolverContext) => {
      validateId(args.matchId, "match ID");
      const replay = await context.contractClient.getReplayData(args.matchId);
      if (!replay) return null;
      return {
        matchId: args.matchId,
        roundCount: replay.roundCount,
        available: replay.available,
        roundHashes: replay.roundStateHashes,
      };
    },

    matchReplay: async (_: unknown, args: { matchId: number }, context: ResolverContext) => {
      validateId(args.matchId, "match ID");
      // Try to get full replay data from SQLite stats_json
      const matchResult = context.matchStore?.getMatch(args.matchId);
      const matchData = await context.loaders.matchLoader.load(args.matchId);

      if (!matchData) return null;

      // Get on-chain replay metadata for verification hashes
      let metadata = null;
      try {
        const replayData = await context.contractClient.getReplayData(args.matchId);
        if (replayData) {
          metadata = {
            matchId: args.matchId,
            roundCount: replayData.roundCount,
            available: replayData.available,
            roundHashes: replayData.roundStateHashes,
          };
        }
      } catch { /* replay contract may not have data for this match */ }

      // Build rounds from SQLite stats_json (resultData from game engine)
      const stats = matchResult?.stats as Record<string, unknown> | undefined;
      const rounds: Array<{
        roundNumber: number;
        player1Action: string | null;
        player2Action: string | null;
        player1Score: number;
        player2Score: number;
        timestamp: number;
        stateHash: string;
      }> = [];

      if (stats) {
        const gameType = matchResult?.gameType ?? matchData.gameType;

        // StrategyArena: stats.rounds[] with player1Move, player2Move, payoffs
        if (gameType === 1 && Array.isArray(stats.rounds)) {
          let p1Cumulative = 0;
          let p2Cumulative = 0;
          for (const r of stats.rounds as Array<Record<string, unknown>>) {
            p1Cumulative += Number(r.player1Payoff ?? 0);
            p2Cumulative += Number(r.player2Payoff ?? 0);
            rounds.push({
              roundNumber: Number(r.round ?? rounds.length + 1),
              player1Action: r.player1Move != null ? String(r.player1Move) : null,
              player2Action: r.player2Move != null ? String(r.player2Move) : null,
              player1Score: p1Cumulative,
              player2Score: p2Cumulative,
              timestamp: 0,
              stateHash: metadata?.roundHashes?.[rounds.length] ?? "",
            });
          }
        }

        // AuctionWars: stats.rounds[] with bids, actualValue, scores
        else if (gameType === 2 && Array.isArray(stats.rounds)) {
          const players = [matchData.player1, matchData.player2];
          let p1Total = 0;
          let p2Total = 0;
          for (const r of stats.rounds as Array<Record<string, unknown>>) {
            const bids = r.bids as Record<string, string> | undefined;
            const scores = r.scores as Record<string, number> | undefined;
            p1Total += scores?.[players[0]] ?? 0;
            p2Total += scores?.[players[1]] ?? 0;
            rounds.push({
              roundNumber: Number(r.roundNumber ?? rounds.length + 1),
              player1Action: bids?.[players[0]] != null ? JSON.stringify({ bid: bids[players[0]], value: r.actualValue }) : null,
              player2Action: bids?.[players[1]] != null ? JSON.stringify({ bid: bids[players[1]], value: r.actualValue }) : null,
              player1Score: p1Total,
              player2Score: p2Total,
              timestamp: 0,
              stateHash: metadata?.roundHashes?.[rounds.length] ?? "",
            });
          }
        }

        // QuizBowl: stats.questions[] with playerAnswers
        else if (gameType === 3 && Array.isArray(stats.questions)) {
          const players = [matchData.player1, matchData.player2];
          let p1Score = 0;
          let p2Score = 0;
          for (const q of stats.questions as Array<Record<string, unknown>>) {
            const answers = q.playerAnswers as Record<string, number | null> | undefined;
            const correct = Number(q.correctAnswer);
            const p1Answered = answers?.[players[0]];
            const p2Answered = answers?.[players[1]];
            if (p1Answered === correct) p1Score++;
            if (p2Answered === correct) p2Score++;
            rounds.push({
              roundNumber: Number(q.index ?? rounds.length) + 1,
              player1Action: p1Answered != null ? JSON.stringify({ answer: p1Answered, correct, category: q.category, difficulty: q.difficulty }) : null,
              player2Action: p2Answered != null ? JSON.stringify({ answer: p2Answered, correct, category: q.category, difficulty: q.difficulty }) : null,
              player1Score: p1Score,
              player2Score: p2Score,
              timestamp: 0,
              stateHash: metadata?.roundHashes?.[rounds.length] ?? "",
            });
          }
        }

        // OracleDuel: single round with price data
        else if (gameType === 0) {
          rounds.push({
            roundNumber: 1,
            player1Action: stats.bullPlayer ? JSON.stringify({ position: "BULL", snapshotPrice: stats.snapshotPrice }) : null,
            player2Action: stats.bearPlayer ? JSON.stringify({ position: "BEAR", snapshotPrice: stats.snapshotPrice }) : null,
            player1Score: matchData.winner === matchData.player1 ? 1 : 0,
            player2Score: matchData.winner === matchData.player2 ? 1 : 0,
            timestamp: 0,
            stateHash: metadata?.roundHashes?.[0] ?? "",
          });
        }
      }

      // If no stats but we have on-chain metadata, generate stub rounds
      if (rounds.length === 0 && metadata?.available) {
        for (let i = 0; i < metadata.roundCount; i++) {
          rounds.push({
            roundNumber: i + 1,
            player1Action: null,
            player2Action: null,
            player1Score: 0,
            player2Score: 0,
            timestamp: 0,
            stateHash: metadata.roundHashes[i] ?? "",
          });
        }
      }

      return {
        matchId: args.matchId,
        gameType: gameTypeToEnum(matchData.gameType),
        player1: matchData.player1,
        player2: matchData.player2,
        winner: matchData.winner,
        rounds,
        totalDuration: matchResult?.duration ?? 0,
        metadata,
        rawStats: stats ? JSON.stringify(stats) : null,
      };
    },

    // =========================================================================
    // Analytics Dashboard
    // =========================================================================

    durationByGameType: async (_: unknown, __: unknown, context: ResolverContext) => {
      if (!context.matchStore) return [];
      return context.matchStore.getAverageDurationByGameType().map(d => ({
        gameType: gameTypeToEnum(d.gameType),
        averageDuration: d.avgDuration,
        matchCount: d.matchCount,
      }));
    },

    agentGameTypeStats: async (_: unknown, args: { address: string }, context: ResolverContext) => {
      if (!context.matchStore) return [];
      return context.matchStore.getAgentGameTypeStats(args.address).map(s => ({
        gameType: gameTypeToEnum(s.gameType),
        wins: s.wins,
        losses: s.losses,
        draws: s.draws,
        averageDuration: s.avgDuration,
        winRate: s.winRate,
      }));
    },

    agentStrategyPattern: async (_: unknown, args: { address: string }, context: ResolverContext) => {
      if (!context.matchStore) return null;
      return context.matchStore.getStrategyPatterns(args.address);
    },

    matchDurations: async (_: unknown, args: { limit?: number }, context: ResolverContext) => {
      if (!context.matchStore) return [];
      const all = context.matchStore.getAllMatchDurations();
      const safeLimit = clampLimit(args.limit);
      const limited = args.limit ? all.slice(-safeLimit) : all;
      return limited.map(d => ({
        matchId: d.matchId,
        gameType: gameTypeToEnum(d.gameType),
        duration: d.duration,
        timestamp: d.timestamp,
      }));
    },

    gameTypeLeaderboard: async (
      _: unknown,
      args: { gameType: string; limit?: number },
      context: ResolverContext
    ) => {
      if (!context.matchStore) return [];
      const gameTypeNum = enumToGameType(args.gameType);
      return context.matchStore.getGameTypeLeaderboard(gameTypeNum, clampLimit(args.limit));
    },

    agentBio: async (_: unknown, args: { address: string }, context: ResolverContext) => {
      if (!context.matchStore) return null;
      return context.matchStore.getAgentBio(args.address);
    },

    matchCommentary: async (
      _: unknown,
      args: { matchId: number; context: string },
      ctx: ResolverContext
    ) => {
      validateId(args.matchId, "match ID");
      if (!ctx.matchStore) return null;

      const analysisService = getClaudeAnalysisService();
      if (!analysisService || !analysisService.isEnabled()) return null;

      // Get match data from store
      const matches = ctx.matchStore.getAllMatchDurations();
      const matchEntry = matches.find((m) => m.matchId === args.matchId);

      // Build data for commentary
      const commentaryContext = args.context === "PRE_MATCH" ? "pre_match" : "post_match";

      const data: Record<string, unknown> = {
        matchId: args.matchId,
        gameType: matchEntry ? gameTypeToEnum(matchEntry.gameType) : "UNKNOWN",
      };

      try {
        const result = await analysisService.generateCommentary(
          commentaryContext as "pre_match" | "post_match",
          data
        );

        if (!result) return null;

        return {
          text: result.text,
          context: args.context,
          matchId: args.matchId,
          generatedAt: Math.floor(Date.now() / 1000),
          fromCache: result.fromCache,
        };
      } catch (err) {
        console.debug("[GraphQL] Commentary generation failed:", err);
        return null;
      }
    },

    // =========================================================================
    // ARENA Token
    // =========================================================================

    arenaToken: async (_: unknown, __: unknown, context: ResolverContext) => {
      if (!context.tokenManager) return null;
      return context.tokenManager.getTokenMetrics();
    },

    // =========================================================================
    // A2A Agent Discovery
    // =========================================================================

    discoveredAgents: (_: unknown, __: unknown, context: ResolverContext) => {
      if (!context.scheduler) return [];
      return context.scheduler.getDiscoveredAgents().map((a) => ({
        ...a,
        discoveredAt: Math.floor(a.discoveredAt / 1000),
      }));
    },

    discoveredAgentCount: (_: unknown, __: unknown, context: ResolverContext) => {
      return context.scheduler?.getDiscoveredAgentCount() ?? 0;
    },

    // ===== A2A Coordination Queries =====
    a2aMessages: (
      _: unknown,
      args: { agent?: string; limit?: number },
      context: ResolverContext
    ) => {
      if (!context.a2aCoordinator) return [];
      return context.a2aCoordinator.getMessages(args.agent ?? undefined, args.limit ?? undefined);
    },

    a2aChallenges: (
      _: unknown,
      args: { status?: string },
      context: ResolverContext
    ) => {
      if (!context.a2aCoordinator) return [];
      const challenges = context.a2aCoordinator.getChallenges(args.status ?? undefined);
      return challenges.map((c) => ({
        ...c,
        gameType: gameTypeToEnum(c.gameType),
        createdAt: Math.floor(c.createdAt / 1000),
        expiresAt: Math.floor(c.expiresAt / 1000),
      }));
    },

    agentRelationships: (
      _: unknown,
      args: { agent: string },
      context: ResolverContext
    ) => {
      if (!context.a2aCoordinator) return [];
      return context.a2aCoordinator.getRelationships(args.agent);
    },

    allRelationships: (_: unknown, __: unknown, context: ResolverContext) => {
      if (!context.a2aCoordinator) return [];
      return context.a2aCoordinator.getAllRelationships();
    },

    a2aNetworkStats: (_: unknown, __: unknown, context: ResolverContext) => {
      if (!context.a2aCoordinator) {
        return { totalAgents: 0, totalMessages: 0, activeChallenges: 0, activeAlliances: 0 };
      }
      return context.a2aCoordinator.getNetworkStats();
    },
  },

  // Field resolvers
  Tournament: {
    participants: async (parent: { id: number }, _: unknown, context: ResolverContext) => {
      const addresses = await context.loaders.tournamentParticipantsLoader.load(parent.id);
      const agents = await Promise.all(
        addresses.map((addr: string) => context.loaders.agentLoader.load(addr))
      );
      return agents.filter(Boolean).map((a: AgentData | null) => ({
        ...a,
        winRate: a!.matchesPlayed > 0 ? a!.wins / a!.matchesPlayed : 0,
      }));
    },

    matches: async (parent: { id: number }, _: unknown, context: ResolverContext) => {
      const matches = await context.loaders.tournamentMatchesLoader.load(parent.id);
      return matches.map((m: MatchData) => ({
        ...m,
        status: matchStatusToEnum(m.status),
        gameType: gameTypeToEnum(m.gameType),
      }));
    },

    standings: async (parent: { id: number }, _: unknown, context: ResolverContext) => {
      const addresses = await context.loaders.tournamentParticipantsLoader.load(parent.id);
      const matches = await context.loaders.tournamentMatchesLoader.load(parent.id);

      // Calculate standings
      const standings = addresses.map((addr: string) => {
        const agent = { address: addr, handle: addr.slice(0, 8), elo: 1200 };
        const normalAddr = normalizeAddress(addr);
        const wins = matches.filter((m: MatchData) => m.winner ? normalizeAddress(m.winner) === normalAddr : false).length;
        const losses = matches.filter(
          (m: MatchData) =>
            m.status === 2 &&
            m.winner &&
            normalizeAddress(m.winner) !== normalAddr &&
            (normalizeAddress(m.player1) === normalAddr ||
              normalizeAddress(m.player2) === normalAddr)
        ).length;

        return {
          address: addr,
          handle: agent.handle,
          elo: agent.elo,
          tournamentPoints: wins,
          eliminated: losses > 0, // Simplified for single elimination
        };
      });

      interface Standing {
        address: string;
        handle: string;
        elo: number;
        tournamentPoints: number;
        eliminated: boolean;
      }

      // Sort by points, then ELO
      standings.sort((a: Standing, b: Standing) => b.tournamentPoints - a.tournamentPoints || b.elo - a.elo);

      return standings.map((s: Standing, index: number) => ({
        ...s,
        rank: index + 1,
      }));
    },
  },

  Match: {
    player1Agent: async (parent: { player1: string }, _: unknown, context: ResolverContext) => {
      if (!parent.player1) return null;
      const agent = await context.loaders.agentLoader.load(parent.player1);
      if (!agent) return null;
      return {
        ...agent,
        winRate: agent.matchesPlayed > 0 ? agent.wins / agent.matchesPlayed : 0,
      };
    },

    player2Agent: async (parent: { player2: string }, _: unknown, context: ResolverContext) => {
      if (!parent.player2) return null;
      const agent = await context.loaders.agentLoader.load(parent.player2);
      if (!agent) return null;
      return {
        ...agent,
        winRate: agent.matchesPlayed > 0 ? agent.wins / agent.matchesPlayed : 0,
      };
    },
  },

  Agent: {
    avatarUrl: (parent: { address: string }, _: unknown, context: ResolverContext) => {
      return context.matchStore?.getAgentAvatar(parent.address) ?? null;
    },

    recentMatches: async (
      parent: { address: string },
      args: { limit?: number },
      context: ResolverContext
    ) => {
      // Would need agent match index
      return [];
    },

    tournaments: async (
      parent: { address: string },
      args: { limit?: number },
      context: ResolverContext
    ) => {
      // Would need agent tournament index
      return [];
    },
  },

  AdminMutation: {
    pauseTournament: async (
      _: unknown,
      args: { id: number },
      context: ResolverContext
    ) => {
      validateId(args.id, "tournament ID");
      if (!context.arenaManager) return null;
      await context.arenaManager.pauseTournament(args.id);
      const t = await context.loaders.tournamentLoader.load(args.id);
      if (!t) return null;
      return {
        ...t,
        status: tournamentStatusToEnum(t.status),
        gameType: gameTypeToEnum(t.gameType),
        format: tournamentFormatToEnum(t.format),
      };
    },

    resumeTournament: async (
      _: unknown,
      args: { id: number },
      context: ResolverContext
    ) => {
      validateId(args.id, "tournament ID");
      if (!context.arenaManager) return null;
      await context.arenaManager.resumeTournament(args.id);
      const t = await context.loaders.tournamentLoader.load(args.id);
      if (!t) return null;
      return {
        ...t,
        status: tournamentStatusToEnum(t.status),
        gameType: gameTypeToEnum(t.gameType),
        format: tournamentFormatToEnum(t.format),
      };
    },

    updateAgentAvatar: (
      _: unknown,
      args: { address: string; avatarUrl: string },
      context: ResolverContext
    ) => {
      if (!context.matchStore) return false;
      context.matchStore.setAgentAvatar(args.address, args.avatarUrl);
      return true;
    },

    createTournament: async (
      _: unknown,
      args: {
        input: {
          name: string;
          gameType: string;
          format: string;
          entryStake: string;
          maxParticipants: number;
          roundCount: number;
        };
      },
      context: ResolverContext
    ) => {
      if (!context.arenaManager) return null;

      const gameType = enumToGameType(args.input.gameType);
      const format = enumToTournamentFormat(args.input.format);

      const tournamentId = await context.arenaManager.createTournament({
        name: args.input.name,
        gameType,
        format,
        entryStake: BigInt(Math.floor(parseFloat(args.input.entryStake) * 1e18)),
        maxParticipants: args.input.maxParticipants,
        roundCount: args.input.roundCount,
        gameParameters: {},
      });

      const t = await context.loaders.tournamentLoader.load(tournamentId);
      if (!t) return null;
      return {
        ...t,
        status: tournamentStatusToEnum(t.status),
        gameType: gameTypeToEnum(t.gameType),
        format: tournamentFormatToEnum(t.format),
      };
    },

    buyArenaToken: async (
      _: unknown,
      args: { amountMON: string },
      context: ResolverContext
    ) => {
      if (!context.tokenManager) {
        throw new Error("Token manager not available");
      }
      if (!context.tokenManager.isLaunched()) {
        throw new Error("ARENA token not launched yet");
      }

      const amountWei = BigInt(Math.floor(parseFloat(args.amountMON) * 1e18));
      const txHash = await context.tokenManager.buyTokens(amountWei);
      return { txHash, success: true };
    },

    sellArenaToken: async (
      _: unknown,
      args: { amountTokens: string },
      context: ResolverContext
    ) => {
      if (!context.tokenManager) {
        throw new Error("Token manager not available");
      }
      if (!context.tokenManager.isLaunched()) {
        throw new Error("ARENA token not launched yet");
      }

      const amountWei = BigInt(Math.floor(parseFloat(args.amountTokens) * 1e18));
      const txHash = await context.tokenManager.sellTokens(amountWei);
      return { txHash, success: true };
    },

    // ===== A2A Coordination Mutations =====
    sendA2AChallenge: (
      _: unknown,
      args: { targetAgent: string; gameType: string; stake: string },
      context: ResolverContext
    ) => {
      if (!context.a2aCoordinator) throw new Error("A2A coordinator not available");
      const gameType = enumToGameType(args.gameType);
      const agentAddress = context.arenaManager
        ? "0x0000000000000000000000000000000000000000"
        : "0x0000000000000000000000000000000000000000";
      const challenge = context.a2aCoordinator.sendChallenge(
        agentAddress,
        args.targetAgent,
        gameType,
        args.stake
      );
      return {
        ...challenge,
        gameType: gameTypeToEnum(challenge.gameType),
        createdAt: Math.floor(challenge.createdAt / 1000),
        expiresAt: Math.floor(challenge.expiresAt / 1000),
      };
    },

    respondToChallenge: async (
      _: unknown,
      args: { challengeId: number; accept: boolean },
      context: ResolverContext
    ) => {
      validateId(args.challengeId, "challenge ID");
      if (!context.a2aCoordinator) throw new Error("A2A coordinator not available");
      const challenge = await context.a2aCoordinator.respondToChallenge(
        args.challengeId,
        args.accept
      );
      return {
        ...challenge,
        gameType: gameTypeToEnum(challenge.gameType),
        createdAt: Math.floor(challenge.createdAt / 1000),
        expiresAt: Math.floor(challenge.expiresAt / 1000),
      };
    },
  },
};
