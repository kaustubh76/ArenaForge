import { useEffect, useCallback } from 'react';

/**
 * Enables left/right arrow key navigation for tabbed UIs.
 * Wraps around at boundaries. Only active when no input/textarea is focused.
 */
export function useTabKeyboard<T>(
  tabs: readonly T[],
  activeTab: T,
  setActiveTab: (tab: T) => void,
) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't hijack keys when user is typing
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const idx = tabs.indexOf(activeTab);
        if (idx === -1) return;
        const next =
          e.key === 'ArrowRight'
            ? (idx + 1) % tabs.length
            : (idx - 1 + tabs.length) % tabs.length;
        setActiveTab(tabs[next]);
      }
    },
    [tabs, activeTab, setActiveTab],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
