// Activity Feed UI state management

import { create } from "zustand";
import { useRealtimeStore } from "./realtimeStore";

interface ActivityFeedUIState {
  isOpen: boolean;
  unreadCount: number;
  lastReadTimestamp: number;
  soundEnabled: boolean;

  // Actions
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  markAllRead: () => void;
  incrementUnread: () => void;
  toggleSound: () => void;
}

const SOUND_KEY = "moltiverse-feed-sound";

export const useActivityFeedStore = create<ActivityFeedUIState>((set) => ({
  isOpen: false,
  unreadCount: 0,
  lastReadTimestamp: Date.now(),
  soundEnabled: localStorage.getItem(SOUND_KEY) !== "false",

  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),
  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),

  markAllRead: () => set({ unreadCount: 0, lastReadTimestamp: Date.now() }),

  incrementUnread: () =>
    set((s) => (s.isOpen ? s : { unreadCount: s.unreadCount + 1 })),

  toggleSound: () =>
    set((s) => {
      const next = !s.soundEnabled;
      localStorage.setItem(SOUND_KEY, String(next));
      return { soundEnabled: next };
    }),
}));

// Subscribe to new events from realtimeStore to increment unread count
let feedWatcherInitialized = false;

export function initializeActivityFeedWatcher(): void {
  if (feedWatcherInitialized) return;
  feedWatcherInitialized = true;

  let prevLength = useRealtimeStore.getState().recentEvents.length;

  useRealtimeStore.subscribe((state) => {
    const newLength = state.recentEvents.length;
    if (newLength > prevLength) {
      const added = newLength - prevLength;
      const feedStore = useActivityFeedStore.getState();
      for (let i = 0; i < added; i++) {
        feedStore.incrementUnread();
      }

      // Play notification beep if sound enabled
      if (feedStore.soundEnabled && !feedStore.isOpen) {
        playNotificationBeep();
      }
    }
    prevLength = newLength;
  });
}

// Web Audio API notification beep (no dependencies)
let audioCtx: AudioContext | null = null;

function playNotificationBeep(): void {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(audioCtx.currentTime + 0.06);
  } catch {
    // Audio not available
  }
}
