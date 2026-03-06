// DataLoader implementations for batched data fetching

import DataLoader from "dataloader";
import type { MonadContractClient } from "../../monad/contract-client";
import type { MatchStore } from "../../persistence/match-store";
import { normalizeAddress } from "../../utils/normalize";

export interface DataLoaders {
  agentLoader: DataLoader<string, AgentData | null>;
  tournamentLoader: DataLoader<number, TournamentData | null>;
  matchLoader: DataLoader<number, MatchData | null>;
  tournamentMatchesLoader: DataLoader<number, MatchData[]>;
  tournamentParticipantsLoader: DataLoader<number, string[]>;
}

export interface AgentData {
  address: string;
  moltbookHandle: string;
  elo: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  registered: boolean;
}

export interface TournamentData {
  id: number;
  name: string;
  gameType: number;
  format: number;
  status: number;
  entryStake: string;
  maxParticipants: number;
  currentParticipants: number;
  prizePool: string;
  startTime: number;
  roundCount: number;
  currentRound: number;
  parametersHash: string;
}

export interface MatchData {
  id: number;
  tournamentId: number;
  round: number;
  player1: string;
  player2: string;
  winner: string | null;
  resultHash: string;
  timestamp: number;
  startTime: number;
  status: number;
  gameType: number;
  isDraw: boolean;
  isUpset: boolean;
  duration: number;
}

export function createDataLoaders(
  contractClient: MonadContractClient,
  matchStore: MatchStore | null
): DataLoaders {
  // Batch load agents by address
  const agentLoader = new DataLoader<string, AgentData | null>(
    async (addresses: readonly string[]) => {
      const results = await Promise.all(
        addresses.map(async (addr: string) => {
          try {
            const raw = await contractClient.getAgent(addr);
            const agent = raw as Record<string, unknown>;
            if (agent) {
              const handle = String(agent.moltbookHandle || addr.slice(0, 8));
              // Contract struct may have swapped elo/matchesPlayed layout
              // Detect swap: if matchesPlayed looks like an ELO (≥1000) and elo looks like a count (<1000)
              let elo = Number(agent.elo ?? 1200);
              let matchesPlayed = Number(agent.matchesPlayed ?? 0);
              if (matchesPlayed >= 1000 && elo < 1000 && matchesPlayed > elo) {
                // Values are swapped due to ABI/struct mismatch
                [elo, matchesPlayed] = [matchesPlayed, elo];
              }
              const wins = Number(agent.wins ?? 0);
              const losses = Number(agent.losses ?? 0);
              // Treat agent as registered if it has a non-empty handle
              const isRegistered = handle.length > 0 && handle !== addr.slice(0, 8);
              if (isRegistered) {
                return {
                  address: normalizeAddress(addr),
                  moltbookHandle: handle,
                  elo: elo || 1200,
                  matchesPlayed,
                  wins,
                  losses,
                  registered: true,
                };
              }
            }
          } catch (err) {
            console.debug(`[DataLoader] Contract getAgent failed for ${addr.slice(0, 10)}...:`, err);
          }

          // No fallback — only real on-chain agents
          return null;
        })
      );
      return results;
    },
    {
      cacheKeyFn: (key: string) => normalizeAddress(key),
    }
  );

  // Batch load tournaments by ID
  const tournamentLoader = new DataLoader<number, TournamentData | null>(
    async (ids: readonly number[]) => {
      const results = await Promise.all(
        ids.map(async (id: number) => {
          try {
            const tournament = await contractClient.getTournament(id) as Record<string, unknown>;
            return {
              id,
              name: String(tournament.name),
              gameType: Number(tournament.gameType),
              format: Number(tournament.format),
              status: Number(tournament.status),
              entryStake: String(tournament.entryStake),
              maxParticipants: Number(tournament.maxParticipants),
              currentParticipants: Number(tournament.currentParticipants),
              prizePool: String(tournament.prizePool ?? "0"),
              startTime: Number(tournament.startTime),
              roundCount: Number(tournament.roundCount),
              currentRound: Number(tournament.currentRound),
              parametersHash: String(tournament.parametersHash ?? ""),
            };
          } catch {
            return null;
          }
        })
      );
      return results;
    }
  );

  // Batch load matches by ID
  const matchLoader = new DataLoader<number, MatchData | null>(
    async (ids: readonly number[]) => {
      const results = await Promise.all(
        ids.map(async (id: number) => {
          // Try SQLite store first (for completed matches)
          if (matchStore) {
            const raw = matchStore.getMatchRaw(id);
            if (raw) {
              return {
                id: raw.result.matchId,
                tournamentId: raw.result.tournamentId,
                round: raw.result.round,
                player1: raw.player1,
                player2: raw.player2,
                winner: raw.result.winner,
                resultHash: "",
                timestamp: 0,
                startTime: 0,
                status: 2, // Completed
                gameType: raw.result.gameType,
                isDraw: raw.result.isDraw,
                isUpset: raw.result.isUpset,
                duration: raw.result.duration,
              };
            }
          }

          // Fallback to contract for live/in-progress matches
          try {
            const match = await contractClient.getMatch(id) as Record<string, unknown>;
            const tournamentId = Number(match.tournamentId);
            // Resolve gameType from tournament data
            let gameType = 0;
            try {
              const t = await tournamentLoader.load(tournamentId);
              if (t) gameType = t.gameType;
            } catch {}
            return {
              id,
              tournamentId,
              round: Number(match.round),
              player1: String(match.player1),
              player2: String(match.player2),
              winner: match.winner ? String(match.winner) : null,
              resultHash: String(match.resultHash ?? ""),
              timestamp: Number(match.timestamp),
              startTime: Number(match.startTime ?? 0),
              status: Number(match.status),
              gameType,
              isDraw: false,
              isUpset: false,
              duration: Number(match.duration ?? 0),
            };
          } catch {
            return null;
          }
        })
      );
      return results;
    }
  );

  // Batch load matches for tournaments
  const tournamentMatchesLoader = new DataLoader<number, MatchData[]>(
    async (tournamentIds: readonly number[]) => {
      if (matchStore) {
        return tournamentIds.map((id: number) => {
          const results = matchStore.getMatchesByTournament(id);
          return results.map((r) => {
            // Get raw data with preserved player order
            const raw = matchStore.getMatchRaw(r.matchId);
            return {
              id: r.matchId,
              tournamentId: r.tournamentId,
              round: r.round,
              player1: raw?.player1 ?? r.loser ?? "",
              player2: raw?.player2 ?? r.winner ?? "",
              winner: r.winner,
              resultHash: "",
              timestamp: 0,
              startTime: 0,
              status: 2,
              gameType: r.gameType,
              isDraw: r.isDraw,
              isUpset: r.isUpset,
              duration: r.duration,
            };
          });
        });
      }
      return tournamentIds.map(() => []);
    }
  );

  // Batch load participants for tournaments
  const tournamentParticipantsLoader = new DataLoader<number, string[]>(
    async (tournamentIds: readonly number[]) => {
      const results = await Promise.all(
        tournamentIds.map(async (id: number) => {
          try {
            return await contractClient.getTournamentParticipants(id);
          } catch {
            return [];
          }
        })
      );
      return results;
    }
  );

  return {
    agentLoader,
    tournamentLoader,
    matchLoader,
    tournamentMatchesLoader,
    tournamentParticipantsLoader,
  };
}
