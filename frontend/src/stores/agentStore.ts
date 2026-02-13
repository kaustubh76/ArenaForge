import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AgentProfileExtended } from '@/types/arena';
import { fetchAllTournaments, fetchAgentsFromTournaments } from '@/lib/contracts';
import { indexedDBStorage, isCacheFresh, isOnline } from '@/lib/indexeddb-storage';

type SortField = 'elo' | 'wins' | 'winRate' | 'matches';

interface AgentState {
  agents: AgentProfileExtended[];
  selectedAgent: AgentProfileExtended | null;
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';
  searchQuery: string;
  loading: boolean;
  error: string | null;
  lastFetchTimestamp: number | null;

  getSortedAgents: () => AgentProfileExtended[];
  selectAgent: (address: string | null) => void;
  setSortBy: (field: SortField) => void;
  toggleSortOrder: () => void;
  setSearchQuery: (query: string) => void;
  fetchFromChain: (forceRefresh?: boolean) => Promise<boolean>;
  getAgentByAddress: (address: string) => AgentProfileExtended | undefined;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      agents: [],
      selectedAgent: null,
      sortBy: 'elo',
      sortOrder: 'desc',
      searchQuery: '',
      loading: false,
      error: null,
      lastFetchTimestamp: null,

      getSortedAgents: () => {
        const { agents, sortBy, sortOrder, searchQuery } = get();
        let filtered = agents;

        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(a =>
            a.moltbookHandle.toLowerCase().includes(q) ||
            a.agentAddress.toLowerCase().includes(q)
          );
        }

        const sorted = [...filtered].sort((a, b) => {
          let diff = 0;
          switch (sortBy) {
            case 'elo': diff = a.elo - b.elo; break;
            case 'wins': diff = a.wins - b.wins; break;
            case 'winRate': diff = a.winRate - b.winRate; break;
            case 'matches': diff = a.matchesPlayed - b.matchesPlayed; break;
          }
          return sortOrder === 'desc' ? -diff : diff;
        });

        return sorted;
      },

      selectAgent: (address) => {
        if (!address) { set({ selectedAgent: null }); return; }
        const agent = get().agents.find(a => a.agentAddress === address) ?? null;
        set({ selectedAgent: agent });
      },

      setSortBy: (field) => set({ sortBy: field }),
      toggleSortOrder: () => set(s => ({ sortOrder: s.sortOrder === 'desc' ? 'asc' : 'desc' })),
      setSearchQuery: (query) => set({ searchQuery: query }),

      fetchFromChain: async (forceRefresh = false) => {
        const { lastFetchTimestamp, agents } = get();

        // If offline, use cached data if available
        if (!isOnline()) {
          if (agents.length > 0) {
            console.log('[agentStore] Offline - using cached data');
            return true;
          }
          set({ error: 'Offline and no cached data available', loading: false });
          return false;
        }

        // If cache is fresh and not forcing refresh, skip network call
        if (!forceRefresh && isCacheFresh(lastFetchTimestamp ?? undefined) && agents.length > 0) {
          console.log('[agentStore] Using fresh cached data');
          return true;
        }

        set({ loading: true, error: null });
        try {
          const tournaments = await fetchAllTournaments();
          const tournamentIds = tournaments.map(t => t.id);
          const fetchedAgents = await fetchAgentsFromTournaments(tournamentIds);
          set({
            agents: fetchedAgents,
            loading: false,
            lastFetchTimestamp: Date.now(),
          });
          return true;
        } catch (e) {
          console.error('[agentStore] Chain fetch failed:', e);
          // If fetch fails but we have cached data, use it
          if (agents.length > 0) {
            console.log('[agentStore] Network error - falling back to cached data');
            set({ error: String(e), loading: false });
            return true;
          }
          set({ error: String(e), loading: false });
          return false;
        }
      },

      getAgentByAddress: (address: string) => {
        return get().agents.find(a => a.agentAddress.toLowerCase() === address.toLowerCase());
      },
    }),
    {
      name: 'agent-store',
      storage: createJSONStorage(() => indexedDBStorage),
      // Only persist data, not transient UI state
      partialize: (state) => ({
        agents: state.agents,
        lastFetchTimestamp: state.lastFetchTimestamp,
      }),
    }
  )
);
