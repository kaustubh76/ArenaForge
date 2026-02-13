import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Bet, MatchPool, BettorProfile, BetStatus } from '@/types/arena';
import { indexedDBStorage, isOnline } from '@/lib/indexeddb-storage';
import {
  fetchMatchPool,
  fetchUserBets,
  fetchBettorProfile,
  fetchTopBettors,
  placeBet as placeBetOnChain,
  claimBetWinnings,
  calculateOdds,
} from '@/lib/contracts';

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

      // Fetch user's bets
      fetchMyBets: async (address: string) => {
        try {
          const bets = await fetchUserBets(address);
          set({ userBets: bets });
        } catch (e) {
          console.error('[bettingStore] Failed to fetch bets:', e);
        }
      },

      // Fetch user's bettor profile
      fetchMyProfile: async (address: string) => {
        try {
          const profile = await fetchBettorProfile(address);
          set({ myBettorProfile: profile });
        } catch (e) {
          console.error('[bettingStore] Failed to fetch profile:', e);
        }
      },

      // Fetch top bettors leaderboard
      fetchTopBettorsLeaderboard: async (limit = 50) => {
        try {
          const bettors = await fetchTopBettors(limit);
          set({ topBettors: bettors });
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
