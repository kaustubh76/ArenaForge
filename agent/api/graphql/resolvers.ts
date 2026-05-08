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
import { sanitizeText } from "../../utils/sanitize";
import { type AuthContext, assertAdmin } from "../auth";
import { getLogger } from "../../utils/logger";
import { validateAvatarUrl } from "../../validation";

const log = getLogger("Resolvers");

export interface ResolverContext {
  loaders: DataLoaders;
  contractClient: MonadContractClient;
  matchStore: MatchStore | null;
  arenaManager?: ArenaManager;
  tokenManager?: TokenManager;
  scheduler?: AutonomousScheduler;
  a2aCoordinator?: A2ACoordinator;
  auth?: AuthContext;
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

      const limit = clampLimit(args.limit);
      const offset = clampOffset(args.offset);

      // Use actual tournament count from contract (no hardcoded limit)
      const maxScan = count;
      for (let i = 1; i <= maxScan; i++) {
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
      validateId(args.id, "match ID");
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
      const limit = clampLimit(args.limit, 20);

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

    // Agent queries — combines on-chain discovered agents + seeded cache
    agents: async (
      _: unknown,
      args: { limit?: number; offset?: number; sortBy?: string },
      context: ResolverContext
    ) => {
      const limit = clampLimit(args.limit ?? 50);
      const offset = clampOffset(args.offset ?? 0);

      // Collect all known agents from scheduler (on-chain discovered)
      const discovered = context.scheduler?.getDiscoveredAgents() ?? [];
      const allAddresses = new Set<string>();
      for (const d of discovered) allAddresses.add(d.address.toLowerCase());

      // Load agent data via dataloader (contract + seeded fallback)
      const agents = await Promise.all(
        Array.from(allAddresses).map((addr) => context.loaders.agentLoader.load(addr))
      );

      const valid = agents.filter((a): a is NonNullable<typeof a> => a !== null);

      // Sort
      const sortBy = args.sortBy || "ELO";
      valid.sort((a, b) => {
        switch (sortBy) {
          case "WINS": return b.wins - a.wins;
          case "MATCHES_PLAYED": return b.matchesPlayed - a.matchesPlayed;
          case "WIN_RATE": {
            const wrA = a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0;
            const wrB = b.matchesPlayed > 0 ? b.wins / b.matchesPlayed : 0;
            return wrB - wrA;
          }
          default: return b.elo - a.elo;
        }
      });

      return valid.slice(offset, offset + limit).map((a) => ({
        ...a,
        winRate: a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0,
      }));
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

    // Leaderboard — uses discovered agents + seeded cache
    leaderboard: async (
      _: unknown,
      args: { gameType?: string; limit?: number; offset?: number },
      context: ResolverContext
    ) => {
      const limit = clampLimit(args.limit ?? 20);
      const offset = clampOffset(args.offset ?? 0);

      // Collect all known agent addresses (on-chain discovered)
      const discovered = context.scheduler?.getDiscoveredAgents() ?? [];
      const allAddresses = new Set<string>();
      for (const d of discovered) allAddresses.add(d.address.toLowerCase());

      // Load and filter
      const agents = await Promise.all(
        Array.from(allAddresses).map((addr) => context.loaders.agentLoader.load(addr))
      );

      const valid = agents.filter((a): a is NonNullable<typeof a> => a !== null && a.matchesPlayed > 0);

      // Sort by ELO descending
      valid.sort((a, b) => b.elo - a.elo);

      const total = valid.length;
      const page = valid.slice(offset, offset + limit);

      return {
        entries: page.map((a, i) => ({
          rank: offset + i + 1,
          agent: {
            ...a,
            winRate: a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0,
          },
        })),
        total,
        hasMore: offset + limit < total,
      };
    },

    // Evolution history — from real EvolutionEngine records
    evolutionHistory: async (
      _: unknown,
      args: { tournamentId: number },
      context: ResolverContext
    ) => {
      // Use real evolution records from the ArenaManager's evolution engine
      if (context.arenaManager) {
        const records = context.arenaManager.getEvolutionHistory(args.tournamentId);
        if (records.length > 0) {
          return records.map(r => ({
            tournamentId: r.tournamentId,
            round: r.round,
            previousParamsHash: r.previousParamsHash,
            newParamsHash: r.newParamsHash,
            mutations: r.mutations.map(m => ({
              type: m.type,
              factor: m.factor,
              increment: m.increment,
              strategy: m.strategy,
              reason: m.reason,
            })),
            metrics: {
              averageStakeBehavior: r.metrics.averageStakeBehavior,
              dominantStrategy: r.metrics.dominantStrategy,
              strategyDistribution: typeof r.metrics.strategyDistribution === "string"
                ? r.metrics.strategyDistribution
                : JSON.stringify(r.metrics.strategyDistribution),
              averageMatchDuration: r.metrics.averageMatchDuration,
              drawRate: r.metrics.drawRate,
            },
            timestamp: r.timestamp,
          }));
        }
      }

      // No real on-chain evolution records exist for this tournament. Return
      // an empty list rather than fabricating entries from match-result
      // aggregates: those would carry empty paramsHashes and made-up
      // mutation factors that look like real evolution events but aren't.
      // Frontend renders an empty state when this is [].
      log.debug("evolutionHistory: no on-chain records for tournament", {
        tournamentId: args.tournamentId,
      });
      return [];
    },

    // Arena stats
    arenaStats: async (_: unknown, __: unknown, context: ResolverContext) => {
      const tournamentCount = await context.contractClient.getTournamentCount();
      const matchCount = await context.contractClient.getMatchCount();

      let activeTournaments = 0;
      let liveMatchCount = 0;
      let totalPrize = BigInt(0);
      for (let i = 1; i <= tournamentCount; i++) {
        const t = await context.loaders.tournamentLoader.load(i);
        if (t && (t.status === 0 || t.status === 1)) {
          activeTournaments++;
        }
        if (t && t.status === 2) {
          totalPrize += BigInt(t.prizePool || "0");
        }
      }

      for (let i = Math.max(1, matchCount - 50); i <= matchCount; i++) {
        const m = await context.loaders.matchLoader.load(i);
        if (m && m.status === 1) {
          liveMatchCount++;
        }
      }

      // Use scheduler discovered agents count
      const discoveredAgents = context.scheduler?.getDiscoveredAgents() ?? [];
      const totalAgents = discoveredAgents.length;

      // Supplement match count with SQLite matches if higher
      const sqliteMatchCount = context.matchStore?.getRecentMatches(9999).length ?? 0;
      const totalMatches = Math.max(matchCount, sqliteMatchCount);

      return {
        totalTournaments: tournamentCount,
        activeTournaments,
        totalMatches,
        liveMatches: liveMatchCount,
        totalAgents,
        totalPrizeDistributed: totalPrize.toString(),
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

      // Count unique participants from match store during this season
      let participantCount = 0;
      if (context.matchStore) {
        const allMatches = context.matchStore.getRecentMatches(9999);
        const uniqueAgents = new Set<string>();
        for (const m of allMatches) {
          const ts = m.createdAt ?? 0;
          if (ts >= season.startTime && (season.endTime === 0 || ts <= season.endTime)) {
            if (m.winner) uniqueAgents.add(m.winner.toLowerCase());
            if (m.loser) uniqueAgents.add(m.loser.toLowerCase());
          }
        }
        participantCount = uniqueAgents.size;
      } else {
        // Fallback: count discovered agents
        participantCount = context.scheduler?.getDiscoveredAgents()?.length ?? 0;
      }

      return { ...season, participantCount };
    },

    season: async (_: unknown, args: { id: number }, context: ResolverContext) => {
      validateId(args.id, "season ID");
      const season = await context.contractClient.getCurrentSeason();
      if (!season || season.id !== args.id) return null;

      let participantCount = 0;
      if (context.matchStore) {
        const allMatches = context.matchStore.getRecentMatches(9999);
        const uniqueAgents = new Set<string>();
        for (const m of allMatches) {
          const ts = m.createdAt ?? 0;
          if (ts >= season.startTime && (season.endTime === 0 || ts <= season.endTime)) {
            if (m.winner) uniqueAgents.add(m.winner.toLowerCase());
            if (m.loser) uniqueAgents.add(m.loser.toLowerCase());
          }
        }
        participantCount = uniqueAgents.size;
      }

      return { ...season, participantCount };
    },

    seasonalProfile: async (
      _: unknown,
      args: { seasonId: number; address: string },
      context: ResolverContext
    ) => {
      validateId(args.seasonId, "season ID");
      validateAddress(args.address);

      // Get on-chain agent data for current ELO
      const agent = await context.loaders.agentLoader.load(args.address);
      if (!agent) return null;

      // Get season time range to filter matches
      const season = await context.contractClient.getCurrentSeason();
      if (!season || season.id !== args.seasonId) return null;

      // Compute real seasonal stats from match store
      const addr = args.address.toLowerCase();
      let seasonWins = 0;
      let seasonLosses = 0;
      let seasonMatches = 0;
      let peakElo = agent.elo;

      if (context.matchStore) {
        const allMatches = context.matchStore.getMatchesByAgent(args.address);
        // Filter to matches within the season time range
        const seasonStart = season.startTime;
        const seasonEnd = season.endTime;
        for (const m of allMatches) {
          const ts = m.createdAt ?? 0;
          if (ts >= seasonStart && (seasonEnd === 0 || ts <= seasonEnd)) {
            seasonMatches++;
            if (m.winner && m.winner.toLowerCase() === addr) seasonWins++;
            else if (!m.isDraw) seasonLosses++;
          }
        }
        // Estimate peak ELO: current ELO + margin based on win rate
        // A more accurate peak would require tracking ELO per match, but this is reasonable
        if (seasonMatches > 0 && seasonWins > seasonLosses) {
          peakElo = Math.max(agent.elo, agent.elo + Math.round((seasonWins - seasonLosses) * 4));
        }
      } else {
        // Fallback to on-chain totals
        seasonMatches = agent.matchesPlayed;
        seasonWins = agent.wins;
        seasonLosses = agent.losses;
      }

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
        peakElo,
        matchesPlayed: seasonMatches,
        wins: seasonWins,
        losses: seasonLosses,
        tier: rankTierToEnum(tier),
        placementComplete: seasonMatches >= 5,
        placementMatches: Math.min(seasonMatches, 5),
      };
    },

    mySeasonalProfile: async (
      _: unknown,
      args: { seasonId: number },
      context: ResolverContext
    ) => {
      // Use the arena agent's own address for its seasonal profile
      const agentAddr = context.arenaManager?.agentAddress;
      if (!agentAddr) return null;
      // Delegate to seasonalProfile resolver
      return resolvers.Query.seasonalProfile(null, { seasonId: args.seasonId, address: agentAddr }, context);
    },

    seasonalLeaderboard: async (
      _: unknown,
      args: { seasonId: number; limit?: number; offset?: number },
      context: ResolverContext
    ) => {
      const limit = clampLimit(args.limit ?? 50);
      const offset = clampOffset(args.offset ?? 0);

      // Reuse discovered agents from scheduler + dataloaders
      const discovered = context.scheduler?.getDiscoveredAgents() ?? [];
      const allAddresses = new Set<string>();
      for (const d of discovered) allAddresses.add(d.address.toLowerCase());

      const agents = await Promise.all(
        Array.from(allAddresses).map((addr) => context.loaders.agentLoader.load(addr))
      );

      const valid = agents.filter((a): a is NonNullable<typeof a> => a !== null && a.matchesPlayed > 0);
      valid.sort((a, b) => b.elo - a.elo);

      const page = valid.slice(offset, offset + limit);

      return page.map((a, i) => {
        let tier: string;
        if (a.elo >= 1500) tier = "DIAMOND";
        else if (a.elo >= 1400) tier = "PLATINUM";
        else if (a.elo >= 1300) tier = "GOLD";
        else if (a.elo >= 1200) tier = "SILVER";
        else if (a.elo >= 1100) tier = "BRONZE";
        else tier = "IRON";

        return {
          rank: offset + i + 1,
          address: a.address,
          handle: a.moltbookHandle,
          seasonalElo: a.elo,
          tier,
          wins: a.wins,
          losses: a.losses,
        };
      });
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
      if (!context.matchStore) return [];
      const limit = clampLimit(args.limit, 50);
      const bets = context.matchStore.getBetsByUser(args.address, args.status, limit);
      return bets.map((b) => ({
        matchId: b.matchId,
        bettor: b.bettor,
        predictedWinner: b.predictedWinner,
        amount: b.amount,
        status: b.status === "won" ? "WON" : b.status === "lost" ? "LOST" : b.status === "refunded" ? "REFUNDED" : "ACTIVE",
        payout: b.payout,
        timestamp: b.createdAt,
      }));
    },

    bettorProfile: async (_: unknown, args: { address: string }, context: ResolverContext) => {
      if (!context.matchStore) return null;
      const allBets = context.matchStore.getBetsByUser(args.address, undefined, 10000);
      if (allBets.length === 0) return null;

      let wins = 0, losses = 0, totalWagered = BigInt(0), totalWon = BigInt(0), currentStreak = 0;
      let streakType: "win" | "loss" | null = null;

      for (const b of allBets) {
        const amt = BigInt(b.amount || "0");
        totalWagered += amt;
        if (b.status === "won") {
          wins++;
          totalWon += BigInt(b.payout || "0");
          if (streakType === "win") currentStreak++;
          else { streakType = "win"; currentStreak = 1; }
        } else if (b.status === "lost") {
          losses++;
          if (streakType === "loss") currentStreak--;
          else { streakType = "loss"; currentStreak = -1; }
        }
      }

      return {
        address: args.address,
        totalBets: allBets.length,
        wins,
        losses,
        totalWagered: totalWagered.toString(),
        totalWon: totalWon.toString(),
        currentStreak,
        winRate: allBets.length > 0 ? wins / allBets.length : 0,
      };
    },

    topBettors: async (_: unknown, args: { limit?: number }, context: ResolverContext) => {
      const limit = clampLimit(args.limit ?? 20);

      // Build bettor profiles from match participation data
      const discovered = context.scheduler?.getDiscoveredAgents() ?? [];
      const allAddresses = new Set<string>();
      for (const d of discovered) allAddresses.add(d.address.toLowerCase());

      const agents = await Promise.all(
        Array.from(allAddresses).map((addr) => context.loaders.agentLoader.load(addr))
      );

      const valid = agents.filter((a): a is NonNullable<typeof a> => a !== null && a.matchesPlayed > 0);
      valid.sort((a, b) => b.wins - a.wins);

      return valid.slice(0, limit).map((a) => {
        const winRate = a.matchesPlayed > 0 ? a.wins / a.matchesPlayed : 0;
        return {
          address: a.address,
          totalBets: a.matchesPlayed,
          wins: a.wins,
          losses: a.losses,
          totalWagered: "0",
          totalWon: "0",
          currentStreak: 0,
          winRate,
        };
      });
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
      } catch (err) {
        // Replay contract may not have data for this match — log for debugging
        console.debug(`[GraphQL] Replay data unavailable for match #${args.matchId}:`, err);
      }

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

      // If no stats, try to get live game state from on-chain contracts
      if (rounds.length === 0) {
        try {
          if (matchData.gameType === 1) {
            // StrategyArena — fetch on-chain match state for scores
            const state = await context.contractClient.getStrategyMatchState(args.matchId);
            if (state) {
              for (let i = 0; i < Number(state.currentRound); i++) {
                rounds.push({
                  roundNumber: i + 1,
                  player1Action: null,
                  player2Action: null,
                  player1Score: i === Number(state.currentRound) - 1 ? Number(state.player1Score) : 0,
                  player2Score: i === Number(state.currentRound) - 1 ? Number(state.player2Score) : 0,
                  timestamp: 0,
                  stateHash: metadata?.roundHashes?.[i] ?? "",
                });
              }
            }
          } else if (matchData.gameType === 0) {
            // OracleDuel — fetch duel data
            const duelRaw = await context.contractClient.getDuel(args.matchId);
            if (duelRaw) {
              const duel = duelRaw as { snapshotPrice: bigint; resolutionTime: bigint; resolved: boolean };
              rounds.push({
                roundNumber: 1,
                player1Action: JSON.stringify({ position: "BULL", snapshotPrice: duel.snapshotPrice.toString() }),
                player2Action: JSON.stringify({ position: "BEAR", snapshotPrice: duel.snapshotPrice.toString() }),
                player1Score: matchData.winner === matchData.player1 ? 1 : 0,
                player2Score: matchData.winner === matchData.player2 ? 1 : 0,
                timestamp: Number(duel.resolutionTime),
                stateHash: metadata?.roundHashes?.[0] ?? "",
              });
            }
          }
        } catch (error) {
          log.warn("matchReplay: on-chain state query failed", { matchId: args.matchId, error });
        }

        // No fabricated stub rounds. If on-chain state is unreachable AND we
        // have no persisted match stats, the rounds list stays empty. The
        // GraphQL `metadata` field still surfaces the on-chain hashes so a
        // client can verify integrity later, but we do NOT manufacture
        // round entries with null actions and zero scores.
        if (rounds.length === 0) {
          log.debug("matchReplay: no round data available", {
            matchId: args.matchId,
            metadataAvailable: metadata?.available ?? false,
            metadataRoundCount: metadata?.roundCount ?? 0,
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
      if (!context.matchStore) return [];
      const limit = clampLimit(args.limit, 10);
      const matches = context.matchStore.getMatchesByAgent(parent.address);
      return matches.slice(0, limit).map((r) => ({
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
    },

    tournaments: async (
      parent: { address: string },
      args: { limit?: number },
      context: ResolverContext
    ) => {
      const limit = clampLimit(args.limit, 10);
      const addr = parent.address.toLowerCase();
      const result: Array<Record<string, unknown>> = [];

      try {
        const count = await context.contractClient.getTournamentCount();
        for (let i = 1; i <= count && result.length < limit; i++) {
          const participants = await context.loaders.tournamentParticipantsLoader.load(i);
          if (participants.some((p) => p.toLowerCase() === addr)) {
            const t = await context.loaders.tournamentLoader.load(i);
            if (t) {
              result.push({
                ...t,
                status: tournamentStatusToEnum(t.status),
                gameType: gameTypeToEnum(t.gameType),
                format: tournamentFormatToEnum(t.format),
              });
            }
          }
        }
      } catch (err) {
        console.debug(`[GraphQL] Agent.tournaments lookup failed:`, err);
      }

      return result;
    },
  },

  AdminMutation: {
    pauseTournament: async (
      _: unknown,
      args: { id: number },
      context: ResolverContext
    ) => {
      assertAdmin(context, "pauseTournament");
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
      assertAdmin(context, "resumeTournament");
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
      const result = validateAvatarUrl(args.avatarUrl);
      if (!result.ok) throw new Error(result.error);
      context.matchStore.setAgentAvatar(args.address, result.url);
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
      assertAdmin(context, "createTournament");
      if (!context.arenaManager) return null;

      // Sanitize + validate tournament name. sanitizeText strips control
      // chars and normalizes whitespace; the existing length check then runs
      // against the cleaned value.
      const name = sanitizeText(args.input.name, 256);
      if (!name) throw new Error("Tournament name is required");
      const byteLength = Buffer.byteLength(name, "utf8");
      if (byteLength > 256) throw new Error(`Tournament name too long (${byteLength} bytes, max 256)`);

      const gameType = enumToGameType(args.input.gameType);
      const format = enumToTournamentFormat(args.input.format);

      const tournamentId = await context.arenaManager.createTournament({
        name,
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
      const agentAddress = context.arenaManager?.agentAddress;
      if (!agentAddress) throw new Error("Agent address not available");
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
