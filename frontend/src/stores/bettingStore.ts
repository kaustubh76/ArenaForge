import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Bet, MatchPool, BettorProfile, BetStatus } from '@/types/arena';
import { indexedDBStorage, isOnline } from '@/lib/indexeddb-storage';
import {
  fetchMatchPool,
  placeBet as placeBetOnChain,
  claimBetWinnings,
  calculateOdds,
} from '@/lib/contracts';
import { fetchGraphQL } from '@/lib/api';

interface BettingState {
  // Data
  matchPools: Record<number, MatchPool>;
  userBets: Bet[];
  myBettorProfile: BettorProfile | null;
  topBettors: BettorProfile[];

  // Pending bet UI state
  pendingBetMatchId: number | null;
  pendingBetAmount: string;
  pendingPrediction: string | null;
  pendingOdds: string | null;

  // Cache metadata
  lastFetchTimestamp: number | null;
  isOffline: boolean;
  usingCachedData: boolean;

  // UI state
  loading: boolean;
  error: string | null;
  placingBet: boolean;
  claimingWinnings: boolean;

  // Computed helpers
  getActiveBets: () => Bet[];
  getMatchBets: (matchId: number) => Bet[];
  getTotalWageredOnMatch: (matchId: number) => { player1: string; player2: string };
  getPotentialPayout: (amount: string, odds: string) => string;

  // Actions
  fetchPool: (matchId: number) => Promise<void>;
  fetchMyBets: (address: string) => Promise<void>;
  fetchMyProfile: (address: string) => Promise<void>;
  fetchTopBettorsLeaderboard: (limit?: number) => Promise<void>;
  refreshOdds: (matchId: number, prediction: string) => Promise<void>;

  // Bet management
  setPendingBet: (matchId: number, prediction: string) => void;
  updatePendingAmount: (amount: string) => void;
  clearPendingBet: () => void;
  submitBet: () => Promise<boolean>;
  claimWinnings: (betId: number) => Promise<boolean>;

  setOfflineStatus: (offline: boolean) => void;
}

export const useBettingStore = create<BettingState>()(
  persist(
    (set, get) => ({
      // Initial state
      matchPools: {},
      userBets: [],
      myBettorProfile: null,
      topBettors: [],
      pendingBetMatchId: null,
      pendingBetAmount: '',
      pendingPrediction: null,
      pendingOdds: null,
      lastFetchTimestamp: null,
      isOffline: !isOnline(),
      usingCachedData: false,
      loading: false,
      error: null,
      placingBet: false,
      claimingWinnings: false,

      // Computed: get active (unsettled) bets
      getActiveBets: () => {
        const { userBets } = get();
        return userBets.filter(b => b.status === 0); // BetStatus.Active
      },

      // Computed: get bets for a specific match
      getMatchBets: (matchId: number) => {
        const { userBets } = get();
        return userBets.filter(b => b.matchId === matchId);
      },

      // Computed: total wagered on each player for a match
      getTotalWageredOnMatch: (matchId: number) => {
        const { matchPools } = get();
        const pool = matchPools[matchId];
        if (!pool) return { player1: '0', player2: '0' };
        return {
          player1: pool.totalPlayer1Bets,
          player2: pool.totalPlayer2Bets,
        };
      },

      // Computed: potential payout based on amount and odds
      getPotentialPayout: (amount: string, odds: string) => {
        try {
          const amountNum = parseFloat(amount);
          const oddsNum = parseFloat(odds);
          if (isNaN(amountNum) || isNaN(oddsNum)) return '0';
          return (amountNum * oddsNum).toFixed(6);
        } catch {
          return '0';
        }
      },

      // Fetch match pool data
      fetchPool: async (matchId: number) => {
        try {
          const pool = await fetchMatchPool(matchId);
          if (pool) {
            set(state => ({
              matchPools: { ...state.matchPools, [matchId]: pool },
            }));
          }
        } catch (e) {
          console.error('[bettingStore] Failed to fetch pool:', e);
        }
      },

      // Fetch user's bets via GraphQL
      fetchMyBets: async (address: string) => {
        try {
          const { data } = await fetchGraphQL<{ userBets: Array<Record<string, unknown>> }>(
            `query($addr: String!) { userBets(address: $addr, limit: 100) { matchId bettor predictedWinner amount status payout timestamp } }`,
            { addr: address }
          );
          if (data?.userBets) {
            const statusMap: Record<string, number> = { ACTIVE: 0, WON: 1, LOST: 2, REFUNDED: 3 };
            const bets: Bet[] = data.userBets.map((b, i) => ({
              id: i,
              matchId: Number(b.matchId),
              bettor: String(b.bettor),
              predictedWinner: String(b.predictedWinner),
              amount: String(b.amount),
              odds: '1',
              status: (statusMap[String(b.status)] ?? 0) as BetStatus,
              payout: String(b.payout ?? '0'),
              timestamp: Number(b.timestamp ?? 0),
            }));
            set({ userBets: bets });
          }
        } catch (e) {
          console.error('[bettingStore] Failed to fetch bets:', e);
        }
      },

      // Fetch user's bettor profile via GraphQL
      fetchMyProfile: async (address: string) => {
        try {
          const { data } = await fetchGraphQL<{ bettorProfile: Record<string, unknown> | null }>(
            `query($addr: String!) { bettorProfile(address: $addr) { address totalBets wins losses totalWagered totalWon currentStreak winRate } }`,
            { addr: address }
          );
          if (data?.bettorProfile) {
            const p = data.bettorProfile;
            const totalWon = BigInt(String(p.totalWon ?? '0'));
            const totalWagered = BigInt(String(p.totalWagered ?? '0'));
            const netProfit = totalWon - totalWagered;
            set({
              myBettorProfile: {
                address: String(p.address),
                totalBets: Number(p.totalBets ?? 0),
                wins: Number(p.wins ?? 0),
                losses: Number(p.losses ?? 0),
                totalWagered: String(p.totalWagered ?? '0'),
                totalWon: String(p.totalWon ?? '0'),
                netProfit: netProfit.toString(),
                currentStreak: Number(p.currentStreak ?? 0),
                longestWinStreak: 0,
                winRate: Number(p.winRate ?? 0),
              },
            });
          }
        } catch (e) {
          console.error('[bettingStore] Failed to fetch profile:', e);
        }
      },

      // Fetch top bettors leaderboard via GraphQL
      fetchTopBettorsLeaderboard: async (limit = 50) => {
        try {
          const { data } = await fetchGraphQL<{ topBettors: Array<Record<string, unknown>> }>(
            `query($limit: Int) { topBettors(limit: $limit) { address totalBets wins losses totalWagered totalWon currentStreak winRate } }`,
            { limit }
          );
          if (data?.topBettors) {
            const bettors: BettorProfile[] = data.topBettors.map((p) => ({
              address: String(p.address),
              totalBets: Number(p.totalBets ?? 0),
              wins: Number(p.wins ?? 0),
              losses: Number(p.losses ?? 0),
              totalWagered: String(p.totalWagered ?? '0'),
              totalWon: String(p.totalWon ?? '0'),
              netProfit: '0',
              currentStreak: Number(p.currentStreak ?? 0),
              longestWinStreak: 0,
              winRate: Number(p.winRate ?? 0),
            }));
            set({ topBettors: bettors });
          }
        } catch (e) {
          console.error('[bettingStore] Failed to fetch top bettors:', e);
        }
      },

      // Refresh odds for current pending bet
      refreshOdds: async (matchId: number, prediction: string) => {
        try {
          const odds = await calculateOdds(matchId, prediction);
          set({ pendingOdds: odds });
        } catch (e) {
          console.error('[bettingStore] Failed to refresh odds:', e);
        }
      },

      // Set up a pending bet
      setPendingBet: (matchId: number, prediction: string) => {
        set({
          pendingBetMatchId: matchId,
          pendingPrediction: prediction,
          pendingBetAmount: '',
          pendingOdds: null,
        });
        // Trigger odds calculation
        get().refreshOdds(matchId, prediction);
      },

      // Update pending bet amount
      updatePendingAmount: (amount: string) => {
        set({ pendingBetAmount: amount });
      },

      // Clear pending bet
      clearPendingBet: () => {
        set({
          pendingBetMatchId: null,
          pendingBetAmount: '',
          pendingPrediction: null,
          pendingOdds: null,
        });
      },

      // Submit the pending bet
      submitBet: async () => {
        const { pendingBetMatchId, pendingBetAmount, pendingPrediction } = get();

        if (!pendingBetMatchId || !pendingBetAmount || !pendingPrediction) {
          set({ error: 'Incomplete bet details' });
          return false;
        }

        if (!window.ethereum) {
          set({ error: 'Please connect your wallet to place bets' });
          return false;
        }

        set({ placingBet: true, error: null });
        try {
          const success = await placeBetOnChain(
            pendingBetMatchId,
            pendingPrediction,
            pendingBetAmount
          );

          if (success) {
            // Clear pending bet and refresh data
            get().clearPendingBet();
            // Refresh pool data
            await get().fetchPool(pendingBetMatchId);
          }

          set({ placingBet: false });
          return success;
        } catch (e) {
          console.error('[bettingStore] Failed to place bet:', e);
          set({ error: String(e), placingBet: false });
          return false;
        }
      },

      // Claim winnings for a bet
      claimWinnings: async (betId: number) => {
        if (!window.ethereum) {
          set({ error: 'Please connect your wallet to claim winnings' });
          return false;
        }
        set({ claimingWinnings: true, error: null });
        try {
          const success = await claimBetWinnings(betId);

          if (success) {
            // Update local bet status
            set(state => ({
              userBets: state.userBets.map(b =>
                b.id === betId ? { ...b, status: 1 as BetStatus } : b // BetStatus.Won
              ),
              claimingWinnings: false,
            }));
          }

          return success;
        } catch (e) {
          console.error('[bettingStore] Failed to claim winnings:', e);
          set({ error: String(e), claimingWinnings: false });
          return false;
        }
      },

      setOfflineStatus: (offline) => set({ isOffline: offline }),
    }),
    {
      name: 'betting-store',
      storage: createJSONStorage(() => indexedDBStorage),
      partialize: (state) => ({
        userBets: state.userBets,
        myBettorProfile: state.myBettorProfile,
        lastFetchTimestamp: state.lastFetchTimestamp,
      }),
    }
  )
);
