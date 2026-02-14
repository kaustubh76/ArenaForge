import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Star, TrendingUp, TrendingDown, Swords, Trophy, Trash2, Eye, Search, BarChart3 } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useAgentStore } from '@/stores/agentStore';
import { useArenaStore } from '@/stores/arenaStore';
import { FavoriteButton } from '@/components/agent/FavoriteButton';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import type { AgentProfileExtended, Match } from '@/types/arena';

// ── Types ──────────────────────────────────────────────────────────────

interface FavoriteAgentData {
  address: string;
  agent: AgentProfileExtended | null;
  recentMatches: Match[];
  isLive: boolean; // currently in an active match
  relationshipType: 'ALLY' | 'RIVAL' | 'NEUTRAL';
}

type SortKey = 'elo' | 'winRate' | 'matches' | 'streak' | 'name';

// ── Helpers ────────────────────────────────────────────────────────────

function getRecentMatchesForAgent(allMatches: Match[], address: string): Match[] {
  const addr = address.toLowerCase();
  return allMatches
    .filter((m) => m.player1.toLowerCase() === addr || m.player2.toLowerCase() === addr)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 5);
}

function isAgentInLiveMatch(allMatches: Match[], address: string): boolean {
  const addr = address.toLowerCase();
  return allMatches.some(
    (m) =>
      m.status === 1 && // IN_PROGRESS
      (m.player1.toLowerCase() === addr || m.player2.toLowerCase() === addr),
  );
}

function getMatchResult(match: Match, address: string): 'win' | 'loss' | 'draw' | 'pending' {
  if (!match.winner) return 'pending';
  if (match.winner.toLowerCase() === address.toLowerCase()) return 'win';
  if (match.winner === '0x0000000000000000000000000000000000000000') return 'draw';
  return 'loss';
}

function sortFavorites(list: FavoriteAgentData[], key: SortKey, asc: boolean): FavoriteAgentData[] {
  const sorted = [...list];
  sorted.sort((a, b) => {
    const aa = a.agent;
    const bb = b.agent;
    if (!aa && !bb) return 0;
    if (!aa) return 1;
    if (!bb) return -1;

    let va: number, vb: number;
    switch (key) {
      case 'elo':
        va = aa.elo;
        vb = bb.elo;
        break;
      case 'winRate':
        va = aa.winRate;
        vb = bb.winRate;
        break;
      case 'matches':
        va = aa.matchesPlayed;
        vb = bb.matchesPlayed;
        break;
      case 'streak':
        va = aa.streak;
        vb = bb.streak;
        break;
      case 'name':
        return asc
          ? aa.agentAddress.localeCompare(bb.agentAddress)
          : bb.agentAddress.localeCompare(aa.agentAddress);
    }
    return asc ? va - vb : vb - va;
  });
  return sorted;
}

// ── Stat Summary ───────────────────────────────────────────────────────

function FavoriteStats({ agents }: { agents: FavoriteAgentData[] }) {
  const stats = useMemo(() => {
    const withData = agents.filter((a) => a.agent);
    if (withData.length === 0) return null;

    const avgElo = Math.round(
      withData.reduce((s, a) => s + (a.agent?.elo ?? 0), 0) / withData.length,
    );
    const avgWinRate =
      withData.reduce((s, a) => s + (a.agent?.winRate ?? 0), 0) / withData.length;
    const liveCount = agents.filter((a) => a.isLive).length;
    const totalMatches = withData.reduce((s, a) => s + (a.agent?.matchesPlayed ?? 0), 0);

    return { avgElo, avgWinRate, liveCount, totalMatches, count: withData.length };
  }, [agents]);

  if (!stats) return null;

  const cards = [
    { label: 'Following', value: stats.count, icon: Star, color: 'text-arcade-gold' },
    { label: 'Avg ELO', value: stats.avgElo, icon: TrendingUp, color: 'text-arcade-cyan' },
    {
      label: 'Avg Win %',
      value: `${stats.avgWinRate.toFixed(1)}%`,
      icon: Trophy,
      color: 'text-arcade-green',
    },
    { label: 'Live Now', value: stats.liveCount, icon: Eye, color: 'text-arcade-pink' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="arcade-card p-4 text-center">
          <c.icon size={18} className={clsx(c.color, 'mx-auto mb-2')} />
          <div className="text-xl font-bold font-mono text-white">{c.value}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Match Result Dots ──────────────────────────────────────────────────

function RecentForm({ matches, address }: { matches: Match[]; address: string }) {
  if (matches.length === 0) {
    return <span className="text-xs text-gray-600">No matches</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {matches.map((m) => {
        const result = getMatchResult(m, address);
        return (
          <Link
            key={m.id}
            to={`/match/${m.id}`}
            className={clsx(
              'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-125',
              result === 'win' && 'bg-arcade-green/20 text-arcade-green border border-arcade-green/40',
              result === 'loss' && 'bg-red-500/20 text-red-400 border border-red-500/40',
              result === 'draw' && 'bg-gray-500/20 text-gray-400 border border-gray-500/40',
              result === 'pending' && 'bg-arcade-cyan/20 text-arcade-cyan border border-arcade-cyan/40 animate-pulse',
            )}
            title={`Match #${m.id} — ${result}`}
          >
            {result === 'win' ? 'W' : result === 'loss' ? 'L' : result === 'draw' ? 'D' : '?'}
          </Link>
        );
      })}
    </div>
  );
}

// ── Agent Card ─────────────────────────────────────────────────────────

function FavoriteAgentCard({ data }: { data: FavoriteAgentData }) {
  const { address, agent, recentMatches, isLive, relationshipType } = data;

  if (!agent) {
    return (
      <div className="arcade-card p-4 opacity-60">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-mono text-sm text-gray-400">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            <p className="text-xs text-gray-600 mt-1">Agent data unavailable</p>
          </div>
          <FavoriteButton agentAddress={address} size="sm" />
        </div>
      </div>
    );
  }

  const winRate = agent.winRate ?? (agent.matchesPlayed > 0 ? (agent.wins / agent.matchesPlayed) * 100 : 0);

  return (
    <div
      className={clsx(
        'arcade-card p-4 transition-all hover:border-arcade-purple/30',
        isLive && 'ring-1 ring-arcade-pink/40',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <Link
            to={`/agent/${address}`}
            className="flex items-center gap-2 group"
          >
            {agent.avatarUrl ? (
              <img
                src={agent.avatarUrl}
                alt=""
                className="w-8 h-8 rounded-full ring-1 ring-white/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center">
                <Swords size={14} className="text-gray-500" />
              </div>
            )}
            <div>
              <span className="font-mono text-sm text-gray-200 group-hover:text-arcade-cyan transition-colors">
                {agent.moltbookHandle || `${address.slice(0, 6)}...${address.slice(-4)}`}
              </span>
              {isLive && (
                <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-arcade-pink font-bold uppercase">
                  <span className="w-1.5 h-1.5 rounded-full bg-arcade-pink animate-pulse" />
                  LIVE
                </span>
              )}
              {relationshipType === 'ALLY' && <GlowBadge color="green" label="ALLY" />}
              {relationshipType === 'RIVAL' && <GlowBadge color="pink" label="RIVAL" />}
            </div>
          </Link>
        </div>
        <FavoriteButton agentAddress={address} size="sm" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <div className="text-center">
          <div className="text-sm font-bold font-mono text-white">{agent.elo}</div>
          <div className="text-[9px] text-gray-500 uppercase">ELO</div>
        </div>
        <div className="text-center">
          <div
            className={clsx(
              'text-sm font-bold font-mono',
              winRate >= 60 ? 'text-arcade-green' : winRate >= 45 ? 'text-gray-300' : 'text-red-400',
            )}
          >
            {winRate.toFixed(1)}%
          </div>
          <div className="text-[9px] text-gray-500 uppercase">Win %</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-mono text-gray-300">
            <span className="text-arcade-green">{agent.wins}</span>
            <span className="text-gray-600">/</span>
            <span className="text-red-400">{agent.losses}</span>
          </div>
          <div className="text-[9px] text-gray-500 uppercase">W/L</div>
        </div>
        <div className="text-center">
          <div
            className={clsx(
              'text-sm font-bold font-mono flex items-center justify-center gap-0.5',
              agent.streak > 0 ? 'text-arcade-green' : agent.streak < 0 ? 'text-red-400' : 'text-gray-500',
            )}
          >
            {agent.streak > 0 ? (
              <TrendingUp size={12} />
            ) : agent.streak < 0 ? (
              <TrendingDown size={12} />
            ) : null}
            {Math.abs(agent.streak)}
          </div>
          <div className="text-[9px] text-gray-500 uppercase">Streak</div>
        </div>
      </div>

      {/* Recent form */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
        <span className="text-[10px] text-gray-500 uppercase">Recent</span>
        <RecentForm matches={recentMatches} address={address} />
      </div>
    </div>
  );
}

// ── Favorites Comparison Matrix ────────────────────────────────────────

function FavoritesComparison({ agents }: { agents: FavoriteAgentData[] }) {
  const withData = agents.filter(a => a.agent).slice(0, 6);
  if (withData.length < 2) return null;

  const maxElo = Math.max(...withData.map(a => a.agent!.elo));
  const minElo = Math.min(...withData.map(a => a.agent!.elo));
  const eloRange = maxElo - minElo || 1;
  const maxMatches = Math.max(...withData.map(a => a.agent!.matchesPlayed), 1);

  return (
    <div className="arcade-card p-5">
      <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase mb-4 flex items-center gap-2">
        <BarChart3 size={14} className="text-arcade-purple" />
        Comparison Matrix
        <span className="text-[10px] text-gray-600 font-normal ml-1">Top {withData.length} favorites</span>
      </h3>

      <div className="space-y-3">
        {/* ELO Comparison */}
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">ELO Rating</div>
          <div className="space-y-1.5">
            {withData.map(d => {
              const agent = d.agent!;
              const pct = eloRange > 0 ? ((agent.elo - minElo) / eloRange) * 100 : 50;
              const name = agent.moltbookHandle || `${d.address.slice(0, 6)}...`;
              return (
                <div key={d.address} className="flex items-center gap-2">
                  <Link to={`/agent/${d.address}`} className="w-20 text-[10px] font-mono text-gray-300 truncate hover:text-arcade-cyan transition-colors">
                    {name}
                  </Link>
                  <div className="flex-1 h-5 bg-surface-0 rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all duration-700"
                      style={{
                        width: `${Math.max(pct, 8)}%`,
                        background: `linear-gradient(90deg, rgba(168,85,247,0.4), rgba(34,211,238,0.6))`,
                      }}
                    />
                    <span className="absolute right-2 top-0 h-full flex items-center text-[10px] font-mono font-bold text-white">
                      {agent.elo}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Win Rate Comparison */}
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Win Rate</div>
          <div className="space-y-1.5">
            {withData.map(d => {
              const agent = d.agent!;
              const wr = agent.winRate ?? (agent.matchesPlayed > 0 ? (agent.wins / agent.matchesPlayed) * 100 : 0);
              const name = agent.moltbookHandle || `${d.address.slice(0, 6)}...`;
              return (
                <div key={d.address} className="flex items-center gap-2">
                  <div className="w-20 text-[10px] font-mono text-gray-300 truncate">{name}</div>
                  <div className="flex-1 h-5 bg-surface-0 rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all duration-700"
                      style={{
                        width: `${Math.max(wr, 2)}%`,
                        backgroundColor: wr >= 60 ? 'rgba(34, 197, 94, 0.5)' : wr >= 45 ? 'rgba(168, 85, 247, 0.4)' : 'rgba(244, 63, 94, 0.4)',
                      }}
                    />
                    <span className={clsx(
                      'absolute right-2 top-0 h-full flex items-center text-[10px] font-mono font-bold',
                      wr >= 60 ? 'text-arcade-green' : wr >= 45 ? 'text-gray-200' : 'text-red-400',
                    )}>
                      {wr.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Experience (Matches Played) */}
        <div>
          <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Experience</div>
          <div className="space-y-1.5">
            {withData.map(d => {
              const agent = d.agent!;
              const pct = (agent.matchesPlayed / maxMatches) * 100;
              const name = agent.moltbookHandle || `${d.address.slice(0, 6)}...`;
              return (
                <div key={d.address} className="flex items-center gap-2">
                  <div className="w-20 text-[10px] font-mono text-gray-300 truncate">{name}</div>
                  <div className="flex-1 h-5 bg-surface-0 rounded-md overflow-hidden relative">
                    <div
                      className="h-full rounded-md transition-all duration-700"
                      style={{
                        width: `${Math.max(pct, 5)}%`,
                        backgroundColor: 'rgba(255, 215, 0, 0.35)',
                      }}
                    />
                    <span className="absolute right-2 top-0 h-full flex items-center text-[10px] font-mono font-bold text-arcade-gold">
                      {agent.matchesPlayed}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Matchup Predictions (pairwise) */}
        {withData.length >= 2 && withData.length <= 4 && (
          <div>
            <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Matchup Predictions</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {withData.flatMap((a, i) =>
                withData.slice(i + 1).map(b => {
                  const agA = a.agent!;
                  const agB = b.agent!;
                  const eloDiff = agA.elo - agB.elo;
                  const prob = 1 / (1 + Math.pow(10, -eloDiff / 400));
                  const pctA = Math.round(prob * 100);
                  const nameA = agA.moltbookHandle || `${a.address.slice(0, 6)}...`;
                  const nameB = agB.moltbookHandle || `${b.address.slice(0, 6)}...`;
                  return (
                    <Link
                      key={`${a.address}-${b.address}`}
                      to={`/h2h/${a.address}/${b.address}`}
                      className="flex items-center gap-2 p-2 rounded-lg bg-surface-1 hover:bg-surface-2 transition-colors"
                    >
                      <div className="flex-1 text-right">
                        <div className="text-[10px] font-mono text-arcade-cyan truncate">{nameA}</div>
                        <div className="text-xs font-mono font-bold text-arcade-cyan">{pctA}%</div>
                      </div>
                      <div className="w-16 h-3 bg-surface-0 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-arcade-cyan/50 transition-all duration-500"
                          style={{ width: `${pctA}%` }}
                        />
                        <div
                          className="h-full bg-arcade-pink/50 transition-all duration-500"
                          style={{ width: `${100 - pctA}%` }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-mono text-arcade-pink truncate">{nameB}</div>
                        <div className="text-xs font-mono font-bold text-arcade-pink">{100 - pctA}%</div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────

import { EmptyFavorites as EmptyFavoritesBase } from '@/components/arcade/EmptyState';

function EmptyFavorites() {
  return <EmptyFavoritesBase onAction={() => { window.location.href = '/leaderboard'; }} />;
}

// ── Main Page ──────────────────────────────────────────────────────────

export function FavoritesPage() {
  const favoriteAddresses = useFavoritesStore((s) => s.favoriteAgents);
  const clearFavorites = useFavoritesStore((s) => s.clearFavorites);
  const agents = useAgentStore((s) => s.agents);
  const getAgentByAddress = useAgentStore((s) => s.getAgentByAddress);
  const allMatches = useArenaStore((s) => s.allMatches) as Match[];

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [sortKey, setSortKey] = useState<SortKey>('elo');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [relFilter, setRelFilter] = useState<'all' | 'allies' | 'rivals'>('all');

  // A2A relationships
  const [allRelationships, setAllRelationships] = useState<Array<{
    agent1: string; agent2: string; isRival: boolean; isAlly: boolean;
  }>>([]);

  useEffect(() => {
    const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';
    fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `{ allRelationships { agent1 agent2 isRival isAlly } }`,
      }),
    })
      .then(r => r.json())
      .then(json => {
        if (json.data?.allRelationships) setAllRelationships(json.data.allRelationships);
      })
      .catch(() => {});
  }, []);

  // Build enriched favorite data
  const favoriteData = useMemo<FavoriteAgentData[]>(() => {
    return favoriteAddresses.map((addr) => {
      const agent = getAgentByAddress(addr) ?? null;
      const recentMatches = allMatches ? getRecentMatchesForAgent(allMatches, addr) : [];
      const isLive = allMatches ? isAgentInLiveMatch(allMatches, addr) : false;

      // Determine A2A relationship
      const addrLower = addr.toLowerCase();
      const rel = allRelationships.find(r =>
        r.agent1.toLowerCase() === addrLower || r.agent2.toLowerCase() === addrLower
      );
      const relationshipType: 'ALLY' | 'RIVAL' | 'NEUTRAL' = rel?.isAlly ? 'ALLY' : rel?.isRival ? 'RIVAL' : 'NEUTRAL';

      return { address: addr, agent, recentMatches, isLive, relationshipType };
    });
  }, [favoriteAddresses, agents, allMatches, getAgentByAddress, allRelationships]);

  // Filter and sort
  const displayData = useMemo(() => {
    let list = favoriteData;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (d) =>
          d.address.toLowerCase().includes(q) ||
          (d.agent?.moltbookHandle && d.agent.moltbookHandle.toLowerCase().includes(q)),
      );
    }
    if (relFilter === 'allies') list = list.filter(d => d.relationshipType === 'ALLY');
    else if (relFilter === 'rivals') list = list.filter(d => d.relationshipType === 'RIVAL');
    return sortFavorites(list, sortKey, sortAsc);
  }, [favoriteData, debouncedSearch, sortKey, sortAsc, relFilter]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <RetroHeading color="gold" subtitle="Track your favorite agents and their performance">
        FAVORITES
      </RetroHeading>

      {favoriteAddresses.length === 0 ? (
        <EmptyFavorites />
      ) : (
        <>
          {/* Stats summary */}
          <FavoriteStats agents={favoriteData} />

          {/* Comparison Matrix */}
          <FavoritesComparison agents={favoriteData} />

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by address or handle..."
                className="w-full bg-surface-1 border border-white/[0.06] rounded-lg pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-arcade-cyan/40 transition-colors"
              />
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2">
              {/* Sort buttons */}
              <div className="flex items-center bg-surface-1 rounded-lg border border-white/[0.06] overflow-hidden">
                {(['elo', 'winRate', 'streak', 'matches'] as SortKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => handleSort(key)}
                    className={clsx(
                      'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                      sortKey === key
                        ? 'bg-arcade-purple/20 text-arcade-purple'
                        : 'text-gray-500 hover:text-gray-300',
                    )}
                  >
                    {key === 'winRate' ? 'WIN%' : key.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Relationship filter */}
              <div className="flex items-center bg-surface-1 rounded-lg border border-white/[0.06] overflow-hidden">
                {(['all', 'allies', 'rivals'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setRelFilter(f)}
                    className={clsx(
                      'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
                      relFilter === f
                        ? f === 'allies' ? 'bg-arcade-green/20 text-arcade-green'
                          : f === 'rivals' ? 'bg-arcade-pink/20 text-arcade-pink'
                          : 'bg-arcade-purple/20 text-arcade-purple'
                        : 'text-gray-500 hover:text-gray-300',
                    )}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* View toggle */}
              <div className="flex items-center bg-surface-1 rounded-lg border border-white/[0.06] overflow-hidden">
                <button
                  onClick={() => setViewMode('grid')}
                  className={clsx(
                    'px-2.5 py-1.5 text-xs transition-colors',
                    viewMode === 'grid' ? 'bg-arcade-cyan/20 text-arcade-cyan' : 'text-gray-500',
                  )}
                  title="Grid view"
                >
                  ▦
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={clsx(
                    'px-2.5 py-1.5 text-xs transition-colors',
                    viewMode === 'list' ? 'bg-arcade-cyan/20 text-arcade-cyan' : 'text-gray-500',
                  )}
                  title="List view"
                >
                  ☰
                </button>
              </div>

              {/* Clear all */}
              <button
                onClick={clearFavorites}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-gray-500 hover:text-red-400 uppercase tracking-wider transition-colors"
                title="Clear all favorites"
              >
                <Trash2 size={12} />
                Clear
              </button>
            </div>
          </div>

          {/* Agent list/grid */}
          {displayData.length === 0 ? (
            <div className="arcade-card p-8 text-center">
              <Search size={24} className="text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No agents match your search</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayData.map((d) => (
                <FavoriteAgentCard key={d.address} data={d} />
              ))}
            </div>
          ) : (
            <div className="arcade-card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-3 text-left text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      Agent
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      ELO
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      W/L
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      Win %
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      Streak
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                      Recent
                    </th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {displayData.map((d) => {
                    const { address, agent, recentMatches, isLive } = d;
                    if (!agent) {
                      return (
                        <tr key={address} className="border-b border-white/[0.03] opacity-50">
                          <td className="px-4 py-3 font-mono text-sm text-gray-400">
                            {address.slice(0, 6)}...{address.slice(-4)}
                          </td>
                          <td colSpan={5} className="px-4 py-3 text-xs text-gray-600">
                            Data unavailable
                          </td>
                          <td className="px-4 py-3">
                            <FavoriteButton agentAddress={address} size="sm" />
                          </td>
                        </tr>
                      );
                    }

                    const winRate =
                      agent.winRate ??
                      (agent.matchesPlayed > 0 ? (agent.wins / agent.matchesPlayed) * 100 : 0);

                    return (
                      <tr
                        key={address}
                        className="border-b border-white/[0.03] hover:bg-surface-2 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            to={`/agent/${address}`}
                            className="flex items-center gap-2 group"
                          >
                            <span className="font-mono text-sm text-gray-200 group-hover:text-arcade-cyan transition-colors">
                              {agent.moltbookHandle || `${address.slice(0, 6)}...${address.slice(-4)}`}
                            </span>
                            {isLive && (
                              <span className="w-1.5 h-1.5 rounded-full bg-arcade-pink animate-pulse" />
                            )}
                            {d.relationshipType === 'ALLY' && (
                              <span className="text-[8px] font-bold text-arcade-green bg-arcade-green/10 px-1 py-0.5 rounded">ALLY</span>
                            )}
                            {d.relationshipType === 'RIVAL' && (
                              <span className="text-[8px] font-bold text-arcade-pink bg-arcade-pink/10 px-1 py-0.5 rounded">RIVAL</span>
                            )}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-bold text-white">
                          {agent.elo}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-sm text-arcade-green">{agent.wins}</span>
                          <span className="text-gray-600 mx-0.5">/</span>
                          <span className="font-mono text-sm text-red-400">{agent.losses}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={clsx(
                              'font-mono text-sm font-bold',
                              winRate >= 60
                                ? 'text-arcade-green'
                                : winRate >= 45
                                  ? 'text-gray-300'
                                  : 'text-red-400',
                            )}
                          >
                            {winRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={clsx(
                              'font-mono text-sm font-bold inline-flex items-center gap-0.5',
                              agent.streak > 0
                                ? 'text-arcade-green'
                                : agent.streak < 0
                                  ? 'text-red-400'
                                  : 'text-gray-500',
                            )}
                          >
                            {agent.streak > 0 ? (
                              <TrendingUp size={11} />
                            ) : agent.streak < 0 ? (
                              <TrendingDown size={11} />
                            ) : null}
                            {Math.abs(agent.streak)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <RecentForm matches={recentMatches} address={address} />
                        </td>
                        <td className="px-4 py-3">
                          <FavoriteButton agentAddress={address} size="sm" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
