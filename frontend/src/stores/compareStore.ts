import { create } from 'zustand';

interface CompareState {
  isOpen: boolean;
  agent1: string | null;
  agent2: string | null;
  addToCompare: (address: string) => void;
  removeFromCompare: (address: string) => void;
  clearCompare: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useCompareStore = create<CompareState>()((set, get) => ({
  isOpen: false,
  agent1: null,
  agent2: null,

  addToCompare: (address: string) => {
    const { agent1, agent2 } = get();
    const addr = address.toLowerCase();
    // Don't add if already in compare
    if (agent1?.toLowerCase() === addr || agent2?.toLowerCase() === addr) return;
    if (!agent1) {
      set({ agent1: addr });
    } else if (!agent2) {
      set({ agent2: addr, isOpen: true });
    } else {
      // Replace agent2 and keep agent1
      set({ agent2: addr, isOpen: true });
    }
  },

  removeFromCompare: (address: string) => {
    const { agent1, agent2 } = get();
    const addr = address.toLowerCase();
    if (agent1?.toLowerCase() === addr) set({ agent1: agent2, agent2: null });
    else if (agent2?.toLowerCase() === addr) set({ agent2: null });
  },

  clearCompare: () => set({ agent1: null, agent2: null, isOpen: false }),
  openDrawer: () => set({ isOpen: true }),
  closeDrawer: () => set({ isOpen: false }),
}));
