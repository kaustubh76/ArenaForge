import { get, set, del, createStore } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

// Create a custom IndexedDB store for ArenaForge
const arenaStore = createStore('arenaforge-db', 'arenaforge-store');

/**
 * IndexedDB storage adapter for Zustand persist middleware.
 * Provides async storage that persists across sessions and survives page refreshes.
 */
export const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const value = await get<string>(name, arenaStore);
      return value ?? null;
    } catch (err) {
      console.warn('[IndexedDB] Failed to get item:', name, err);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await set(name, value, arenaStore);
    } catch (err) {
      console.warn('[IndexedDB] Failed to set item:', name, err);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await del(name, arenaStore);
    } catch (err) {
      console.warn('[IndexedDB] Failed to remove item:', name, err);
    }
  },
};

/**
 * Cache TTL in milliseconds (5 minutes).
 * Data older than this will be considered stale and refreshed.
 */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Check if cached data is still fresh.
 */
export function isCacheFresh(timestamp: number | undefined): boolean {
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL_MS;
}

/**
 * Network status detection for offline support.
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/**
 * Create a network status listener.
 */
export function createNetworkListener(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
