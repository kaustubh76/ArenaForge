import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface FollowingState {
  followingAgents: string[];
  follow: (address: string) => void;
  unfollow: (address: string) => void;
  toggleFollow: (address: string) => void;
  isFollowing: (address: string) => boolean;
  clearFollowing: () => void;
}

export const useFollowingStore = create<FollowingState>()(
  persist(
    (set, get) => ({
      followingAgents: [],

      follow: (address: string) => {
        const normalized = address.toLowerCase();
        set((state) => ({
          followingAgents: state.followingAgents.includes(normalized)
            ? state.followingAgents
            : [...state.followingAgents, normalized],
        }));
      },

      unfollow: (address: string) => {
        const normalized = address.toLowerCase();
        set((state) => ({
          followingAgents: state.followingAgents.filter((a) => a !== normalized),
        }));
      },

      toggleFollow: (address: string) => {
        const normalized = address.toLowerCase();
        const { followingAgents } = get();
        if (followingAgents.includes(normalized)) {
          set({ followingAgents: followingAgents.filter((a) => a !== normalized) });
        } else {
          set({ followingAgents: [...followingAgents, normalized] });
        }
      },

      isFollowing: (address: string) => {
        return get().followingAgents.includes(address.toLowerCase());
      },

      clearFollowing: () => {
        set({ followingAgents: [] });
      },
    }),
    {
      name: 'arenaforge-following',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
