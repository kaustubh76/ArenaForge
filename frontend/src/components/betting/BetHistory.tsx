import { useState, useEffect, useMemo } from 'react';
import clsx from 'clsx';
import { History, Trophy, X, Clock, DollarSign, TrendingUp, TrendingDown, BarChart3, Target, ChevronDown } from 'lucide-react';
import { useBettingStore } from '@/stores/bettingStore';
import { BetStatus } from '@/types/arena';
import { truncateAddress } from '@/constants/ui';
import { useWallet } from '@/hooks/useWallet';
import { CHART_COLORS } from '@/components/charts';
import { CopyButton } from '@/components/arcade/CopyButton';
import { timeAgo } from '@/utils/format';

interface BetHistoryProps {
  className?: string;
  maxItems?: number;
  showHeader?: boolean;
}

const STATUS_LABELS: Record<BetStatus, string> = {
  [BetStatus.Active]: 'Active',
  [BetStatus.Won]: 'Won',
  [BetStatus.Lost]: 'Lost',
  [BetStatus.Refunded]: 'Refunded',
};

const STATUS_COLORS: Record<BetStatus, string> = {
  [BetStatus.Active]: 'text-arcade-cyan',
  [BetStatus.Won]: 'text-arcade-green',
  [BetStatus.Lost]: 'text-arcade-red',
  [BetStatus.Refunded]: 'text-gray-400',
};

const STATUS_ICONS: Record<BetStatus, typeof Trophy> = {
  [BetStatus.Active]: Clock,
  [BetStatus.Won]: Trophy,
  [BetStatus.Lost]: X,
  [BetStatus.Refunded]: DollarSign,
};

// ---------------------------------------------------------------------------
// P/L Sparkline — cumulative profit/loss over time
// ---------------------------------------------------------------------------
function BetPLSparkline({ bets }: { bets: Array<{ status: BetStatus; amount: string; payout: string; timestamp: number }> }) {
  const chartData = useMemo(() => {
    const sorted = [...bets]
      .filter(b => b.status !== BetStatus.Active)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (sorted.length < 3) return null;

    let cumulative = 0;
    const points = sorted.map(b => {
      if (b.status === BetStatus.Won) cumulative += parseFloat(b.payout || '0') - parseFloat(b.amount);
      else if (b.status === BetStatus.Lost) cumulative -= parseFloat(b.amount);
      return cumulative;
    });

    const min = Math.min(0, ...points);
    const max = Math.max(0, ...points);
    const range = max - min || 1;
    const w = 200;
    const h = 56;
    const pad = 4;

    const coords = points.map((v, i) => ({
      x: pad + (i / (points.length - 1)) * (w - pad * 2),
      y: pad + ((max - v) / range) * (h - pad * 2),
    }));

    const zeroY = pad + ((max - 0) / range) * (h - pad * 2);
    const polyline = coords.map(c => `${c.x},${c.y}`).join(' ');
    const areaPoints = `${coords[0].x},${zeroY} ${polyline} ${coords[coords.length - 1].x},${zeroY}`;
    const finalVal = points[points.length - 1];
    const isPositive = finalVal >= 0;

    return { w, h, polyline, areaPoints, zeroY, finalVal, isPositive, pad };
  }, [bets]);

  if (!chartData) return null;

  return (
    <div className="arcade-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
          <BarChart3 size={12} /> P/L Trend
        </h3>
        <span
          className={clsx(
            'text-xs font-mono font-bold',
            chartData.isPositive ? 'text-arcade-green' : 'text-arcade-red',
          )}
          style={{ textShadow: `0 0 6px ${chartData.isPositive ? 'rgba(105,240,174,0.3)' : 'rgba(255,82,82,0.3)'}` }}
        >
          {chartData.isPositive ? '+' : ''}{chartData.finalVal.toFixed(4)}
        </span>
      </div>
      <svg viewBox={`0 0 ${chartData.w} ${chartData.h}`} className="w-full" preserveAspectRatio="none">
        {/* Zero line */}
        <line
          x1={chartData.pad} y1={chartData.zeroY}
          x2={chartData.w - chartData.pad} y2={chartData.zeroY}
          stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} strokeDasharray="3 2"
        />
        {/* Area fill */}
        <polygon
          points={chartData.areaPoints}
          fill={chartData.isPositive ? 'rgba(105,240,174,0.15)' : 'rgba(255,82,82,0.15)'}
        />
        {/* Line */}
        <polyline
          points={chartData.polyline}
          fill="none"
          stroke={chartData.isPositive ? CHART_COLORS.green : CHART_COLORS.red}
          strokeWidth={1.5}
          strokeLinejoin="round"
          filter={`drop-shadow(0 0 3px ${chartData.isPositive ? 'rgba(105,240,174,0.4)' : 'rgba(255,82,82,0.4)'})`}
        />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outcome Donut — Won/Lost/Active/Refunded distribution
// ---------------------------------------------------------------------------
function BetOutcomeDonut({ bets }: { bets: Array<{ status: BetStatus }> }) {
  const segments = useMemo(() => {
    const counts: Record<string, { count: number; color: string; label: string }> = {
      [BetStatus.Won]: { count: 0, color: CHART_COLORS.green, label: 'Won' },
      [BetStatus.Lost]: { count: 0, color: CHART_COLORS.red, label: 'Lost' },
      [BetStatus.Active]: { count: 0, color: CHART_COLORS.cyan, label: 'Active' },
      [BetStatus.Refunded]: { count: 0, color: CHART_COLORS.gray, label: 'Refunded' },
    };
    bets.forEach(b => {
      if (counts[b.status]) counts[b.status].count++;
    });
    return Object.values(counts).filter(s => s.count > 0);
  }, [bets]);

  if (bets.length === 0) return null;

  const total = bets.length;
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  const r = 36;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const arcs = segments.map(seg => {
    const pct = seg.count / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const arc = { ...seg, dashArray: `${dash} ${gap}`, dashOffset: -offset };
    offset += dash;
    return arc;
  });

  return (
    <div className="arcade-card p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
        <Target size={12} /> Outcomes
      </h3>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            {/* Track */}
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
            {/* Segments */}
            {arcs.map((arc, i) => (
              <circle
                key={i}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={arc.color}
                strokeWidth={strokeWidth}
                strokeDasharray={arc.dashArray}
                strokeDashoffset={arc.dashOffset}
                strokeLinecap="butt"
                filter={`drop-shadow(0 0 3px ${arc.color}40)`}
              />
            ))}
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-mono font-bold text-white">{total}</span>
            <span className="text-[8px] text-gray-500">BETS</span>
          </div>
        </div>
        <div className="space-y-1.5">
          {segments.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[10px] text-gray-400">{s.label}</span>
              <span className="text-[10px] font-mono font-bold text-white">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BetHistory({ className, maxItems = 20, showHeader = true }: BetHistoryProps) {
  const { address } = useWallet();
  const { userBets, fetchMyBets, claimWinnings, loading } = useBettingStore();
  const [claimingId, setClaimingId] = useState<number | null>(null);
  const [visibleBets, setVisibleBets] = useState(maxItems);

  useEffect(() => {
    if (address) {
      fetchMyBets(address);
    }
  }, [address, fetchMyBets]);

  const handleClaim = async (betId: number) => {
    setClaimingId(betId);
    try {
      await claimWinnings(betId);
    } finally {
      setClaimingId(null);
    }
  };

  // Sort by timestamp descending (most recent first)
  const allSortedBets = [...userBets]
    .sort((a, b) => b.timestamp - a.timestamp);
  const sortedBets = allSortedBets.slice(0, visibleBets);

  // Calculate P/L stats
  const completedBets = userBets.filter(b => b.status !== BetStatus.Active);
  const totalWagered = userBets.reduce((sum, b) => sum + parseFloat(b.amount), 0);
  const totalWon = userBets
    .filter(b => b.status === BetStatus.Won)
    .reduce((sum, b) => sum + parseFloat(b.payout || '0'), 0);
  const totalLost = userBets
    .filter(b => b.status === BetStatus.Lost)
    .reduce((sum, b) => sum + parseFloat(b.amount), 0);
  const netPL = totalWon - totalLost;
  const winRate = completedBets.length > 0
    ? (completedBets.filter(b => b.status === BetStatus.Won).length / completedBets.length) * 100
    : 0;

  if (loading && userBets.length === 0) {
    return (
      <div className={clsx('arcade-card p-6', className)}>
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-surface-1 rounded w-1/3" />
          <div className="h-12 bg-surface-1 rounded" />
          <div className="h-12 bg-surface-1 rounded" />
          <div className="h-12 bg-surface-1 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('space-y-4', className)}>
      {showHeader && (
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
          <History size={14} className="text-arcade-purple" />
          Bet History
        </h2>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="arcade-card p-3 text-center">
          <div className="text-lg font-mono text-white">{userBets.length}</div>
          <p className="text-[10px] text-gray-500 mt-1">TOTAL BETS</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <div className="text-lg font-mono text-arcade-gold">{totalWagered.toFixed(2)}</div>
          <p className="text-[10px] text-gray-500 mt-1">WAGERED (ETH)</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <div className={clsx(
            'text-lg font-mono flex items-center justify-center gap-1',
            netPL >= 0 ? 'text-arcade-green' : 'text-arcade-red'
          )}>
            {netPL >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {netPL >= 0 ? '+' : ''}{netPL.toFixed(4)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">NET P/L (ETH)</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <div className="text-lg font-mono text-arcade-cyan">{winRate.toFixed(0)}%</div>
          <p className="text-[10px] text-gray-500 mt-1">WIN RATE</p>
        </div>
      </div>

      {/* P/L & Outcome Charts */}
      {userBets.length >= 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <BetPLSparkline bets={userBets} />
          <BetOutcomeDonut bets={userBets} />
        </div>
      )}

      {/* Bet list */}
      <div className="arcade-card p-0 overflow-hidden">
        {sortedBets.length > 0 ? (
          sortedBets.map((bet, i) => {
            const StatusIcon = STATUS_ICONS[bet.status as BetStatus];
            const canClaim = bet.status === BetStatus.Won && parseFloat(bet.payout || '0') > 0;
            const pl = bet.status === BetStatus.Won
              ? parseFloat(bet.payout || '0') - parseFloat(bet.amount)
              : bet.status === BetStatus.Lost
                ? -parseFloat(bet.amount)
                : 0;

            return (
              <div
                key={bet.id}
                className={clsx(
                  'p-4 flex items-center gap-4 transition-colors duration-150',
                  i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50',
                  'hover:bg-surface-1',
                )}
              >
                {/* Status icon */}
                <div className={clsx('flex-shrink-0', STATUS_COLORS[bet.status as BetStatus])}>
                  <StatusIcon size={20} />
                </div>

                {/* Bet details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">Match #{bet.matchId}</span>
                    <CopyButton text={String(bet.matchId)} label="Match ID copied" size={10} />
                    <span className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full',
                      bet.status === BetStatus.Active && 'bg-arcade-cyan/20 text-arcade-cyan',
                      bet.status === BetStatus.Won && 'bg-arcade-green/20 text-arcade-green',
                      bet.status === BetStatus.Lost && 'bg-arcade-red/20 text-arcade-red',
                      bet.status === BetStatus.Refunded && 'bg-gray-500/20 text-gray-400',
                    )}>
                      {STATUS_LABELS[bet.status as BetStatus]}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    Bet on {truncateAddress(bet.predictedWinner)}
                    <CopyButton text={bet.predictedWinner} label="Address copied" size={10} />
                    <span>@ {bet.odds}x</span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1" title={new Date(bet.timestamp).toLocaleString()}>
                    {timeAgo(bet.timestamp)}
                  </div>
                </div>

                {/* Amount and P/L */}
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-sm text-arcade-gold">{bet.amount} ETH</div>
                  {bet.status !== BetStatus.Active && bet.status !== BetStatus.Refunded && (
                    <div className={clsx(
                      'text-xs font-mono mt-1',
                      pl >= 0 ? 'text-arcade-green' : 'text-arcade-red'
                    )}>
                      {pl >= 0 ? '+' : ''}{pl.toFixed(4)} ETH
                    </div>
                  )}
                </div>

                {/* Claim button */}
                {canClaim && (
                  <button
                    onClick={() => handleClaim(bet.id)}
                    disabled={claimingId === bet.id}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                      'bg-arcade-green/20 text-arcade-green hover:bg-arcade-green/30',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'hover:scale-105 active:scale-95',
                      claimingId !== bet.id && 'animate-pulse',
                    )}
                    style={{ boxShadow: '0 0 8px rgba(105,240,174,0.2)' }}
                  >
                    {claimingId === bet.id ? 'Claiming...' : 'Claim'}
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center py-10">
            <div className="w-12 h-12 rounded-full bg-surface-1 border border-white/[0.06] flex items-center justify-center animate-float mb-4">
              <History size={20} className="text-gray-500" style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.3))' }} />
            </div>
            <p className="font-pixel text-xs text-gray-300 tracking-wider" style={{ textShadow: '0 0 6px rgba(0,229,255,0.2)' }}>NO BETS YET</p>
            <p className="text-xs text-gray-500 mt-1.5">Place your first bet on a live match</p>
          </div>
        )}

        {/* Show More button */}
        {allSortedBets.length > visibleBets && (
          <button
            onClick={() => setVisibleBets(v => v + maxItems)}
            className="w-full py-3 text-xs font-semibold text-gray-400 hover:text-white border-t border-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
          >
            <ChevronDown size={14} />
            Show More ({allSortedBets.length - visibleBets} remaining)
          </button>
        )}
      </div>
    </div>
  );
}
