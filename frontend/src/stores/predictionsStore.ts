import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Prediction {
  tournamentId: number;
  matchId: number;
  predictedWinner: string;
  timestamp: number;
  resolved: boolean;
  correct?: boolean;
}

interface PredictionsState {
  predictions: Prediction[];
  addPrediction: (tournamentId: number, matchId: number, predictedWinner: string) => void;
  getPredictionsForTournament: (tournamentId: number) => Prediction[];
  getPredictionForMatch: (matchId: number) => Prediction | undefined;
  resolvePrediction: (matchId: number, actualWinner: string | null) => void;
  resolveAll: (matches: Array<{ id: number; winner: string | null }>) => void;
  getStats: () => { total: number; resolved: number; correct: number; accuracy: number; streak: number };
  clearOld: () => void;
}

export const usePredictionsStore = create<PredictionsState>()(
  persist(
    (set, get) => ({
      predictions: [],

      addPrediction: (tournamentId, matchId, predictedWinner) => {
        set(state => ({
          predictions: [
            ...state.predictions.filter(p => p.matchId !== matchId),
            {
              tournamentId,
              matchId,
              predictedWinner: predictedWinner.toLowerCase(),
              timestamp: Date.now(),
              resolved: false,
            },
          ],
        }));
      },

      getPredictionsForTournament: (tournamentId) => {
        return get().predictions.filter(p => p.tournamentId === tournamentId);
      },

      getPredictionForMatch: (matchId) => {
        return get().predictions.find(p => p.matchId === matchId);
      },

      resolvePrediction: (matchId, actualWinner) => {
        set(state => ({
          predictions: state.predictions.map(p =>
            p.matchId === matchId
              ? { ...p, resolved: true, correct: actualWinner ? p.predictedWinner === actualWinner.toLowerCase() : false }
              : p
          ),
        }));
      },

      resolveAll: (matches) => {
        set(state => ({
          predictions: state.predictions.map(p => {
            const match = matches.find(m => m.id === p.matchId);
            if (match && match.winner && !p.resolved) {
              return { ...p, resolved: true, correct: p.predictedWinner === match.winner.toLowerCase() };
            }
            return p;
          }),
        }));
      },

      getStats: () => {
        const preds = get().predictions;
        const resolved = preds.filter(p => p.resolved);
        const correct = resolved.filter(p => p.correct);

        // Current streak
        let streak = 0;
        const sortedResolved = [...resolved].sort((a, b) => b.timestamp - a.timestamp);
        for (const p of sortedResolved) {
          if (p.correct) streak++;
          else break;
        }

        return {
          total: preds.length,
          resolved: resolved.length,
          correct: correct.length,
          accuracy: resolved.length > 0 ? (correct.length / resolved.length) * 100 : 0,
          streak,
        };
      },

      clearOld: () => {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
        set(state => ({
          predictions: state.predictions.filter(p => p.timestamp > cutoff),
        }));
      },
    }),
    {
      name: 'predictions-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
