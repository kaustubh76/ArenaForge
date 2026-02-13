import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Trophy,
  Medal,
  TrendingUp,
  Users,
  Clock,
  Gift,
  ChevronUp,
  ChevronDown,
  Search,
  Crown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { useSeasonStore } from '@/stores/seasonStore';
import { SeasonBanner } from '@/components/season/SeasonBanner';
import { RankBadge } from '@/components/season/RankBadge';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { RankTier } from '@/types/arena';
import type { SeasonalProfile, TierReward } from '@/types/arena';

// ── Tier distribution helpers ──────────────────────────────────────────

const TIER_ORDER: RankTier[] = [
  RankTier.Diamond,
  RankTier.Platinum,
  RankTier.Gold,
  RankTier.Silver,
  RankTier.Bronze,
  RankTier.Iron,
];

const TIER_BAR_COLORS: Record<RankTier, string> = {
  [RankTier.Iron]: 'bg-gray-500',
  [RankTier.Bronze]: 'bg-amber-600',
  [RankTier.Silver]: 'bg-gray-300',
  [RankTier.Gold]: 'bg-yellow-400',
  [RankTier.Platinum]: 'bg-cyan-300',
  [RankTier.Diamond]: 'bg-purple-400',
};

function computeTierDistribution(profiles: SeasonalProfile[]): Record<RankTier, number> {
  const dist: Record<RankTier, number> = {
    [RankTier.Iron]: 0,
    [RankTier.Bronze]: 0,
    [RankTier.Silver]: 0,
    [RankTier.Gold]: 0,
    [RankTier.Platinum]: 0,
    [RankTier.Diamond]: 0,
  };
  for (const p of profiles) {
    if (dist[p.tier] !== undefined) dist[p.tier]++;
  }
  return dist;
}

// ── Sort helpers ───────────────────────────────────────────────────────

type SortKey = 'elo' | 'wins' | 'matches' | 'winRate';

function getWinRate(p: SeasonalProfile): number {
  if (p.matchesPlayed === 0) return 0;
  return (p.wins / p.matchesPlayed) * 100;
}

function sortProfiles(profiles: SeasonalProfile[], key: SortKey, asc: boolean): SeasonalProfile[] {
  const sorted = [...profiles];
  sorted.sort((a, b) => {
    let va: number, vb: number;
    switch (key) {
      case 'elo':
        va = a.seasonalElo;
        vb = b.seasonalElo;
        break;
      case 'wins':
        va = a.wins;
        vb = b.wins;
        break;
      case 'matches':
        va = a.matchesPlayed;
        vb = b.matchesPlayed;
        break;
      case 'winRate':
        va = getWinRate(a);
        vb = getWinRate(b);
        break;
    }
    return asc ? va - vb : vb - va;
  });
  return sorted;
}

// ── Tier Distribution Bar Chart ────────────────────────────────────────

function TierDistribution({ profiles }: { profiles: SeasonalProfile[] }) {
  const dist = useMemo(() => computeTierDistribution(profiles), [profiles]);
  const maxCount = Math.max(...Object.values(dist), 1);

  return (
    <div className="arcade-card p-5">
      <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase mb-4 flex items-center gap-2">
        <Users size={14} className="text-arcade-cyan" />
        Tier Distribution
      </h3>
      <div className="space-y-3">
        {TIER_ORDER.map((tier) => {
          const count = dist[tier];
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div key={tier} className="flex items-center gap-3">
              <div className="w-20 flex-shrink-0">
                <RankBadge tier={tier} size="sm" />
              </div>
              <div className="flex-1 h-5 bg-surface-0 rounded-full overflow-hidden">
                <div
                  className={clsx('h-full rounded-full transition-all duration-700', TIER_BAR_COLORS[tier])}
                  style={{ width: `${pct}%`, minWidth: count > 0 ? '8px' : '0' }}
                />
              </div>
              <span className="text-xs font-mono text-gray-400 w-8 text-right">{count}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.04] text-center">
        <span className="text-xs text-gray-500">
          {profiles.length} total ranked agents
        </span>
      </div>
    </div>
  );
}

// ── Tier Rewards Card ──────────────────────────────────────────────────

function TierRewardsCard({ rewards }: { rewards: TierReward[] }) {
  if (rewards.length === 0) return null;

  return (
    <div className="arcade-card p-5">
      <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase mb-4 flex items-center gap-2">
        <Gift size={14} className="text-arcade-gold" />
        Season Rewards
      </h3>
      <div className="space-y-2">
        {TIER_ORDER.map((tier) => {
          const reward = rewards.find((r) => r.tier === tier);
          if (!reward) return null;
          const amount = parseFloat(reward.tokenAmount);
          if (amount === 0) return null;
          return (
            <div
              key={tier}
              className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface-0 hover:bg-surface-2 transition-colors"
            >
              <RankBadge tier={tier} size="sm" />
              <span className="font-mono text-sm font-bold text-arcade-gold">
                {reward.tokenAmount} ARENA
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Season Stats Summary ───────────────────────────────────────────────

function SeasonStats({ profiles }: { profiles: SeasonalProfile[] }) {
  const stats = useMemo(() => {
    if (profiles.length === 0) return null;
    const totalMatches = profiles.reduce((s, p) => s + p.matchesPlayed, 0);
    const avgElo = Math.round(profiles.reduce((s, p) => s + p.seasonalElo, 0) / profiles.length);
    const topElo = profiles.reduce((m, p) => Math.max(m, p.peakElo), 0);
    const placedCount = profiles.filter((p) => p.placementComplete).length;
    return { totalMatches, avgElo, topElo, placedCount, totalAgents: profiles.length };
  }, [profiles]);

  if (!stats) return null;

  const cards = [
    { label: 'Ranked Agents', value: stats.totalAgents, icon: Users, color: 'text-arcade-cyan' },
    { label: 'Total Matches', value: stats.totalMatches, icon: Trophy, color: 'text-arcade-purple' },
    { label: 'Average ELO', value: stats.avgElo, icon: TrendingUp, color: 'text-arcade-green' },
    { label: 'Peak ELO', value: stats.topElo, icon: Crown, color: 'text-arcade-gold' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="arcade-card p-4 text-center">
          <c.icon size={18} className={clsx(c.color, 'mx-auto mb-2')} />
          <div className="text-xl font-bold font-mono text-white">{c.value.toLocaleString()}</div>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Season ELO Ladder ─────────────────────────────────────────────────

const TIER_THRESHOLDS = [
  { tier: RankTier.Iron, min: 0, max: 799, label: 'Iron', color: '#8b7355' },
  { tier: RankTier.Bronze, min: 800, max: 1099, label: 'Bronze', color: '#cd7f32' },
  { tier: RankTier.Silver, min: 1100, max: 1399, label: 'Silver', color: '#c0c0c0' },
  { tier: RankTier.Gold, min: 1400, max: 1699, label: 'Gold', color: '#ffd700' },
  { tier: RankTier.Platinum, min: 1700, max: 1999, label: 'Platinum', color: '#67e8f9' },
  { tier: RankTier.Diamond, min: 2000, max: 2500, label: 'Diamond', color: '#c084fc' },
];

function SeasonEloLadder({ profiles }: { profiles: SeasonalProfile[] }) {
  const tierData = useMemo(() => {
    return TIER_THRESHOLDS.map(t => {
      const agents = profiles.filter(p => p.seasonalElo >= t.min && p.seasonalElo <= t.max);
      const avgElo = agents.length > 0
        ? Math.round(agents.reduce((s, a) => s + a.seasonalElo, 0) / agents.length)
        : 0;
      return { ...t, count: agents.length, avgElo };
    }).reverse(); // Diamond at top
  }, [profiles]);

  const maxCount = Math.max(...tierData.map(t => t.count), 1);

  if (profiles.length === 0) return null;

  return (
    <div className="arcade-card p-5">
      <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase mb-4 flex items-center gap-2">
        <TrendingUp size={14} className="text-arcade-purple" />
        ELO Ladder
      </h3>
      <div className="space-y-2">
        {tierData.map(t => {
          const widthPct = (t.count / maxCount) * 100;
          return (
            <div key={t.label} className="flex items-center gap-2">
              <div className="w-16 text-right">
                <span className="text-[9px] font-pixel tracking-wider" style={{ color: t.color }}>
                  {t.label.toUpperCase()}
                </span>
              </div>
              <div className="flex-1 relative">
                <div className="h-6 bg-surface-0 rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all duration-700 flex items-center px-2"
                    style={{
                      width: `${Math.max(widthPct, t.count > 0 ? 8 : 0)}%`,
                      backgroundColor: t.color,
                      opacity: 0.3,
                    }}
                  >
                    {t.count > 0 && (
                      <span className="text-[10px] font-mono font-bold text-white drop-shadow">
                        {t.count}
                      </span>
                    )}
                  </div>
                </div>
                {/* Threshold marker */}
                <div className="absolute right-0 top-0 h-full flex items-center pr-2">
                  <span className="text-[8px] text-gray-600 font-mono">
                    {t.min}-{t.max === 2500 ? '∞' : t.max}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Dot indicators for each agent */}
      <div className="mt-4 pt-3 border-t border-white/[0.04]">
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Agent Distribution</div>
        <div className="relative h-4 bg-surface-0 rounded-full overflow-hidden">
          {profiles.map((p, i) => {
            const pct = Math.min(100, (p.seasonalElo / 2200) * 100);
            const tierInfo = TIER_THRESHOLDS.find(t => p.seasonalElo >= t.min && p.seasonalElo <= t.max);
            return (
              <div
                key={p.address}
                className="absolute top-0.5 w-3 h-3 rounded-full border border-surface-0"
                style={{
                  left: `${pct}%`,
                  backgroundColor: tierInfo?.color ?? '#666',
                  zIndex: i,
                }}
                title={`${p.address.slice(0, 6)}... — ELO ${p.seasonalElo}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[8px] text-gray-600 font-mono">
          <span>0</span>
          <span>800</span>
          <span>1100</span>
          <span>1400</span>
          <span>1700</span>
          <span>2000+</span>
        </div>
      </div>
    </div>
  );
}

// ── Top Movers — agents with biggest climb ────────────────────────────

function TopMovers({ profiles }: { profiles: SeasonalProfile[] }) {
  const movers = useMemo(() => {
    // Calculate "climb" as peakElo - starting elo (assume placement starts ~1000)
    // We use peakElo - seasonalElo delta and also peakElo as signals
    return profiles
      .filter(p => p.matchesPlayed >= 3)
      .map(p => ({
        address: p.address,
        elo: p.seasonalElo,
        peak: p.peakElo,
        tier: p.tier,
        climb: p.peakElo - 1000, // climb from starting ELO
        wins: p.wins,
        losses: p.losses,
        winRate: p.matchesPlayed > 0 ? (p.wins / p.matchesPlayed) * 100 : 0,
      }))
      .sort((a, b) => b.climb - a.climb)
      .slice(0, 5);
  }, [profiles]);

  if (movers.length === 0) return null;

  return (
    <div className="arcade-card p-5">
      <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase mb-4 flex items-center gap-2">
        <ArrowUp size={14} className="text-arcade-green" />
        Top Climbers
      </h3>
      <div className="space-y-2">
        {movers.map((m, i) => (
          <Link
            key={m.address}
            to={`/agent/${m.address}`}
            className="flex items-center gap-3 p-2 rounded-lg bg-surface-1 hover:bg-surface-2 transition-colors group"
          >
            <span className={clsx(
              'w-5 text-center font-pixel text-xs',
              i === 0 ? 'text-arcade-gold' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-500',
            )}>
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-200 group-hover:text-arcade-cyan transition-colors font-mono truncate">
                {m.address.slice(0, 6)}...{m.address.slice(-4)}
              </div>
              <div className="text-[9px] text-gray-500">
                {m.wins}W / {m.losses}L &middot; {m.winRate.toFixed(0)}%
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-mono text-sm font-bold text-white">{m.elo}</div>
              <div className={clsx(
                'text-[10px] font-mono flex items-center gap-0.5 justify-end',
                m.climb >= 0 ? 'text-arcade-green' : 'text-red-400',
              )}>
                {m.climb >= 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                {Math.abs(m.climb)}
              </div>
            </div>
            <RankBadge tier={m.tier} size="sm" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Sortable Column Header ─────────────────────────────────────────────

function SortHeader({
  label,
  sortKey,
  currentSort,
  asc,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  asc: boolean;
  onSort: (key: SortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={clsx(
        'flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold transition-colors',
        active ? 'text-arcade-cyan' : 'text-gray-500 hover:text-gray-300',
      )}
    >
      {label}
      {active &&
        (asc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );
}

// ── Leaderboard Table ──────────────────────────────────────────────────

function LeaderboardTable({
  profiles,
  searchQuery,
}: {
  profiles: SeasonalProfile[];
  searchQuery: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('elo');
  const [asc, setAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(false);
    }
  };

  const filtered = useMemo(() => {
    let list = profiles;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.address.toLowerCase().includes(q));
    }
    return sortProfiles(list, sortKey, asc);
  }, [profiles, searchQuery, sortKey, asc]);

  if (filtered.length === 0) {
    return (
      <div className="arcade-card p-8 text-center">
        <Medal size={32} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">
          {searchQuery ? 'No agents match your search' : 'No ranked agents yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="arcade-card overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="px-4 py-3 text-left text-[10px] text-gray-500 uppercase tracking-wider font-semibold w-12">
                #
              </th>
              <th className="px-4 py-3 text-left text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                Agent
              </th>
              <th className="px-4 py-3 text-left text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                Tier
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="ELO" sortKey="elo" currentSort={sortKey} asc={asc} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Wins" sortKey="wins" currentSort={sortKey} asc={asc} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Matches" sortKey="matches" currentSort={sortKey} asc={asc} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-right">
                <SortHeader label="Win %" sortKey="winRate" currentSort={sortKey} asc={asc} onSort={handleSort} />
              </th>
              <th className="px-4 py-3 text-right text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                Peak
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, idx) => {
              const rank = idx + 1;
              const winRate = getWinRate(p);
              return (
                <tr
                  key={p.address}
                  className="border-b border-white/[0.03] hover:bg-surface-2 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        'font-mono text-sm font-bold',
                        rank === 1 && 'text-arcade-gold',
                        rank === 2 && 'text-gray-300',
                        rank === 3 && 'text-amber-600',
                        rank > 3 && 'text-gray-500',
                      )}
                    >
                      {rank}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/agent/${p.address}`}
                      className="font-mono text-sm text-gray-200 hover:text-arcade-cyan transition-colors"
                    >
                      {p.address.slice(0, 6)}...{p.address.slice(-4)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <RankBadge tier={p.tier} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm font-bold text-white">
                      {p.seasonalElo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono text-sm text-arcade-green">{p.wins}</span>
                    <span className="text-gray-600 mx-1">/</span>
                    <span className="font-mono text-sm text-red-400">{p.losses}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-gray-400">
                    {p.matchesPlayed}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={clsx(
                        'font-mono text-sm font-bold',
                        winRate >= 60 ? 'text-arcade-green' : winRate >= 45 ? 'text-gray-300' : 'text-red-400',
                      )}
                    >
                      {winRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm text-arcade-gold">
                    {p.peakElo}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-white/[0.04]">
        {filtered.map((p, idx) => {
          const rank = idx + 1;
          const winRate = getWinRate(p);
          return (
            <div key={p.address} className="px-4 py-3 hover:bg-surface-2 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      'font-mono text-sm font-bold w-6',
                      rank === 1 && 'text-arcade-gold',
                      rank === 2 && 'text-gray-300',
                      rank === 3 && 'text-amber-600',
                      rank > 3 && 'text-gray-500',
                    )}
                  >
                    {rank}
                  </span>
                  <Link
                    to={`/agent/${p.address}`}
                    className="font-mono text-sm text-gray-200 hover:text-arcade-cyan transition-colors"
                  >
                    {p.address.slice(0, 6)}...{p.address.slice(-4)}
                  </Link>
                </div>
                <RankBadge tier={p.tier} size="sm" />
              </div>
              <div className="flex items-center justify-between text-xs ml-9">
                <span className="font-mono font-bold text-white">{p.seasonalElo} ELO</span>
                <span>
                  <span className="text-arcade-green">{p.wins}W</span>
                  <span className="text-gray-600 mx-1">/</span>
                  <span className="text-red-400">{p.losses}L</span>
                </span>
                <span
                  className={clsx(
                    'font-mono font-bold',
                    winRate >= 60 ? 'text-arcade-green' : winRate >= 45 ? 'text-gray-300' : 'text-red-400',
                  )}
                >
                  {winRate.toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export function SeasonPage() {
  const {
    currentSeason,
    seasonLeaderboard,
    tierRewards,
    loading,
    fetchSeason,
    fetchLeaderboard,
  } = useSeasonStore();

  const [searchQuery, setSearchQuery] = useState('');

  // Fetch season + leaderboard on mount
  useEffect(() => {
    fetchSeason().then((ok) => {
      if (ok) fetchLeaderboard(100);
    });
  }, [fetchSeason, fetchLeaderboard]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <RetroHeading color="gold" subtitle="Compete, climb the ranks, and earn seasonal rewards">
        SEASON RANKINGS
      </RetroHeading>

      {/* Season banner with user progress */}
      <SeasonBanner />

      {/* Loading state */}
      {loading && seasonLeaderboard.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3">
            <Clock size={18} className="text-arcade-cyan animate-spin" />
            <span className="text-gray-400">Loading season data...</span>
          </div>
        </div>
      )}

      {/* No active season */}
      {!loading && !currentSeason && (
        <div className="arcade-card p-12 text-center">
          <Trophy size={48} className="text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-300 mb-2">No Active Season</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            There is no season currently active. Check back soon for the next competitive season!
          </p>
        </div>
      )}

      {/* Season content */}
      {currentSeason && (
        <>
          {/* Stats summary */}
          <SeasonStats profiles={seasonLeaderboard} />

          {/* ELO Ladder + Top Movers row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <SeasonEloLadder profiles={seasonLeaderboard} />
            </div>
            <TopMovers profiles={seasonLeaderboard} />
          </div>

          {/* Sidebar + Table layout */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Left sidebar */}
            <div className="lg:col-span-1 space-y-4">
              <TierDistribution profiles={seasonLeaderboard} />
              <TierRewardsCard rewards={tierRewards} />
            </div>

            {/* Main leaderboard */}
            <div className="lg:col-span-3 space-y-3">
              {/* Search bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by address..."
                  className="w-full bg-surface-1 border border-white/[0.06] rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-arcade-cyan/40 transition-colors"
                />
              </div>

              {/* Leaderboard table */}
              <LeaderboardTable profiles={seasonLeaderboard} searchQuery={searchQuery} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
