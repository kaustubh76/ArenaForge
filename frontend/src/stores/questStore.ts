import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type QuestType = 'daily' | 'weekly';
export type QuestCategory = 'predict' | 'watch' | 'social' | 'explore' | 'bet';

export interface Quest {
  id: string;
  title: string;
  description: string;
  category: QuestCategory;
  type: QuestType;
  target: number;
  xpReward: number;
  icon: string;
}

export interface QuestProgress {
  questId: string;
  current: number;
  completed: boolean;
  claimedAt?: number;
}

// Fixed quest pool — daily quests rotate, weekly quests are larger
const DAILY_QUESTS: Quest[] = [
  { id: 'daily-predict-3', title: 'Fortune Teller', description: 'Make 3 match predictions', category: 'predict', type: 'daily', target: 3, xpReward: 50, icon: '🔮' },
  { id: 'daily-watch-2', title: 'Spectator', description: 'Watch 2 live matches', category: 'watch', type: 'daily', target: 2, xpReward: 30, icon: '👀' },
  { id: 'daily-visit-3', title: 'Explorer', description: 'Visit 3 different pages', category: 'explore', type: 'daily', target: 3, xpReward: 20, icon: '🗺️' },
  { id: 'daily-predict-correct', title: 'Oracle', description: 'Get 1 prediction correct', category: 'predict', type: 'daily', target: 1, xpReward: 75, icon: '✨' },
  { id: 'daily-compare', title: 'Analyst', description: 'Compare 2 agents', category: 'social', type: 'daily', target: 2, xpReward: 25, icon: '⚖️' },
  { id: 'daily-favorite', title: 'Fan Club', description: 'Favorite an agent', category: 'social', type: 'daily', target: 1, xpReward: 15, icon: '⭐' },
];

const WEEKLY_QUESTS: Quest[] = [
  { id: 'weekly-predict-15', title: 'Master Predictor', description: 'Make 15 predictions this week', category: 'predict', type: 'weekly', target: 15, xpReward: 200, icon: '🎯' },
  { id: 'weekly-accuracy', title: 'Sharp Eye', description: 'Get 5 predictions correct', category: 'predict', type: 'weekly', target: 5, xpReward: 300, icon: '🏹' },
  { id: 'weekly-watch-10', title: 'Dedicated Viewer', description: 'Watch 10 matches', category: 'watch', type: 'weekly', target: 10, xpReward: 150, icon: '📺' },
  { id: 'weekly-explore', title: 'Deep Diver', description: 'Visit all main pages', category: 'explore', type: 'weekly', target: 8, xpReward: 100, icon: '🌊' },
];

// Get today's date key (YYYY-MM-DD)
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Get current week key (YYYY-Www)
function weekKey(): string {
  const d = new Date();
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Pick N quests deterministically from pool using day seed
function pickQuests(pool: Quest[], n: number, seed: string): Quest[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const shuffled = [...pool].sort((a, b) => {
    const ha = ((hash * 31 + a.id.length) ^ (hash >>> 3)) & 0x7fffffff;
    const hb = ((hash * 31 + b.id.length) ^ (hash >>> 3)) & 0x7fffffff;
    return ha - hb;
  });
  return shuffled.slice(0, n);
}

interface QuestState {
  // Date keys for rotation
  lastDailyDate: string;
  lastWeeklyDate: string;

  // Active quests
  activeDailyQuests: Quest[];
  activeWeeklyQuests: Quest[];

  // Progress tracking
  progress: Record<string, QuestProgress>;

  // XP
  totalXP: number;
  level: number;

  // Actions
  refreshQuests: () => void;
  incrementProgress: (questId: string, amount?: number) => void;
  claimQuest: (questId: string) => void;
  trackAction: (category: QuestCategory, amount?: number) => void;
  getActiveQuests: () => Array<Quest & { progress: QuestProgress }>;
}

export const useQuestStore = create<QuestState>()(
  persist(
    (set, get) => ({
      lastDailyDate: '',
      lastWeeklyDate: '',
      activeDailyQuests: [],
      activeWeeklyQuests: [],
      progress: {},
      totalXP: 0,
      level: 1,

      refreshQuests: () => {
        const today = todayKey();
        const week = weekKey();
        const state = get();
        const updates: Partial<QuestState> = {};

        if (state.lastDailyDate !== today) {
          updates.lastDailyDate = today;
          updates.activeDailyQuests = pickQuests(DAILY_QUESTS, 3, today);
          // Reset daily progress
          const newProgress = { ...state.progress };
          DAILY_QUESTS.forEach(q => { delete newProgress[q.id]; });
          updates.progress = newProgress;
        }

        if (state.lastWeeklyDate !== week) {
          updates.lastWeeklyDate = week;
          updates.activeWeeklyQuests = pickQuests(WEEKLY_QUESTS, 2, week);
          // Reset weekly progress
          const newProgress = { ...(updates.progress ?? state.progress) };
          WEEKLY_QUESTS.forEach(q => { delete newProgress[q.id]; });
          updates.progress = newProgress;
        }

        if (Object.keys(updates).length > 0) {
          set(updates as Partial<QuestState>);
        }
      },

      incrementProgress: (questId, amount = 1) => {
        set(state => {
          const existing = state.progress[questId] ?? { questId, current: 0, completed: false };
          const quest = [...state.activeDailyQuests, ...state.activeWeeklyQuests].find(q => q.id === questId);
          const newCurrent = Math.min(existing.current + amount, quest?.target ?? 999);
          const completed = quest ? newCurrent >= quest.target : false;

          return {
            progress: {
              ...state.progress,
              [questId]: { ...existing, questId, current: newCurrent, completed },
            },
          };
        });
      },

      claimQuest: (questId) => {
        const state = get();
        const quest = [...state.activeDailyQuests, ...state.activeWeeklyQuests].find(q => q.id === questId);
        const prog = state.progress[questId];
        if (!quest || !prog?.completed || prog.claimedAt) return;

        const newXP = state.totalXP + quest.xpReward;
        // Level up every 500 XP
        const newLevel = Math.floor(newXP / 500) + 1;

        set({
          totalXP: newXP,
          level: newLevel,
          progress: {
            ...state.progress,
            [questId]: { ...prog, claimedAt: Date.now() },
          },
        });
      },

      trackAction: (category, amount = 1) => {
        const state = get();
        const allActive = [...state.activeDailyQuests, ...state.activeWeeklyQuests];
        const matching = allActive.filter(q => q.category === category);
        for (const quest of matching) {
          const prog = state.progress[quest.id];
          if (!prog?.completed) {
            get().incrementProgress(quest.id, amount);
          }
        }
      },

      getActiveQuests: () => {
        const state = get();
        const allQuests = [...state.activeDailyQuests, ...state.activeWeeklyQuests];
        return allQuests.map(q => ({
          ...q,
          progress: state.progress[q.id] ?? { questId: q.id, current: 0, completed: false },
        }));
      },
    }),
    {
      name: 'quest-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
