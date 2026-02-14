import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Trophy, TrendingUp, TrendingDown, Target, Flame, ArrowLeft,
  ChevronUp, ChevronDown, Medal, Crown, Award, BarChart3,
} from 'lucide-react';
import { useBettingStore } from '@/stores/bettingStore';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { AnimatedScore } from '@/components/arcade/AnimatedScore';
import { SkeletonRow } from '@/components/arcade/ShimmerLoader';
import { EmptyBets } from '@/components/arcade/EmptyState';
import { CopyButton } from '@/components/arcade/CopyButton';
import { truncateAddress } from '@/constants/ui';

type SortField = 'netProfit' | 'winRate' | 'totalBets' | 'streak';
type SortDir = 'asc' | 'desc';
type TimeFilter = 'all' | 'season' | 'month' | 'week';

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

function ProfitDisplay({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <div
      className={clsx(
        'flex items-center gap-1 font-mono text-sm',
        isPositive ? 'text-arcade-green' : 'text-arcade-red'
      )}
      style={{ textShadow: Math.abs(value) > 1 ? `0 0 6px ${isPositive ? 'rgba(105,240,174,0.3)' : 'rgba(255,82,82,0.3)'}` : undefined }}
    >
      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {isPositive ? '+' : ''}{value.toFixed(4)}
    </div>
  );
}

function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return <span className="text-xs text-gray-500">—</span>;
  const isWin = streak > 0;
  return (
    <div className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
      isWin
        ? 'bg-arcade-green/15 text-arcade-green'
        : 'bg-arcade-red/15 text-arcade-red'
    )}>
      {isWin && <Flame size={10} />}
      {isWin ? `${streak}W` : `${Math.abs(streak)}L`}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bettor Distribution Charts — win rate histogram + P/L spread
// ---------------------------------------------------------------------------
function BettorDistributionCharts({ bettors }: { bettors: Array<{ winRate: number; netProfit: string; totalBets: number }> }) {
  const data = useMemo(() => {
    // Win rate histogram: buckets of 10%
    const wrBuckets = new Array(10).fill(0);
    bettors.forEach(b => {
      const idx = Math.min(Math.floor(b.winRate / 10), 9);
      wrBuckets[idx]++;
    });
    const wrMax = Math.max(1, ...wrBuckets);

    // P/L spread: profitable vs unprofitable
    let profitable = 0;
    let breakEven = 0;
    let unprofitable = 0;
    bettors.forEach(b => {
      const pl = parseFloat(b.netProfit);
      if (pl > 0.001) profitable++;
      else if (pl < -0.001) unprofitable++;
      else breakEven++;
    });
    const total = bettors.length;

    // Avg bets for active (10+) vs casual
    const active = bettors.filter(b => b.totalBets >= 10);
    const avgActiveWR = active.length > 0 ? active.reduce((s, b) => s + b.winRate, 0) / active.length : 0;

    return { wrBuckets, wrMax, profitable, breakEven, unprofitable, total, avgActiveWR };
  }, [bettors]);

  const barColors = ['#ff5252', '#ff5252', '#ff5252', '#ff5252', '#ffd740', '#ffd740', '#69f0ae', '#69f0ae', '#69f0ae', '#69f0ae'];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
      {/* Win Rate Distribution */}
      <div className="arcade-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={12} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
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
                  background: barColors[i],
                  opacity: 0.7,
                }}
              />
              <span className="text-[7px] font-mono text-gray-600">{i * 10}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[8px] text-gray-600">0% win rate</span>
          <span className="text-[8px] text-gray-600">100% win rate</span>
        </div>
      </div>

      {/* P/L Spread */}
      <div className="arcade-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={12} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">P/L BREAKDOWN</span>
        </div>
        <div className="space-y-2">
          {/* Profitable bar */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-400 w-16">Profitable</span>
            <div className="flex-1 h-3 bg-surface-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(data.profitable / data.total) * 100}%`, background: '#69f0ae', opacity: 0.8 }}
              />
            </div>
            <span className="text-[9px] font-mono text-arcade-green w-6 text-right">{data.profitable}</span>
          </div>
          {/* Break even */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-400 w-16">Even</span>
            <div className="flex-1 h-3 bg-surface-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(data.breakEven / data.total) * 100}%`, background: '#ffd740', opacity: 0.8 }}
              />
            </div>
            <span className="text-[9px] font-mono text-arcade-gold w-6 text-right">{data.breakEven}</span>
          </div>
          {/* Unprofitable */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-400 w-16">Losing</span>
            <div className="flex-1 h-3 bg-surface-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(data.unprofitable / data.total) * 100}%`, background: '#ff5252', opacity: 0.8 }}
              />
            </div>
            <span className="text-[9px] font-mono text-arcade-red w-6 text-right">{data.unprofitable}</span>
          </div>
        </div>
        {data.avgActiveWR > 0 && (
          <div className="mt-3 pt-2 border-t border-white/[0.04] flex items-center gap-2">
            <Target size={10} className="text-arcade-cyan" />
            <span className="text-[9px] text-gray-500">Active bettor avg: <span className="font-mono text-white">{data.avgActiveWR.toFixed(1)}%</span> win rate</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function SpectatorLeaderboard() {
  const { topBettors, fetchTopBettorsLeaderboard } = useBettingStore();
  const [sortField, setSortField] = useState<SortField>('netProfit');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchTopBettorsLeaderboard(100).finally(() => setLoading(false));
  }, [fetchTopBettorsLeaderboard]);

  const sortedBettors = useMemo(() => {
    const sorted = [...topBettors].sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortField) {
        case 'netProfit':
          aVal = parseFloat(a.netProfit);
          bVal = parseFloat(b.netProfit);
          break;
        case 'winRate':
          aVal = a.winRate;
          bVal = b.winRate;
          break;
        case 'totalBets':
          aVal = a.totalBets;
          bVal = b.totalBets;
          break;
        case 'streak':
          aVal = a.currentStreak;
          bVal = b.currentStreak;
          break;
        default:
          aVal = parseFloat(a.netProfit);
          bVal = parseFloat(b.netProfit);
      }

      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [topBettors, sortField, sortDir]);

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
  const totalVolume = topBettors.reduce((sum, b) => sum + parseFloat(b.totalWagered), 0);
  const totalBetsCount = topBettors.reduce((sum, b) => sum + b.totalBets, 0);
  const topStreak = topBettors.reduce((max, b) => Math.max(max, b.longestWinStreak), 0);

  return (
    <div>
      {/* Back to spectator hub */}
      <Link
        to="/spectator"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back to Spectator Hub
      </Link>

      <RetroHeading level={1} color="gold" subtitle="Top predictors ranked by performance">
        SPECTATOR LEADERBOARD
      </RetroHeading>

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy size={16} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
            <AnimatedScore value={topBettors.length} className="text-xl text-white" />
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">ACTIVE BETTORS</p>
        </div>
        <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="text-xl font-mono text-arcade-purple">{totalBetsCount}</div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">TOTAL BETS PLACED</p>
        </div>
        <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="text-xl font-mono text-arcade-gold" style={{ textShadow: '0 0 6px rgba(255,215,0,0.25)' }}>{totalVolume.toFixed(2)}</div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">VOLUME (ETH)</p>
        </div>
        <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
          <div className="flex items-center justify-center gap-1">
            <Flame size={16} className="text-arcade-orange" style={{ filter: 'drop-shadow(0 0 3px rgba(255,152,0,0.4))' }} />
            <span className="text-xl font-mono text-arcade-orange">{topStreak}</span>
          </div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">BEST WIN STREAK</p>
        </div>
      </div>

      {/* Win Rate Distribution + P/L Spread */}
      {topBettors.length >= 3 && <BettorDistributionCharts bettors={topBettors} />}

      {/* Time filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {(['all', 'season', 'month', 'week'] as TimeFilter[]).map(tf => (
          <button
            key={tf}
            onClick={() => setTimeFilter(tf)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border',
              timeFilter === tf
                ? 'bg-arcade-gold/15 text-arcade-gold border-arcade-gold/40'
                : 'text-gray-500 border-white/[0.06] hover:border-white/[0.12] hover:text-gray-300'
            )}
          >
            {tf === 'all' ? 'ALL TIME' : tf.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Leaderboard table */}
      <div className="arcade-card p-0 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2.5rem_1fr_5rem_5rem] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem_5rem] gap-2 px-3 sm:px-4 py-3 border-b border-white/[0.06] bg-surface-3/50">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">#</span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">BETTOR</span>
          <SortHeader field="netProfit" label="P/L" />
          <SortHeader field="winRate" label="WIN %" />
          <span className="hidden sm:block"><SortHeader field="totalBets" label="BETS" /></span>
          <span className="hidden sm:block"><SortHeader field="streak" label="STREAK" /></span>
          <span className="hidden sm:block text-[10px] uppercase tracking-wider text-gray-500 font-bold text-right">ACCURACY</span>
        </div>

        {/* Loading state */}
        {loading && topBettors.length === 0 && (
          <div className="space-y-1">
            {Array.from({ length: 8 }, (_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sortedBettors.length === 0 && (
          <EmptyBets />
        )}

        {/* Bettor rows */}
        {sortedBettors.map((bettor, i) => {
          const rank = i + 1;
          const profit = parseFloat(bettor.netProfit);
          const accuracy = bettor.totalBets > 0
            ? ((bettor.wins / bettor.totalBets) * 100).toFixed(1)
            : '0.0';

          return (
            <div
              key={bettor.address}
              className={clsx(
                'grid grid-cols-[2.5rem_1fr_5rem_5rem] sm:grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem_5rem] gap-2 px-3 sm:px-4 py-3 items-center transition-all duration-200',
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

              {/* Bettor info */}
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <Link to={`/bettor/${bettor.address}`} className="text-sm text-white truncate hover:text-arcade-cyan transition-colors">
                    {truncateAddress(bettor.address)}
                  </Link>
                  <CopyButton text={bettor.address} label="Address copied" size={10} />
                </div>
                <span className="text-[10px] text-gray-500">
                  {parseFloat(bettor.totalWagered).toFixed(2)} ETH wagered
                </span>
              </div>

              {/* Net P/L */}
              <ProfitDisplay value={profit} />

              {/* Win Rate */}
              <div className={clsx(
                'text-sm font-mono',
                bettor.winRate >= 60 ? 'text-arcade-green' :
                bettor.winRate >= 50 ? 'text-gray-300' :
                'text-arcade-red'
              )}>
                {bettor.winRate.toFixed(1)}%
              </div>

              {/* Total Bets */}
              <div className="hidden sm:block text-sm font-mono text-gray-400">
                {bettor.totalBets}
              </div>

              {/* Streak */}
              <div className="hidden sm:block">
                <StreakBadge streak={bettor.currentStreak} />
              </div>

              {/* Accuracy */}
              <div className="hidden sm:flex items-center justify-end gap-1">
                <Target size={10} className="text-arcade-cyan" />
                <span className="text-sm font-mono text-arcade-cyan">{accuracy}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Performance tiers */}
      <div className="mt-8">
        <h3 className="font-pixel text-xs text-gray-400 mb-4 tracking-wider">PERFORMANCE TIERS</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <TierCard
            title="SHARK"
            description="Win rate above 65% with 20+ bets"
            color="arcade-gold"
            count={topBettors.filter(b => b.winRate >= 65 && b.totalBets >= 20).length}
          />
          <TierCard
            title="REGULAR"
            description="Win rate between 50-65% with 10+ bets"
            color="arcade-cyan"
            count={topBettors.filter(b => b.winRate >= 50 && b.winRate < 65 && b.totalBets >= 10).length}
          />
          <TierCard
            title="FISH"
            description="Win rate below 50% or under 10 bets"
            color="arcade-pink"
            count={topBettors.filter(b => b.winRate < 50 || b.totalBets < 10).length}
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
