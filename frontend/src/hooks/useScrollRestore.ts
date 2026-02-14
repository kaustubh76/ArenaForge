import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const SCROLL_KEY = 'arenaforge_scroll_positions';

/**
 * Saves scroll position per route and restores it on POP (back/forward) navigation.
 * Uses sessionStorage so positions survive within the session but not across tabs.
 */
export function useScrollRestore() {
  const location = useLocation();
  const navType = useNavigationType();
  const prevPath = useRef(location.pathname);

  // Save scroll position when leaving a page
  useEffect(() => {
    const save = () => {
      try {
        const stored = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}');
        stored[prevPath.current] = window.scrollY;
        sessionStorage.setItem(SCROLL_KEY, JSON.stringify(stored));
      } catch { /* ignore quota errors */ }
    };

    return () => {
      save();
      prevPath.current = location.pathname;
    };
  }, [location.pathname]);

  // Restore on POP navigation (back/forward)
  useEffect(() => {
    if (navType === 'POP') {
      try {
        const stored = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || '{}');
        const y = stored[location.pathname];
        if (typeof y === 'number' && y > 0) {
          // Delay to let content render first
          requestAnimationFrame(() => {
            window.scrollTo(0, y);
          });
        }
      } catch { /* ignore */ }
    }
  }, [location.pathname, navType]);
}
