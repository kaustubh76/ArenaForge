import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Tournament, TournamentWithStandings, TournamentFormat,
  GameType, TournamentStatus, MatchStatus, Match, AgentStanding, RoundData,
  Bracket, BracketMatch, BracketRound, SeriesData, RoundRobinStanding,
  PentathlonStanding, RumbleParticipant,
} from '@/types/arena';
import {
  fetchAllTournaments, fetchMatchesForTournament,
  fetchTournamentParticipants, fetchAgentsFromTournaments,
} from '@/lib/contracts';
import { indexedDBStorage, isCacheFresh, isOnline } from '@/lib/indexeddb-storage';
import { fetchGraphQL } from '@/lib/api';

// =========================================================================
// Format-Specific Data Builders
// =========================================================================

/**
 * Build Double Elimination bracket structure from matches
 */
function buildDoubleEliminationBracket(
  matches: Match[],
  _participants: string[],
  _agentMap: Map<string, { moltbookHandle?: string }>
): Bracket {
  // Separate matches by bracket type (winners vs losers)
  // Convention: rounds 1-N are winners, rounds with negative numbers or high numbers are losers
  const winnerMatches = matches.filter(m => m.round > 0 && m.round <= 10);
  const loserMatches = matches.filter(m => m.round > 10);

  const buildRounds = (roundMatches: Match[]): BracketRound[] => {
    const roundMap = new Map<number, Match[]>();
    roundMatches.forEach(m => {
      const arr = roundMap.get(m.round) ?? [];
      arr.push(m);
      roundMap.set(m.round, arr);
    });

    return Array.from(roundMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([roundNumber, rMatches]) => ({
        roundNumber,
        matches: rMatches.map(m => ({
          matchId: m.id,
          player1: m.player1,
          player2: m.player2,
          winner: m.winner,
          completed: m.status === MatchStatus.Completed,
        } as BracketMatch)),
      }));
  };

  const winnersBracket = buildRounds(winnerMatches);
  const losersBracket = loserMatches.length > 0 ? buildRounds(loserMatches) : undefined;

  // Determine current phase
  const allWinnersComplete = winnerMatches.every(m => m.status === MatchStatus.Completed);
  const allLosersComplete = loserMatches.every(m => m.status === MatchStatus.Completed);
  let currentPhase: 'winners' | 'losers' | 'finals' = 'winners';
  if (allWinnersComplete && !allLosersComplete) currentPhase = 'losers';
  else if (allWinnersComplete && allLosersComplete) currentPhase = 'finals';

  return { winnersBracket, losersBracket, currentPhase };
}

/**
 * Build Round Robin standings from matches
 */
function buildRoundRobinStandings(
  matches: Match[],
  participants: string[],
  agentMap: Map<string, { moltbookHandle?: string }>
): RoundRobinStanding[] {
  const stats = new Map<string, { wins: number; losses: number; draws: number; gamesPlayed: number }>();

  // Initialize all participants
  participants.forEach(p => {
    stats.set(p.toLowerCase(), { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 });
  });

  // Process matches
  matches.forEach(m => {
    if (m.status !== MatchStatus.Completed) return;

    const p1 = m.player1.toLowerCase();
    const p2 = m.player2.toLowerCase();
    const s1 = stats.get(p1);
    const s2 = stats.get(p2);

    if (s1) s1.gamesPlayed++;
    if (s2) s2.gamesPlayed++;

    if (m.winner === null) {
      // Draw
      if (s1) s1.draws++;
      if (s2) s2.draws++;
    } else {
      const winnerLower = m.winner.toLowerCase();
      if (winnerLower === p1) {
        if (s1) s1.wins++;
        if (s2) s2.losses++;
      } else {
        if (s2) s2.wins++;
        if (s1) s1.losses++;
      }
    }
  });

  return participants.map(p => {
    const s = stats.get(p.toLowerCase()) ?? { wins: 0, losses: 0, draws: 0, gamesPlayed: 0 };
    const agent = agentMap.get(p.toLowerCase());
    return {
      agentAddress: p,
      handle: agent?.moltbookHandle ?? p.slice(0, 8),
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      points: s.wins * 3 + s.draws, // Standard points: 3 for win, 1 for draw
      gamesPlayed: s.gamesPlayed,
    };
  }).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

/**
 * Build Best-of-N series data from matches
 */
function buildSeriesData(
  matches: Match[],
  _participants: string[],
  winsRequired: number = 2 // Default Bo3
): SeriesData[] {
  // Group matches by player pairs
  const seriesMap = new Map<string, Match[]>();

  matches.forEach(m => {
    const key = [m.player1.toLowerCase(), m.player2.toLowerCase()].sort().join('-');
    const arr = seriesMap.get(key) ?? [];
    arr.push(m);
    seriesMap.set(key, arr);
  });

  let seriesId = 0;
  return Array.from(seriesMap.entries()).map(([_, seriesMatches]) => {
    const p1 = seriesMatches[0].player1;
    const p2 = seriesMatches[0].player2;
    let p1Wins = 0;
    let p2Wins = 0;

    seriesMatches.forEach(m => {
      if (m.status !== MatchStatus.Completed || !m.winner) return;
      if (m.winner.toLowerCase() === p1.toLowerCase()) p1Wins++;
      else p2Wins++;
    });

    const completed = p1Wins >= winsRequired || p2Wins >= winsRequired;
    const winner = p1Wins >= winsRequired ? p1 : p2Wins >= winsRequired ? p2 : null;

    return {
      seriesId: seriesId++,
      tournamentId: seriesMatches[0].tournamentId,
      player1: p1,
      player2: p2,
      winsRequired,
      player1Wins: p1Wins,
      player2Wins: p2Wins,
      completed,
      winner,
    };
  });
}

/**
 * Build Royal Rumble participant data
 */
function buildRumbleParticipants(
  matches: Match[],
  participants: string[],
  agentMap: Map<string, { moltbookHandle?: string }>
): RumbleParticipant[] {
  // Track eliminations from match results
  const eliminated = new Map<string, { at: number; by: string }>();

  // In Royal Rumble, the loser of each match is eliminated
  matches.forEach(m => {
    if (m.status !== MatchStatus.Completed || !m.winner) return;
    const loser = m.winner.toLowerCase() === m.player1.toLowerCase() ? m.player2 : m.player1;
    if (!eliminated.has(loser.toLowerCase())) {
      eliminated.set(loser.toLowerCase(), { at: m.id, by: m.winner });
    }
  });

  return participants.map((p, index) => {
    const elim = eliminated.get(p.toLowerCase());
    const agent = agentMap.get(p.toLowerCase());
    return {
      address: p,
      handle: agent?.moltbookHandle ?? p.slice(0, 8),
      entryOrder: index + 1,
      eliminatedAt: elim?.at,
      eliminator: elim?.by,
      isActive: !elim,
    };
  });
}

/**
 * Build Pentathlon standings (multi-game-type tournament)
 */
function buildPentathlonStandings(
  matches: Match[],
  participants: string[],
  agentMap: Map<string, { moltbookHandle?: string }>
): PentathlonStanding[] {
  // Points per rank: 1st=10, 2nd=7, 3rd=5, 4th=4, 5th=3, etc.
  const rankPoints = [10, 7, 5, 4, 3, 2, 1];

  // Group matches by game type and calculate per-event rankings
  const gameTypeMatches = new Map<GameType, Match[]>();
  matches.forEach(m => {
    const gt = m.gameType ?? GameType.StrategyArena;
    const arr = gameTypeMatches.get(gt) ?? [];
    arr.push(m);
    gameTypeMatches.set(gt, arr);
  });

  // Calculate wins per player per game type
  const playerStats = new Map<string, Map<GameType, number>>();
  participants.forEach(p => playerStats.set(p.toLowerCase(), new Map()));

  gameTypeMatches.forEach((gtMatches, gt) => {
    gtMatches.forEach(m => {
      if (m.status !== MatchStatus.Completed || !m.winner) return;
      const wins = playerStats.get(m.winner.toLowerCase())?.get(gt) ?? 0;
      playerStats.get(m.winner.toLowerCase())?.set(gt, wins + 1);
    });
  });

  // Build standings
  return participants.map(p => {
    const agent = agentMap.get(p.toLowerCase());
    const eventScores: Record<GameType, { rank: number; points: number }> = {} as Record<GameType, { rank: number; points: number }>;
    let totalPoints = 0;

    gameTypeMatches.forEach((_, gt) => {
      // Sort all players by wins in this game type
      const rankings = participants
        .map(pp => ({ addr: pp, wins: playerStats.get(pp.toLowerCase())?.get(gt) ?? 0 }))
        .sort((a, b) => b.wins - a.wins);

      const rank = rankings.findIndex(r => r.addr.toLowerCase() === p.toLowerCase()) + 1;
      const points = rankPoints[rank - 1] ?? 0;
      eventScores[gt] = { rank, points };
      totalPoints += points;
    });

    return {
      agentAddress: p,
      handle: agent?.moltbookHandle ?? p.slice(0, 8),
      totalPoints,
      eventScores,
    };
  }).sort((a, b) => b.totalPoints - a.totalPoints);
}

// =========================================================================
// Store Definition
// =========================================================================

interface ArenaState {
  tournaments: Tournament[];
  tournamentDetails: Record<number, TournamentWithStandings>;
  allMatches: Match[];
  gameTypeFilter: GameType | null;
  statusFilter: TournamentStatus | null;
  prizePoolMin: number | null;
  prizePoolMax: number | null;
  loading: boolean;
  error: string | null;

  // Cache metadata
  lastFetchTimestamp: number | null;
  isOffline: boolean;
  usingCachedData: boolean;

  getFilteredTournaments: () => Tournament[];
  getLiveMatches: () => Match[];
  getTournamentDetail: (id: number) => TournamentWithStandings | undefined;
  getMatchesByTournament: (tournamentId: number) => Match[];
  setGameTypeFilter: (type: GameType | null) => void;
  setStatusFilter: (status: TournamentStatus | null) => void;
  setPrizePoolFilter: (min: number | null, max: number | null) => void;
  setOfflineStatus: (offline: boolean) => void;
  fetchFromChain: (forceRefresh?: boolean) => Promise<boolean>;
  fetchFromGraphQL: () => Promise<boolean>;
}

export const useArenaStore = create<ArenaState>()(
  persist(
    (set, get) => ({
      tournaments: [],
      tournamentDetails: {},
      allMatches: [],
      gameTypeFilter: null,
      statusFilter: null,
      prizePoolMin: null,
      prizePoolMax: null,
      loading: false,
      error: null,
      lastFetchTimestamp: null,
      isOffline: !isOnline(),
      usingCachedData: false,

      getFilteredTournaments: () => {
        const { tournaments, gameTypeFilter, statusFilter, prizePoolMin, prizePoolMax } = get();
        return tournaments.filter(t => {
          if (gameTypeFilter !== null && t.gameType !== gameTypeFilter) return false;
          if (statusFilter !== null && t.status !== statusFilter) return false;
          const prizePool = parseFloat(t.prizePool || '0');
          if (prizePoolMin !== null && prizePool < prizePoolMin) return false;
          if (prizePoolMax !== null && prizePool > prizePoolMax) return false;
          return true;
        });
      },

      getLiveMatches: () => {
        const { allMatches } = get();
        return allMatches.filter(m => m.status === MatchStatus.InProgress);
      },

      getTournamentDetail: (id: number) => get().tournamentDetails[id],

      getMatchesByTournament: (tournamentId: number) => {
        return get().allMatches.filter(m => m.tournamentId === tournamentId);
      },

      setGameTypeFilter: (type) => set({ gameTypeFilter: type }),
      setStatusFilter: (status) => set({ statusFilter: status }),
      setPrizePoolFilter: (min, max) => set({ prizePoolMin: min, prizePoolMax: max }),
      setOfflineStatus: (offline) => set({ isOffline: offline }),

      fetchFromGraphQL: async () => {
        try {
          const { data } = await fetchGraphQL<{ tournaments: Array<Record<string, unknown>> }>(`{
            tournaments {
              id
              name
              gameType
              format
              status
              entryStake
              maxParticipants
              currentParticipants
              prizePool
              startTime
              roundCount
              currentRound
            }
          }`);

          if (data?.tournaments && data.tournaments.length > 0) {
            // Convert GraphQL enum strings back to numeric values
            const gameTypeMap: Record<string, number> = {
              ORACLE_DUEL: 0, STRATEGY_ARENA: 1, AUCTION_WARS: 2, QUIZ_BOWL: 3,
            };
            const formatMap: Record<string, number> = {
              SWISS_SYSTEM: 0, SINGLE_ELIMINATION: 1, DOUBLE_ELIMINATION: 2,
              ROUND_ROBIN: 3, BEST_OF_N: 4, ROYAL_RUMBLE: 5, PENTATHLON: 6,
            };
            const statusMap: Record<string, number> = {
              OPEN: 0, ACTIVE: 1, COMPLETED: 2, CANCELLED: 3, PAUSED: 4,
            };

            const gqlTournaments: Tournament[] = data.tournaments.map((t: Record<string, unknown>) => ({
              id: t.id as number,
              name: t.name as string,
              gameType: (gameTypeMap[t.gameType as string] ?? 0) as GameType,
              format: (formatMap[t.format as string] ?? 0) as TournamentFormat,
              status: (statusMap[t.status as string] ?? 0) as TournamentStatus,
              entryStake: String(t.entryStake || '0'),
              maxParticipants: t.maxParticipants as number,
              currentParticipants: t.currentParticipants as number,
              prizePool: String(t.prizePool || '0'),
              startTime: t.startTime as number,
              roundCount: t.roundCount as number,
              currentRound: t.currentRound as number,
              parametersHash: String(t.parametersHash || ''),
            }));

            set({
              tournaments: gqlTournaments,
              loading: false,
              lastFetchTimestamp: Date.now(),
              usingCachedData: false,
            });
            return true;
          }

          return false;
        } catch (e) {
          console.debug('[arenaStore] GraphQL fetch failed:', e);
          return false;
        }
      },

      fetchFromChain: async (forceRefresh = false) => {
        const { lastFetchTimestamp, tournaments, isOffline } = get();

        // If offline, use cached data if available
        if (isOffline) {
          if (tournaments.length > 0) {
            console.log('[arenaStore] Offline - using cached data');
            set({ usingCachedData: true, loading: false });
            return true;
          }
          set({ error: 'Offline and no cached data available', loading: false });
          return false;
        }

        // If cache is fresh and not forcing refresh, skip network call
        if (!forceRefresh && isCacheFresh(lastFetchTimestamp ?? undefined) && tournaments.length > 0) {
          console.log('[arenaStore] Using fresh cached data');
          set({ usingCachedData: true });
          return true;
        }

        set({ loading: true, error: null, usingCachedData: false });

        // Try GraphQL first for fast loading — fall through to chain reads on failure
        const gqlSuccess = await get().fetchFromGraphQL();
        if (gqlSuccess && get().tournaments.length > 0) {
          // GraphQL gave us basic tournament data; now fetch details from chain
          // in the background for richer data (matches, participants, brackets)
        }

        try {
          const fetchedTournaments = await fetchAllTournaments();

          // SEQUENTIAL: Fetch matches one tournament at a time to avoid RPC rate limits
          const allMatches: Match[] = [];
          for (const t of fetchedTournaments) {
            const tMatches = await fetchMatchesForTournament(t.id);
            allMatches.push(...tMatches);
          }

          // SEQUENTIAL: Fetch participants one tournament at a time
          const participantsResults: string[][] = [];
          for (const t of fetchedTournaments) {
            const participants = await fetchTournamentParticipants(t.id);
            participantsResults.push(participants);
          }

          // Fetch all agents (already has internal rate limiting)
          const allTournamentIds = fetchedTournaments.map(t => t.id);
          const allAgents = await fetchAgentsFromTournaments(allTournamentIds);

          // Create agent lookup map once (covers all tournaments)
          const agentMap = new Map(allAgents.map(a => [a.agentAddress.toLowerCase(), a]));

          // Build tournament details with standings from chain data
          const details: Record<number, TournamentWithStandings> = {};
          fetchedTournaments.forEach((t, index) => {
            const tMatches = allMatches.filter(m => m.tournamentId === t.id);
            const participants = participantsResults[index];

            // Build standings using pre-fetched agent data
            const standings: AgentStanding[] = participants.map(addr => {
              const agent = agentMap.get(addr.toLowerCase());
              const wins = tMatches.filter(m =>
                m.winner?.toLowerCase() === addr.toLowerCase()
              ).length;
              const lost = tMatches.filter(m =>
                m.status === MatchStatus.Completed &&
                m.winner !== null &&
                m.winner.toLowerCase() !== addr.toLowerCase() &&
                (m.player1.toLowerCase() === addr.toLowerCase() || m.player2.toLowerCase() === addr.toLowerCase())
              ).length;
              return {
                address: addr,
                handle: agent?.moltbookHandle ?? addr.slice(0, 8),
                elo: agent?.elo ?? 1200,
                tournamentPoints: wins,
                eliminated: t.format === TournamentFormat.SingleElimination && lost > 0,
              };
            });

            standings.sort((a, b) => b.tournamentPoints - a.tournamentPoints || b.elo - a.elo);

            // Build rounds
            const roundMap = new Map<number, Match[]>();
            tMatches.forEach(m => {
              const arr = roundMap.get(m.round) ?? [];
              arr.push(m);
              roundMap.set(m.round, arr);
            });

            const rounds: RoundData[] = Array.from(roundMap.entries())
              .sort(([a], [b]) => a - b)
              .map(([round, matches]) => ({
                round,
                pairings: matches.map(m => [m.player1, m.player2] as [string, string]),
                results: [],
                completed: matches.every(m => m.status === MatchStatus.Completed),
              }));

            // Build format-specific data based on tournament format
            const tournamentDetail: TournamentWithStandings = {
              ...t,
              standings,
              rounds,
              matches: tMatches,
            };

            // Add format-specific data
            switch (t.format) {
              case TournamentFormat.DoubleElimination:
                tournamentDetail.bracket = buildDoubleEliminationBracket(tMatches, participants, agentMap);
                break;

              case TournamentFormat.RoundRobin:
                tournamentDetail.roundRobinStandings = buildRoundRobinStandings(tMatches, participants, agentMap);
                break;

              case TournamentFormat.BestOfN:
                // Determine wins required from tournament config (default Bo3)
                const winsRequired = t.roundCount >= 4 ? 3 : 2;
                tournamentDetail.series = buildSeriesData(tMatches, participants, winsRequired);
                break;

              case TournamentFormat.RoyalRumble:
                tournamentDetail.rumbleParticipants = buildRumbleParticipants(tMatches, participants, agentMap);
                tournamentDetail.currentEntrant = participants.filter(p =>
                  !tMatches.some(m => m.status === MatchStatus.Completed && m.winner && m.winner.toLowerCase() !== p.toLowerCase())
                ).length;
                // Find last elimination
                const completedMatches = tMatches.filter(m => m.status === MatchStatus.Completed && m.winner);
                if (completedMatches.length > 0) {
                  const lastMatch = completedMatches[completedMatches.length - 1];
                  const eliminated = lastMatch.winner?.toLowerCase() === lastMatch.player1.toLowerCase()
                    ? lastMatch.player2 : lastMatch.player1;
                  tournamentDetail.lastElimination = {
                    eliminated,
                    eliminator: lastMatch.winner ?? '',
                    timestamp: Date.now(), // Would use actual timestamp from chain
                  };
                }
                break;

              case TournamentFormat.Pentathlon:
                tournamentDetail.pentathlonStandings = buildPentathlonStandings(tMatches, participants, agentMap);
                // Determine completed events by checking which game types have all matches completed
                const gameTypesInTournament = new Set(tMatches.map(m => m.gameType ?? GameType.StrategyArena));
                const completedEvents: GameType[] = [];
                let currentEvent: GameType | undefined;
                gameTypesInTournament.forEach(gt => {
                  const gtMatches = tMatches.filter(m => (m.gameType ?? GameType.StrategyArena) === gt);
                  if (gtMatches.every(m => m.status === MatchStatus.Completed)) {
                    completedEvents.push(gt);
                  } else if (!currentEvent && gtMatches.some(m => m.status === MatchStatus.InProgress)) {
                    currentEvent = gt;
                  }
                });
                tournamentDetail.completedEvents = completedEvents;
                tournamentDetail.currentEvent = currentEvent;
                break;
            }

            details[t.id] = tournamentDetail;
          });

          set({
            tournaments: fetchedTournaments,
            allMatches,
            tournamentDetails: details,
            loading: false,
            lastFetchTimestamp: Date.now(),
            usingCachedData: false,
          });
          return true;
        } catch (e) {
          console.error('[arenaStore] Chain fetch failed:', e);
          // If fetch fails but we have cached data, use it
          if (tournaments.length > 0) {
            console.log('[arenaStore] Network error - falling back to cached data');
            set({ error: String(e), loading: false, usingCachedData: true });
            return true;
          }
          set({ error: String(e), loading: false });
          return false;
        }
      },
    }),
    {
      name: 'arena-store',
      storage: createJSONStorage(() => indexedDBStorage),
      // Only persist data, not transient UI state
      partialize: (state) => ({
        tournaments: state.tournaments,
        tournamentDetails: state.tournamentDetails,
        allMatches: state.allMatches,
        lastFetchTimestamp: state.lastFetchTimestamp,
      }),
    }
  )
);
