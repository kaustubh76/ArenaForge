import { useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ArenaLobby } from '@/pages/ArenaLobby';
import { NetworkStatus } from '@/components/ui/NetworkStatus';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { initializeRealtimeListeners } from '@/stores/realtimeStore';

// Lazy-loaded page components (code-split per route)
const Leaderboard = lazy(() => import('@/pages/Leaderboard').then(m => ({ default: m.Leaderboard })));
const TournamentBoard = lazy(() => import('@/pages/TournamentBoard').then(m => ({ default: m.TournamentBoard })));
const LiveMatchView = lazy(() => import('@/pages/LiveMatchView').then(m => ({ default: m.LiveMatchView })));
const EvolutionDashboard = lazy(() => import('@/pages/EvolutionDashboard').then(m => ({ default: m.EvolutionDashboard })));
const SpectatorHub = lazy(() => import('@/pages/SpectatorHub').then(m => ({ default: m.SpectatorHub })));
const AgentProfile = lazy(() => import('@/pages/AgentProfile').then(m => ({ default: m.AgentProfile })));
const HeadToHead = lazy(() => import('@/pages/HeadToHead').then(m => ({ default: m.HeadToHead })));
const AnalyticsDashboard = lazy(() => import('@/pages/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
const SpectatorLeaderboard = lazy(() => import('@/pages/SpectatorLeaderboard').then(m => ({ default: m.SpectatorLeaderboard })));
const ReplayPage = lazy(() => import('@/pages/ReplayPage').then(m => ({ default: m.ReplayPage })));
const AchievementsPage = lazy(() => import('@/pages/AchievementsPage').then(m => ({ default: m.AchievementsPage })));
const TokenPage = lazy(() => import('@/pages/TokenPage').then(m => ({ default: m.TokenPage })));
const A2ACommandCenter = lazy(() => import('@/pages/A2ACommandCenter').then(m => ({ default: m.A2ACommandCenter })));
const LiveDashboard = lazy(() => import('@/pages/LiveDashboard').then(m => ({ default: m.LiveDashboard })));
const SeasonPage = lazy(() => import('@/pages/SeasonPage').then(m => ({ default: m.SeasonPage })));
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage').then(m => ({ default: m.FavoritesPage })));
const BettorProfilePage = lazy(() => import('@/pages/BettorProfilePage').then(m => ({ default: m.BettorProfilePage })));
const NotFound = lazy(() => import('@/pages/NotFound').then(m => ({ default: m.NotFound })));

function PageFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-arcade-purple border-t-transparent rounded-full animate-spin" />
        <span className="font-pixel text-xs text-gray-500">LOADING...</span>
      </div>
    </div>
  );
}

const BASE_INTERVAL = 10_000;
const MAX_INTERVAL = 60_000;

export function App() {
  const fetchArena = useArenaStore(s => s.fetchFromChain);
  const fetchAgents = useAgentStore(s => s.fetchFromChain);
  const intervalRef = useRef<ReturnType<typeof setTimeout>>();
  const delayRef = useRef(BASE_INTERVAL);

  const poll = useCallback(async () => {
    // Sequential fetches to respect RPC rate limit (15 req/sec)
    const arenaOk = await fetchArena();
    const agentOk = await fetchAgents();
    if (arenaOk && agentOk) {
      delayRef.current = BASE_INTERVAL;
    } else {
      delayRef.current = Math.min(delayRef.current * 2, MAX_INTERVAL);
    }
    intervalRef.current = setTimeout(poll, delayRef.current);
  }, [fetchArena, fetchAgents]);

  useEffect(() => {
    // Initialize WebSocket real-time listeners
    initializeRealtimeListeners();
    // Start polling for data
    poll();
    return () => { if (intervalRef.current) clearTimeout(intervalRef.current); };
  }, [poll]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<ArenaLobby />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/tournament/:id" element={<TournamentBoard />} />
            <Route path="/match/:id" element={<LiveMatchView />} />
            <Route path="/evolution" element={<EvolutionDashboard />} />
            <Route path="/spectator" element={<SpectatorHub />} />
            <Route path="/spectator/leaderboard" element={<SpectatorLeaderboard />} />
            <Route path="/agent/:address" element={<AgentProfile />} />
            <Route path="/h2h/:agent1/:agent2" element={<HeadToHead />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            <Route path="/replay/:id" element={<ReplayPage />} />
            <Route path="/token" element={<TokenPage />} />
            <Route path="/a2a" element={<A2ACommandCenter />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/dashboard" element={<LiveDashboard />} />
            <Route path="/season" element={<SeasonPage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/bettor/:address" element={<BettorProfilePage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
      <NetworkStatus />
    </ErrorBoundary>
  );
}
