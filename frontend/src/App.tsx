import { useEffect, useRef, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ArenaLobby } from '@/pages/ArenaLobby';
import { Leaderboard } from '@/pages/Leaderboard';
import { TournamentBoard } from '@/pages/TournamentBoard';
import { LiveMatchView } from '@/pages/LiveMatchView';
import { EvolutionDashboard } from '@/pages/EvolutionDashboard';
import { SpectatorHub } from '@/pages/SpectatorHub';
import { AgentProfile } from '@/pages/AgentProfile';
import { HeadToHead } from '@/pages/HeadToHead';
import { AnalyticsDashboard } from '@/pages/AnalyticsDashboard';
import { SpectatorLeaderboard } from '@/pages/SpectatorLeaderboard';
import { ReplayPage } from '@/pages/ReplayPage';
import { AchievementsPage } from '@/pages/AchievementsPage';
import { TokenPage } from '@/pages/TokenPage';
import { A2ACommandCenter } from '@/pages/A2ACommandCenter';
import { LiveDashboard } from '@/pages/LiveDashboard';
import { SeasonPage } from '@/pages/SeasonPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { BettorProfilePage } from '@/pages/BettorProfilePage';
import { NotFound } from '@/pages/NotFound';
import { NetworkStatus } from '@/components/ui/NetworkStatus';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { initializeRealtimeListeners } from '@/stores/realtimeStore';

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
      <NetworkStatus />
    </ErrorBoundary>
  );
}
