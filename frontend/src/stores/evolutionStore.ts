import { create } from 'zustand';
import { EvolutionRecord } from '@/types/arena';
import { fetchEvolutionRecords, isConfigured } from '@/lib/contracts';
import { fetchGraphQL } from '@/lib/api';

interface EvolutionState {
  records: EvolutionRecord[];
  selectedTournamentId: number | null;
  loading: boolean;
  error: string | null;
  lastFetchBlock: bigint;

  getFilteredRecords: () => EvolutionRecord[];
  selectTournament: (id: number | null) => void;
  fetchFromChain: () => Promise<boolean>;
  fetchFromGraphQL: (tournamentId?: number) => Promise<boolean>;
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

  fetchFromGraphQL: async (tournamentId?: number) => {
    set({ loading: true, error: null });
    try {
      const tid = tournamentId ?? get().selectedTournamentId ?? 0;
      const { data } = await fetchGraphQL<{ evolutionHistory: Array<Record<string, unknown>> }>(`{
        evolutionHistory(tournamentId: ${tid}) {
          tournamentId
          round
          previousParamsHash
          newParamsHash
          mutations {
            type
            factor
            increment
            strategy
            reason
          }
          metrics {
            averageStakeBehavior
            dominantStrategy
            strategyDistribution
            averageMatchDuration
            drawRate
          }
          timestamp
        }
      }`);

      if (data?.evolutionHistory) {
        const records: EvolutionRecord[] = data.evolutionHistory.map((r: Record<string, unknown>) => ({
          tournamentId: r.tournamentId as number,
          round: r.round as number,
          previousParamsHash: r.previousParamsHash as string,
          newParamsHash: r.newParamsHash as string,
          mutations: r.mutations as EvolutionRecord['mutations'],
          metrics: r.metrics ? {
            averageStakeBehavior: (r.metrics as Record<string, unknown>).averageStakeBehavior as 'conservative' | 'moderate' | 'aggressive',
            dominantStrategy: (r.metrics as Record<string, unknown>).dominantStrategy as string,
            strategyDistribution: typeof (r.metrics as Record<string, unknown>).strategyDistribution === 'string'
              ? JSON.parse((r.metrics as Record<string, unknown>).strategyDistribution as string)
              : (r.metrics as Record<string, unknown>).strategyDistribution,
            averageMatchDuration: (r.metrics as Record<string, unknown>).averageMatchDuration as number,
            drawRate: (r.metrics as Record<string, unknown>).drawRate as number,
          } : {
            averageStakeBehavior: 'moderate' as const,
            dominantStrategy: 'N/A',
            strategyDistribution: {},
            averageMatchDuration: 0,
            drawRate: 0,
          },
          timestamp: (r.timestamp as number) * 1000, // Convert from seconds to ms
        }));

        const { records: existing } = get();
        const existingKeys = new Set(
          existing.map(r => `${r.tournamentId}-${r.round}-${r.newParamsHash}`)
        );
        const uniqueNew = records.filter(
          r => !existingKeys.has(`${r.tournamentId}-${r.round}-${r.newParamsHash}`)
        );

        const allRecords = [...existing, ...uniqueNew].sort(
          (a, b) => b.timestamp - a.timestamp
        );

        set({ records: allRecords, loading: false });
        return true;
      }

      set({ loading: false });
      return false;
    } catch (e) {
      console.error('[evolutionStore] GraphQL fetch failed:', e);
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
      return false;
    }
  },

  fetchFromChain: async () => {
    if (!isConfigured()) {
      // Try GraphQL fallback instead of failing
      return get().fetchFromGraphQL();
    }

    set({ loading: true, error: null });
    try {
      const { lastFetchBlock, records: existingRecords } = get();

      // Fetch evolution events from chain
      const newRecords = await fetchEvolutionRecords(lastFetchBlock);

      // If chain returned nothing, try GraphQL
      if (newRecords.length === 0 && existingRecords.length === 0) {
        set({ loading: false });
        return get().fetchFromGraphQL();
      }

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
      console.error('[evolutionStore] Chain fetch failed, trying GraphQL:', e);
      // Fallback to GraphQL
      return get().fetchFromGraphQL();
    }
  },

  addRecord: (record) => {
    const { records } = get();
    set({
      records: [record, ...records].sort((a, b) => b.timestamp - a.timestamp),
    });
  },
}));
