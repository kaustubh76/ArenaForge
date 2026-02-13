import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light' | 'arcade';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'arcade',

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },

      toggleTheme: () => {
        const { theme } = get();
        const next: Theme = theme === 'arcade' ? 'dark' : theme === 'dark' ? 'light' : 'arcade';
        set({ theme: next });
        applyTheme(next);
      },
    }),
    {
      name: 'theme-store',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme);
        }
      },
    }
  )
);

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // Remove all theme classes
  root.classList.remove('theme-dark', 'theme-light', 'theme-arcade');

  // Add current theme class
  root.classList.add(`theme-${theme}`);

  // Update CSS variables based on theme
  if (theme === 'light') {
    root.style.setProperty('--surface-0', '#f5f5f7');
    root.style.setProperty('--surface-1', '#ffffff');
    root.style.setProperty('--surface-2', '#f0f0f2');
    root.style.setProperty('--surface-3', '#e5e5e8');
    root.style.setProperty('--surface-4', '#d5d5d8');
    root.style.setProperty('--text-primary', '#1a1a1a');
    root.style.setProperty('--text-secondary', '#4a4a4a');
    root.style.setProperty('--text-muted', '#6a6a6a');
  } else if (theme === 'dark') {
    root.style.setProperty('--surface-0', '#0f0f14');
    root.style.setProperty('--surface-1', '#16161d');
    root.style.setProperty('--surface-2', '#1d1d26');
    root.style.setProperty('--surface-3', '#24242f');
    root.style.setProperty('--surface-4', '#2b2b38');
    root.style.setProperty('--text-primary', '#ffffff');
    root.style.setProperty('--text-secondary', '#a0a0a0');
    root.style.setProperty('--text-muted', '#606060');
  } else {
    // Arcade theme (default)
    root.style.setProperty('--surface-0', '#050508');
    root.style.setProperty('--surface-1', '#0a0a10');
    root.style.setProperty('--surface-2', '#101018');
    root.style.setProperty('--surface-3', '#161622');
    root.style.setProperty('--surface-4', '#1c1c2e');
    root.style.setProperty('--text-primary', '#ffffff');
    root.style.setProperty('--text-secondary', '#a0a0a0');
    root.style.setProperty('--text-muted', '#606060');
  }
}
