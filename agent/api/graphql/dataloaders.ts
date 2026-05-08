// DataLoader implementations for batched data fetching

import DataLoader from "dataloader";
import type { MonadContractClient } from "../../monad/contract-client";
import type { MatchStore } from "../../persistence/match-store";
import { normalizeAddress } from "../../utils/normalize";
import { getLogger } from "../../utils/logger";
import { AgentReadSchema, normalizeAgentRead } from "../../schemas/contracts";

const log = getLogger("DataLoader");

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
            const parsed = AgentReadSchema.safeParse(raw);
            if (!parsed.success) {
              log.warn("agentLoader: contract response failed schema validation", {
                address: addr,
                issues: parsed.error.issues,
              });
              return null;
            }
            const { handle, elo, matchesPlayed, wins, losses } = normalizeAgentRead(parsed.data);
            // Treat agent as registered only if it has a real handle
            // (contract returns "" or sometimes a placeholder for unregistered).
            const placeholder = addr.slice(0, 8);
            const isRegistered = handle.length > 0 && handle !== placeholder;
            if (isRegistered) {
              return {
                address: normalizeAddress(addr),
                moltbookHandle: handle,
                elo,
                matchesPlayed,
                wins,
                losses,
                registered: true,
              };
            }
          } catch (error) {
            // Unregistered agents legitimately throw on getAgent. Use debug
            // level so the noise is gated behind LOG_LEVEL=debug.
            log.debug("agentLoader: contract getAgent failed", { address: addr, error });
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
          } catch (error) {
            log.error("tournamentLoader: contract getTournament failed", { tournamentId: id, error });
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
            } catch (error) {
              log.warn("matchLoader: nested tournament load failed; defaulting gameType=0", {
                matchId: id,
                tournamentId,
                error,
              });
            }
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
          } catch (error) {
            log.error("matchLoader: contract getMatch failed", { matchId: id, error });
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
          } catch (error) {
            log.error("tournamentParticipantsLoader: contract read failed", {
              tournamentId: id,
              error,
            });
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
