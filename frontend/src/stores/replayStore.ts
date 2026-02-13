import { create } from 'zustand';
import type { MatchReplay, ReplayRound } from '@/types/arena';
import { fetchReplayData } from '@/lib/contracts';

interface ReplayState {
  // Current replay data
  currentReplay: MatchReplay | null;
  currentRoundIndex: number;

  // Playback state
  isPlaying: boolean;
  playbackSpeed: number; // 0.5, 1, 2
  playbackInterval: ReturnType<typeof setInterval> | null;

  // Loading state
  loading: boolean;
  error: string | null;

  // Computed helpers
  getCurrentRound: () => ReplayRound | null;
  getTotalRounds: () => number;
  getProgress: () => number; // 0-100
  isAtStart: () => boolean;
  isAtEnd: () => boolean;

  // Actions
  loadReplay: (matchId: number) => Promise<void>;
  unloadReplay: () => void;

  // Playback controls
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  setSpeed: (speed: number) => void;
  seekToRound: (index: number) => void;
  nextRound: () => void;
  prevRound: () => void;
  goToStart: () => void;
  goToEnd: () => void;
}

const DEFAULT_PLAYBACK_INTERVAL_MS = 2000; // 2 seconds per round at 1x speed

export const useReplayStore = create<ReplayState>((set, get) => ({
  // Initial state
  currentReplay: null,
  currentRoundIndex: 0,
  isPlaying: false,
  playbackSpeed: 1,
  playbackInterval: null,
  loading: false,
  error: null,

  // Computed: get current round data
  getCurrentRound: () => {
    const { currentReplay, currentRoundIndex } = get();
    if (!currentReplay || currentRoundIndex >= currentReplay.rounds.length) {
      return null;
    }
    return currentReplay.rounds[currentRoundIndex];
  },

  // Computed: total rounds
  getTotalRounds: () => {
    const { currentReplay } = get();
    return currentReplay?.rounds.length ?? 0;
  },

  // Computed: playback progress percentage
  getProgress: () => {
    const { currentRoundIndex, currentReplay } = get();
    if (!currentReplay || currentReplay.rounds.length === 0) return 0;
    return (currentRoundIndex / (currentReplay.rounds.length - 1)) * 100;
  },

  // Computed: at start
  isAtStart: () => get().currentRoundIndex === 0,

  // Computed: at end
  isAtEnd: () => {
    const { currentRoundIndex, currentReplay } = get();
    if (!currentReplay) return true;
    return currentRoundIndex >= currentReplay.rounds.length - 1;
  },

  // Load replay for a match
  loadReplay: async (matchId: number) => {
    // Stop any existing playback
    get().pause();

    set({ loading: true, error: null, currentReplay: null, currentRoundIndex: 0 });

    try {
      // Fetch full replay data (tries GraphQL first, then on-chain fallback)
      const replay = await fetchReplayData(matchId);
      if (!replay || replay.rounds.length === 0) {
        set({ error: 'Replay not available for this match', loading: false });
        return;
      }

      set({
        currentReplay: replay,
        currentRoundIndex: 0,
        loading: false,
        isPlaying: false,
      });
    } catch (e) {
      console.error('[replayStore] Failed to load replay:', e);
      set({ error: String(e), loading: false });
    }
  },

  // Unload current replay
  unloadReplay: () => {
    get().pause();
    set({
      currentReplay: null,
      currentRoundIndex: 0,
      isPlaying: false,
      error: null,
    });
  },

  // Start playback
  play: () => {
    const { isPlaying, isAtEnd, playbackSpeed, playbackInterval } = get();

    // Don't start if already playing
    if (isPlaying) return;

    // If at end, go back to start
    if (isAtEnd()) {
      set({ currentRoundIndex: 0 });
    }

    // Clear any existing interval
    if (playbackInterval) {
      clearInterval(playbackInterval);
    }

    // Calculate interval based on speed
    const intervalMs = DEFAULT_PLAYBACK_INTERVAL_MS / playbackSpeed;

    const interval = setInterval(() => {
      const { currentRoundIndex, currentReplay } = get();
      if (!currentReplay) {
        get().pause();
        return;
      }

      if (currentRoundIndex >= currentReplay.rounds.length - 1) {
        // Reached end, stop playback
        get().pause();
      } else {
        set({ currentRoundIndex: currentRoundIndex + 1 });
      }
    }, intervalMs);

    set({ isPlaying: true, playbackInterval: interval });
  },

  // Pause playback
  pause: () => {
    const { playbackInterval } = get();
    if (playbackInterval) {
      clearInterval(playbackInterval);
    }
    set({ isPlaying: false, playbackInterval: null });
  },

  // Toggle playback
  togglePlayback: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      get().pause();
    } else {
      get().play();
    }
  },

  // Set playback speed
  setSpeed: (speed: number) => {
    const { isPlaying, playbackInterval } = get();

    set({ playbackSpeed: speed });

    // If playing, restart with new speed
    if (isPlaying && playbackInterval) {
      clearInterval(playbackInterval);

      const intervalMs = DEFAULT_PLAYBACK_INTERVAL_MS / speed;
      const interval = setInterval(() => {
        const { currentRoundIndex, currentReplay } = get();
        if (!currentReplay) {
          get().pause();
          return;
        }

        if (currentRoundIndex >= currentReplay.rounds.length - 1) {
          get().pause();
        } else {
          set({ currentRoundIndex: currentRoundIndex + 1 });
        }
      }, intervalMs);

      set({ playbackInterval: interval });
    }
  },

  // Seek to specific round
  seekToRound: (index: number) => {
    const { currentReplay } = get();
    if (!currentReplay) return;

    const clampedIndex = Math.max(0, Math.min(index, currentReplay.rounds.length - 1));
    set({ currentRoundIndex: clampedIndex });
  },

  // Go to next round
  nextRound: () => {
    const { currentRoundIndex, currentReplay } = get();
    if (!currentReplay) return;

    if (currentRoundIndex < currentReplay.rounds.length - 1) {
      set({ currentRoundIndex: currentRoundIndex + 1 });
    }
  },

  // Go to previous round
  prevRound: () => {
    const { currentRoundIndex } = get();
    if (currentRoundIndex > 0) {
      set({ currentRoundIndex: currentRoundIndex - 1 });
    }
  },

  // Go to start
  goToStart: () => {
    set({ currentRoundIndex: 0 });
  },

  // Go to end
  goToEnd: () => {
    const { currentReplay } = get();
    if (!currentReplay) return;
    set({ currentRoundIndex: currentReplay.rounds.length - 1 });
  },
}));
