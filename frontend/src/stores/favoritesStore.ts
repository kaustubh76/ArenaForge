import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface FavoritesState {
  favoriteAgents: string[];
  addFavorite: (address: string) => void;
  removeFavorite: (address: string) => void;
  toggleFavorite: (address: string) => void;
  isFavorite: (address: string) => boolean;
  clearFavorites: () => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favoriteAgents: [],

      addFavorite: (address: string) => {
        const normalized = address.toLowerCase();
        set((state) => ({
          favoriteAgents: state.favoriteAgents.includes(normalized)
            ? state.favoriteAgents
            : [...state.favoriteAgents, normalized],
        }));
      },

      removeFavorite: (address: string) => {
        const normalized = address.toLowerCase();
        set((state) => ({
          favoriteAgents: state.favoriteAgents.filter((a) => a !== normalized),
        }));
      },

      toggleFavorite: (address: string) => {
        const normalized = address.toLowerCase();
        const { favoriteAgents } = get();
        if (favoriteAgents.includes(normalized)) {
          set({ favoriteAgents: favoriteAgents.filter((a) => a !== normalized) });
        } else {
          set({ favoriteAgents: [...favoriteAgents, normalized] });
        }
      },

      isFavorite: (address: string) => {
        return get().favoriteAgents.includes(address.toLowerCase());
      },

      clearFavorites: () => {
        set({ favoriteAgents: [] });
      },
    }),
    {
      name: 'arenaforge-favorites',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
