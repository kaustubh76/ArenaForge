import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { ScanlineOverlay } from '@/components/arcade/ScanlineOverlay';
import { ArcadeHeader } from './ArcadeHeader';
import { ArcadeFooter } from './ArcadeFooter';
import { ActivityFeedPanel } from '@/components/activity/ActivityFeedPanel';
import { GlobalNotifications } from '@/components/notifications/GlobalNotifications';
import { CompareDrawer, CompareFloatingPill } from '@/components/compare/CompareDrawer';
import { CommandPalette } from '@/components/search/CommandPalette';
import { initializeActivityFeedWatcher } from '@/stores/activityFeedStore';

// Start watching realtimeStore for new events
initializeActivityFeedWatcher();

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const handleClosePalette = useCallback(() => setPaletteOpen(false), []);
  const location = useLocation();
  const [pageKey, setPageKey] = useState(0);

  // Re-trigger entrance animation on route change
  useEffect(() => {
    setPageKey(k => k + 1);
  }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-surface-0 relative">
      {/* Background layers */}
      <div className="mesh-bg" aria-hidden="true" />
      <div className="grid-pattern" aria-hidden="true" />
      <div className="noise-overlay" aria-hidden="true" />
      <ScanlineOverlay />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <ArcadeHeader />
        <div className="divider-glow" />
        <main
          key={pageKey}
          className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 animate-fade-in-up opacity-0"
          style={{ animationDuration: '0.35s', animationFillMode: 'forwards' }}
        >
          <Outlet />
        </main>
        <ArcadeFooter />
      </div>
      <ActivityFeedPanel />
      <GlobalNotifications />
      <CompareDrawer />
      <CompareFloatingPill />
      <CommandPalette open={paletteOpen} onClose={handleClosePalette} />
    </div>
  );
}
