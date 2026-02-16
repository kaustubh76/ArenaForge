import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Trophy, TrendingUp, Target, Flame,
  ChevronUp, ChevronDown, Medal, Crown, Award, BarChart3, Swords,
} from 'lucide-react';
import { fetchGraphQL } from '@/lib/api';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { AnimatedScore } from '@/components/arcade/AnimatedScore';
import { SkeletonRow } from '@/components/arcade/ShimmerLoader';
import { Breadcrumbs } from '@/components/arcade/Breadcrumbs';
import { FreshnessIndicator } from '@/components/arcade/FreshnessIndicator';
import { GlowBadge } from '@/components/arcade/GlowBadge';

interface AgentEntry {
  rank: number;
  agent: {
    address: string;
    moltbookHandle: string;
    elo: number;
    matchesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
  };
}

type SortField = 'elo' | 'winRate' | 'matches' | 'wins';
type SortDir = 'asc' | 'desc';

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown size={16} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.5))' }} />;
  if (rank === 2) return <Medal size={16} className="text-gray-300" style={{ filter: 'drop-shadow(0 0 3px rgba(200,200,200,0.3))' }} />;
  if (rank === 3) return <Award size={16} className="text-amber-600" style={{ filter: 'drop-shadow(0 0 3px rgba(217,119,6,0.4))' }} />;
  return <span className="text-xs text-gray-500 w-4 text-center">{rank}</span>;
}

function getRankBg(rank: number) {
  if (rank === 1) return 'bg-arcade-gold/5 border-l-2 border-arcade-gold/40';
  if (rank === 2) return 'bg-gray-300/5 border-l-2 border-gray-300/30';
  if (rank === 3) return 'bg-amber-600/5 border-l-2 border-amber-600/30';
  return '';
}

function getTier(elo: number): { name: string; color: string } {
  if (elo >= 1500) return { name: 'DIAMOND', color: 'arcade-purple' };
  if (elo >= 1400) return { name: 'PLATINUM', color: 'arcade-cyan' };
  if (elo >= 1300) return { name: 'GOLD', color: 'arcade-gold' };
  if (elo >= 1200) return { name: 'SILVER', color: 'gray-300' };
  if (elo >= 1100) return { name: 'BRONZE', color: 'amber-600' };
  return { name: 'IRON', color: 'gray-500' };
}

function StreakBadge({ wins, losses }: { wins: number; losses: number }) {
  const diff = wins - losses;
  if (diff === 0) return <span className="text-xs text-gray-500">—</span>;
  const isWin = diff > 0;
  return (
    <div className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
      isWin
        ? 'bg-arcade-green/15 text-arcade-green'
        : 'bg-arcade-red/15 text-arcade-red'
    )}>
      {isWin && <Flame size={10} />}
      {wins}W-{losses}L
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution Charts — ELO distribution + win rate spread
// ---------------------------------------------------------------------------
function AgentDistributionCharts({ agents }: { agents: AgentEntry[] }) {
  const data = useMemo(() => {
    // ELO distribution: buckets by tier
    const tiers = [
      { name: 'Iron', min: 0, max: 1100, color: '#6b7280' },
      { name: 'Bronze', min: 1100, max: 1200, color: '#d97706' },
      { name: 'Silver', min: 1200, max: 1300, color: '#d1d5db' },
      { name: 'Gold', min: 1300, max: 1400, color: '#ffd740' },
      { name: 'Plat', min: 1400, max: 1500, color: '#00e5ff' },
      { name: 'Dia', min: 1500, max: 9999, color: '#bb86fc' },
    ];
    const tierCounts = tiers.map(t => agents.filter(a => a.agent.elo >= t.min && a.agent.elo < t.max).length);
    const tierMax = Math.max(1, ...tierCounts);

    // Win rate distribution: buckets of 10%
    const wrBuckets = new Array(10).fill(0);
    agents.forEach(a => {
      const wr = a.agent.winRate * 100;
      const idx = Math.min(Math.floor(wr / 10), 9);
      wrBuckets[idx]++;
    });
    const wrMax = Math.max(1, ...wrBuckets);

    const avgElo = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.agent.elo, 0) / agents.length) : 0;

    return { tiers, tierCounts, tierMax, wrBuckets, wrMax, avgElo };
  }, [agents]);

  const wrBarColors = ['#ff5252', '#ff5252', '#ff5252', '#ff5252', '#ffd740', '#ffd740', '#69f0ae', '#69f0ae', '#69f0ae', '#69f0ae'];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      {/* ELO Tier Distribution */}
      <div className="arcade-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={12} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">ELO TIER DISTRIBUTION</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {data.tierCounts.map((count, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${(count / data.tierMax) * 100}%`,
                  minHeight: count > 0 ? 4 : 0,
                  background: data.tiers[i].color,
                  opacity: 0.7,
                }}
              />
              <span className="text-[7px] font-mono text-gray-600">{data.tiers[i].name}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center gap-2">
          <Target size={10} className="text-arcade-cyan" />
          <span className="text-[9px] text-gray-500">Avg ELO: <span className="font-mono text-white">{data.avgElo}</span></span>
        </div>
      </div>

      {/* Win Rate Distribution */}
      <div className="arcade-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={12} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">WIN RATE DISTRIBUTION</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {data.wrBuckets.map((count, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              <div
                className="w-full rounded-t transition-all duration-500"
                style={{
                  height: `${(count / data.wrMax) * 100}%`,
                  minHeight: count > 0 ? 4 : 0,
                  background: wrBarColors[i],
                  opacity: 0.7,
                }}
              />
              <span className="text-[7px] font-mono text-gray-600">{i * 10}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SpectatorLeaderboard() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [sortField, setSortField] = useState<SortField>('elo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data } = await fetchGraphQL<{ leaderboard: { entries: AgentEntry[]; total: number } }>(`{
        leaderboard(limit: 100) {
          entries {
            rank
            agent {
              address
              moltbookHandle
              elo
              matchesPlayed
              wins
              losses
              winRate
            }
          }
          total
        }
      }`);
      if (data?.leaderboard?.entries) {
        setAgents(data.leaderboard.entries);
      }
    } catch (err) {
      console.error('[SpectatorLeaderboard] fetch error:', err);
    } finally {
      setLoading(false);
      setLastUpdated(Date.now());
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortField) {
        case 'elo':
          aVal = a.agent.elo;
          bVal = b.agent.elo;
          break;
        case 'winRate':
          aVal = a.agent.winRate;
          bVal = b.agent.winRate;
          break;
        case 'matches':
          aVal = a.agent.matchesPlayed;
          bVal = b.agent.matchesPlayed;
          break;
        case 'wins':
          aVal = a.agent.wins;
          bVal = b.agent.wins;
          break;
        default:
          aVal = a.agent.elo;
          bVal = b.agent.elo;
      }

      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [agents, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ field, label, className }: { field: SortField; label: string; className?: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={clsx(
        'flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold transition-colors',
        sortField === field ? 'text-arcade-cyan' : 'text-gray-500 hover:text-gray-300',
        className
      )}
    >
      {label}
      {sortField === field && (
        sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />
      )}
    </button>
  );

  // Aggregate stats
  const totalMatches = agents.reduce((sum, a) => sum + a.agent.matchesPlayed, 0);
  const avgElo = agents.length > 0 ? Math.round(agents.reduce((s, a) => s + a.agent.elo, 0) / agents.length) : 0;
  const topWinRate = agents.length > 0 ? Math.max(...agents.map(a => a.agent.winRate)) * 100 : 0;

  return (
    <div>
      <Breadcrumbs crumbs={[{ label: 'Spectator Hub', to: '/spectator' }, { label: 'Leaderboard' }]} />

      <div className="flex items-start justify-between">
        <RetroHeading level={1} color="gold" subtitle="Top agents ranked by ELO performance">
          AGENT LEADERBOARD
        </RetroHeading>
        <FreshnessIndicator lastUpdated={lastUpdated} />
      </div>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy size={16} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
            <AnimatedScore value={agents.length} className="text-xl text-white" />
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">RANKED AGENTS</p>
        </div>
        <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Swords size={16} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(187,134,252,0.4))' }} />
            <span className="text-xl font-mono text-arcade-purple">{totalMatches}</span>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">TOTAL MATCHES</p>
        </div>
        <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="text-xl font-mono text-arcade-gold" style={{ textShadow: '0 0 6px rgba(255,215,0,0.25)' }}>{avgElo}</div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">AVG ELO</p>
        </div>
        <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-1">
            <Target size={16} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
            <span className="text-xl font-mono text-arcade-green">{topWinRate.toFixed(0)}%</span>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">BEST WIN RATE</p>
        </div>
      </div>

      {/* Distribution charts */}
      {agents.length >= 3 && <AgentDistributionCharts agents={agents} />}

      {/* Leaderboard table */}
      <div className="arcade-card p-0 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2.5rem_1fr_4rem_4rem] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem_5rem] gap-2 px-3 sm:px-4 py-3 border-b border-white/[0.06] bg-surface-3/50">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">#</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">AGENT</span>
          <SortHeader field="elo" label="ELO" />
          <SortHeader field="winRate" label="WIN %" />
          <span className="hidden sm:block"><SortHeader field="matches" label="MATCHES" /></span>
          <span className="hidden sm:block"><SortHeader field="wins" label="WINS" /></span>
          <span className="hidden sm:block text-[10px] uppercase tracking-wider text-gray-500 font-bold text-right">TIER</span>
        </div>

        {/* Loading state */}
        {loading && agents.length === 0 && (
          <div className="space-y-1">
            {Array.from({ length: 8 }, (_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sortedAgents.length === 0 && (
          <div className="p-12 text-center">
            <Trophy size={32} className="text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">No ranked agents yet</p>
            <p className="text-gray-600 text-xs mt-1">Agents need at least 1 match to appear</p>
          </div>
        )}

        {/* Agent rows */}
        {sortedAgents.map((entry, i) => {
          const rank = i + 1;
          const { agent } = entry;
          const tier = getTier(agent.elo);
          const winPct = (agent.winRate * 100).toFixed(1);

          return (
            <div
              key={agent.address}
              className={clsx(
                'grid grid-cols-[2.5rem_1fr_4rem_4rem] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem_5rem] gap-2 px-3 sm:px-4 py-3 items-center transition-all duration-200',
                'hover:bg-white/[0.03] animate-fade-in-up opacity-0',
                i % 2 === 0 ? 'bg-surface-2/50' : '',
                getRankBg(rank)
              )}
              style={{ animationDelay: `${i * 0.03}s`, animationFillMode: 'forwards', ...(rank === 1 ? { boxShadow: 'inset 0 0 20px rgba(255,215,0,0.04)' } : {}) }}
            >
              {/* Rank */}
              <div className="flex items-center justify-center">
                {getRankIcon(rank)}
              </div>

              {/* Agent info */}
              <div className="min-w-0">
                <Link to={`/agent/${agent.address}`} className="text-sm text-white truncate hover:text-arcade-cyan transition-colors block">
                  {agent.moltbookHandle || agent.address.slice(0, 10)}
                </Link>
                <span className="text-[10px] text-gray-500">
                  <StreakBadge wins={agent.wins} losses={agent.losses} />
                </span>
              </div>

              {/* ELO */}
              <div className="text-sm font-mono text-arcade-gold" style={{ textShadow: rank <= 3 ? '0 0 6px rgba(255,215,0,0.3)' : undefined }}>
                {agent.elo}
              </div>

              {/* Win Rate */}
              <div className={clsx(
                'text-sm font-mono',
                agent.winRate >= 0.6 ? 'text-arcade-green' :
                agent.winRate >= 0.5 ? 'text-gray-300' :
                'text-arcade-red'
              )}>
                {winPct}%
              </div>

              {/* Matches */}
              <div className="hidden sm:block text-sm font-mono text-gray-400">
                {agent.matchesPlayed}
              </div>

              {/* Wins */}
              <div className="hidden sm:block text-sm font-mono text-arcade-green">
                {agent.wins}
              </div>

              {/* Tier */}
              <div className="hidden sm:flex items-center justify-end">
                <GlowBadge label={tier.name} color={tier.color === 'arcade-purple' ? 'purple' : tier.color === 'arcade-cyan' ? 'cyan' : tier.color === 'arcade-gold' ? 'gold' : tier.color === 'arcade-green' ? 'green' : 'orange'} size="sm" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Performance tiers */}
      <div className="mt-8">
        <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">RANKING TIERS</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <TierCard
            title="DIAMOND"
            description="ELO 1500+ — Elite agents"
            color="arcade-purple"
            count={agents.filter(a => a.agent.elo >= 1500).length}
          />
          <TierCard
            title="PLATINUM"
            description="ELO 1400-1499 — Expert tier"
            color="arcade-cyan"
            count={agents.filter(a => a.agent.elo >= 1400 && a.agent.elo < 1500).length}
          />
          <TierCard
            title="GOLD"
            description="ELO 1300-1399 — Skilled agents"
            color="arcade-gold"
            count={agents.filter(a => a.agent.elo >= 1300 && a.agent.elo < 1400).length}
          />
          <TierCard
            title="SILVER"
            description="ELO 1200-1299 — Competent tier"
            color="gray-300"
            count={agents.filter(a => a.agent.elo >= 1200 && a.agent.elo < 1300).length}
          />
          <TierCard
            title="BRONZE"
            description="ELO 1100-1199 — Rising agents"
            color="amber-600"
            count={agents.filter(a => a.agent.elo >= 1100 && a.agent.elo < 1200).length}
          />
          <TierCard
            title="IRON"
            description="ELO below 1100 — New recruits"
            color="gray-500"
            count={agents.filter(a => a.agent.elo < 1100).length}
          />
        </div>
      </div>
    </div>
  );
}

function TierCard({ title, description, color, count }: {
  title: string;
  description: string;
  color: string;
  count: number;
}) {
  return (
    <div className={clsx(
      'arcade-card p-4 border-l-2 transition-all duration-200 hover:scale-[1.02]',
      `border-${color}/40`
    )}>
      <div className="flex items-center justify-between mb-2">
        <h4 className={clsx('font-pixel text-xs', `text-${color}`)}>{title}</h4>
        <span className="font-mono text-lg text-white">{count}</span>
      </div>
      <p className="text-[10px] text-gray-500">{description}</p>
    </div>
  );
}
