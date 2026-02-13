import { create } from 'zustand';
import { EvolutionRecord } from '@/types/arena';
import { fetchEvolutionRecords, isConfigured } from '@/lib/contracts';

interface EvolutionState {
  records: EvolutionRecord[];
  selectedTournamentId: number | null;
  loading: boolean;
  error: string | null;
  lastFetchBlock: bigint;

  getFilteredRecords: () => EvolutionRecord[];
  selectTournament: (id: number | null) => void;
  fetchFromChain: () => Promise<boolean>;
  addRecord: (record: EvolutionRecord) => void;
}

export const useEvolutionStore = create<EvolutionState>((set, get) => ({
  records: [],
  selectedTournamentId: null,
  loading: false,
  error: null,
  lastFetchBlock: BigInt(0),

  getFilteredRecords: () => {
    const { records, selectedTournamentId } = get();
    if (selectedTournamentId === null) return records;
    return records.filter(r => r.tournamentId === selectedTournamentId);
  },

  selectTournament: (id) => set({ selectedTournamentId: id }),

  fetchFromChain: async () => {
    if (!isConfigured()) {
      set({ error: 'Contracts not configured', loading: false });
      return false;
    }

    set({ loading: true, error: null });
    try {
      const { lastFetchBlock, records: existingRecords } = get();

      // Fetch evolution events from chain
      const newRecords = await fetchEvolutionRecords(lastFetchBlock);

      // Merge with existing records, avoiding duplicates
      const existingKeys = new Set(
        existingRecords.map(r => `${r.tournamentId}-${r.round}-${r.newParamsHash}`)
      );
      const uniqueNew = newRecords.filter(
        r => !existingKeys.has(`${r.tournamentId}-${r.round}-${r.newParamsHash}`)
      );

      const allRecords = [...existingRecords, ...uniqueNew].sort(
        (a, b) => b.timestamp - a.timestamp
      );

      set({
        records: allRecords,
        loading: false,
        lastFetchBlock: BigInt(Math.floor(Date.now() / 1000)),
      });

      return true;
    } catch (e) {
      console.error('[evolutionStore] Fetch failed:', e);
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
      return false;
    }
  },

  addRecord: (record) => {
    const { records } = get();
    set({
      records: [record, ...records].sort((a, b) => b.timestamp - a.timestamp),
    });
  },
}));
