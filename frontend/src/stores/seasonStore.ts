import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Season, SeasonalProfile, RankTier, TierReward } from '@/types/arena';
import { indexedDBStorage, isCacheFresh, isOnline } from '@/lib/indexeddb-storage';
import {
  fetchCurrentSeason,
  fetchSeasonalProfile,
  fetchSeasonLeaderboard,
  fetchTierRewards,
  claimSeasonReward,
} from '@/lib/contracts';

interface SeasonState {
  // Data
  currentSeason: Season | null;
  mySeasonalProfile: SeasonalProfile | null;
  seasonLeaderboard: SeasonalProfile[];
  tierRewards: TierReward[];

  // Cache metadata
  lastFetchTimestamp: number | null;
  isOffline: boolean;
  usingCachedData: boolean;

  // UI state
  loading: boolean;
  error: string | null;
  claimingReward: boolean;

  // Computed helpers
  getTimeRemaining: () => number;
  getTierName: (tier: RankTier) => string;
  getTierColor: (tier: RankTier) => string;
  getEloForNextTier: (currentElo: number) => number | null;

  // Actions
  fetchSeason: (forceRefresh?: boolean) => Promise<boolean>;
  fetchMyProfile: (address: string) => Promise<void>;
  fetchLeaderboard: (limit?: number) => Promise<void>;
  claimReward: (seasonId: number) => Promise<boolean>;
  setOfflineStatus: (offline: boolean) => void;
}

// Tier thresholds matching SeasonalRankings.sol
const TIER_THRESHOLDS = [
  { tier: 0, minElo: 0, name: 'Iron', color: '#8b7355' },
  { tier: 1, minElo: 800, name: 'Bronze', color: '#cd7f32' },
  { tier: 2, minElo: 1100, name: 'Silver', color: '#c0c0c0' },
  { tier: 3, minElo: 1400, name: 'Gold', color: '#ffd700' },
  { tier: 4, minElo: 1700, name: 'Platinum', color: '#e5e4e2' },
  { tier: 5, minElo: 2000, name: 'Diamond', color: '#b9f2ff' },
];

export const useSeasonStore = create<SeasonState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentSeason: null,
      mySeasonalProfile: null,
      seasonLeaderboard: [],
      tierRewards: [],
      lastFetchTimestamp: null,
      isOffline: !isOnline(),
      usingCachedData: false,
      loading: false,
      error: null,
      claimingReward: false,

      // Computed: time remaining in current season
      getTimeRemaining: () => {
        const { currentSeason } = get();
        if (!currentSeason || !currentSeason.active) return 0;
        const now = Date.now();
        const remaining = currentSeason.endTime - now;
        return remaining > 0 ? remaining : 0;
      },

      // Computed: tier name from enum
      getTierName: (tier: RankTier) => {
        return TIER_THRESHOLDS[tier]?.name ?? 'Unknown';
      },

      // Computed: tier color
      getTierColor: (tier: RankTier) => {
        return TIER_THRESHOLDS[tier]?.color ?? '#666666';
      },

      // Computed: ELO needed for next tier
      getEloForNextTier: (currentElo: number) => {
        for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
          if (currentElo >= TIER_THRESHOLDS[i].minElo) {
            const nextTier = TIER_THRESHOLDS[i + 1];
            return nextTier ? nextTier.minElo : null; // null if already Diamond
          }
        }
        return TIER_THRESHOLDS[1].minElo; // Bronze threshold
      },

      // Fetch current season data
      fetchSeason: async (forceRefresh = false) => {
        const { lastFetchTimestamp, currentSeason, isOffline } = get();

        // If offline, use cached data if available
        if (isOffline) {
          if (currentSeason) {
            console.log('[seasonStore] Offline - using cached data');
            set({ usingCachedData: true, loading: false });
            return true;
          }
          set({ error: 'Offline and no cached data available', loading: false });
          return false;
        }

        // If cache is fresh and not forcing refresh, skip network call
        if (!forceRefresh && isCacheFresh(lastFetchTimestamp ?? undefined) && currentSeason) {
          console.log('[seasonStore] Using fresh cached data');
          set({ usingCachedData: true });
          return true;
        }

        set({ loading: true, error: null, usingCachedData: false });
        try {
          const [season, rewards] = await Promise.all([
            fetchCurrentSeason(),
            fetchTierRewards(),
          ]);

          set({
            currentSeason: season,
            tierRewards: rewards,
            loading: false,
            lastFetchTimestamp: Date.now(),
            usingCachedData: false,
          });
          return true;
        } catch (e) {
          console.error('[seasonStore] Fetch failed:', e);
          if (currentSeason) {
            console.log('[seasonStore] Network error - falling back to cached data');
            set({ error: String(e), loading: false, usingCachedData: true });
            return true;
          }
          set({ error: String(e), loading: false });
          return false;
        }
      },

      // Fetch user's seasonal profile
      fetchMyProfile: async (address: string) => {
        const { currentSeason } = get();
        if (!currentSeason) {
          console.warn('[seasonStore] No current season, cannot fetch profile');
          return;
        }

        try {
          const profile = await fetchSeasonalProfile(currentSeason.id, address);
          set({ mySeasonalProfile: profile });
        } catch (e) {
          console.error('[seasonStore] Failed to fetch profile:', e);
        }
      },

      // Fetch season leaderboard
      fetchLeaderboard: async (limit = 100) => {
        const { currentSeason } = get();
        if (!currentSeason) {
          console.warn('[seasonStore] No current season, cannot fetch leaderboard');
          return;
        }

        try {
          const leaderboard = await fetchSeasonLeaderboard(currentSeason.id, limit);
          set({ seasonLeaderboard: leaderboard });
        } catch (e) {
          console.error('[seasonStore] Failed to fetch leaderboard:', e);
        }
      },

      // Claim season reward
      claimReward: async (seasonId: number) => {
        set({ claimingReward: true, error: null });
        try {
          const success = await claimSeasonReward(seasonId);
          if (success) {
            // Update local profile to reflect claim
            const { mySeasonalProfile } = get();
            if (mySeasonalProfile) {
              set({
                mySeasonalProfile: { ...mySeasonalProfile, rewardClaimed: true },
                claimingReward: false,
              });
            }
          }
          return success;
        } catch (e) {
          console.error('[seasonStore] Claim reward failed:', e);
          set({ error: String(e), claimingReward: false });
          return false;
        }
      },

      setOfflineStatus: (offline) => set({ isOffline: offline }),
    }),
    {
      name: 'season-store',
      storage: createJSONStorage(() => indexedDBStorage),
      partialize: (state) => ({
        currentSeason: state.currentSeason,
        mySeasonalProfile: state.mySeasonalProfile,
        seasonLeaderboard: state.seasonLeaderboard,
        tierRewards: state.tierRewards,
        lastFetchTimestamp: state.lastFetchTimestamp,
      }),
    }
  )
);
