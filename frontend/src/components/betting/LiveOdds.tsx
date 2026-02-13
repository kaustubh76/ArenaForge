import { useEffect, useState, useRef, useMemo } from 'react';
import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useBettingStore } from '@/stores/bettingStore';

interface LiveOddsProps {
  matchId: number;
  player1: string;
  player2: string;
  player1Handle?: string;
  player2Handle?: string;
  className?: string;
}

export function LiveOdds({
  matchId,
  player1,
  player2,
  player1Handle,
  player2Handle,
  className,
}: LiveOddsProps) {
  const { matchPools, fetchPool, getTotalWageredOnMatch } = useBettingStore();
  const [refreshing, setRefreshing] = useState(false);

  const pool = matchPools[matchId];
  const totals = getTotalWageredOnMatch(matchId);

  // Track pool history for sparkline
  const poolHistory = useRef<number[]>([]);

  // Calculate volume percentages
  const total = parseFloat(totals.player1) + parseFloat(totals.player2);
  const player1Percent = total > 0 ? (parseFloat(totals.player1) / total) * 100 : 50;
  const player2Percent = total > 0 ? (parseFloat(totals.player2) / total) * 100 : 50;

  // Implied payout multipliers
  const p1Multiplier = player1Percent > 0 ? (100 / player1Percent) : 0;
  const p2Multiplier = player2Percent > 0 ? (100 / player2Percent) : 0;

  // Track pool trend + per-player history for velocity
  const p1History = useRef<number[]>([]);

  useEffect(() => {
    if (total > 0) {
      poolHistory.current = [...poolHistory.current.slice(-11), total];
      p1History.current = [...p1History.current.slice(-11), player1Percent];
    }
  }, [total, player1Percent]);

  const trend = useMemo(() => {
    const h = poolHistory.current;
    if (h.length < 2) return 0;
    return h[h.length - 1] - h[h.length - 2];
  }, [total]);

  // Odds shift velocity: how fast P1% is changing
  const shiftVelocity = useMemo(() => {
    const h = p1History.current;
    if (h.length < 3) return 0;
    const recent = h.slice(-3);
    return recent[recent.length - 1] - recent[0];
  }, [total]);

  // SVG sparkline of pool history
  const sparklinePath = useMemo(() => {
    const h = poolHistory.current;
    if (h.length < 2) return '';
    const min = Math.min(...h);
    const max = Math.max(...h);
    const range = max - min || 1;
    const w = 80;
    const ht = 20;
    return h.map((v, i) => {
      const x = (i / (h.length - 1)) * w;
      const y = ht - ((v - min) / range) * (ht - 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [total]);

  useEffect(() => {
    fetchPool(matchId);
    // Refresh every 10 seconds
    const interval = setInterval(() => {
      setRefreshing(true);
      fetchPool(matchId).finally(() => setRefreshing(false));
    }, 10000);
    return () => clearInterval(interval);
  }, [matchId, fetchPool]);

  if (!pool) {
    return (
      <div className={clsx('animate-pulse bg-surface-1 rounded-lg h-20', className)} />
    );
  }

  return (
    <div className={clsx('bg-surface-1 rounded-lg p-4', className)}>
      {/* Header with velocity */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs uppercase tracking-wider text-gray-400 font-semibold">
            Live Odds
          </h3>
          {Math.abs(shiftVelocity) > 2 && (
            <span className={clsx(
              'text-[8px] font-pixel px-1.5 py-0.5 rounded',
              shiftVelocity > 0
                ? 'bg-arcade-cyan/10 text-arcade-cyan'
                : 'bg-arcade-pink/10 text-arcade-pink',
            )}>
              {shiftVelocity > 0 ? '→ P1' : '→ P2'} SHIFT
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Odds balance indicator */}
          {total > 0 && Math.abs(player1Percent - 50) > 15 && (
            <span className="text-[8px] font-pixel text-arcade-gold bg-arcade-gold/10 px-1.5 py-0.5 rounded">
              {player1Percent > 65 || player2Percent > 65 ? 'HEAVY FAV' : 'VALUE'}
            </span>
          )}
          {refreshing && (
            <div className="w-2 h-2 bg-arcade-cyan rounded-full animate-pulse" />
          )}
        </div>
      </div>

      {/* Volume bars */}
      <div className="relative h-6 bg-surface-2 rounded-full overflow-hidden mb-3">
        {/* Player 1 bar (left side) */}
        <div
          className="absolute left-0 top-0 h-full bg-arcade-cyan/60 transition-all duration-500"
          style={{ width: `${player1Percent}%` }}
        />
        {/* Player 2 bar (right side) */}
        <div
          className="absolute right-0 top-0 h-full bg-arcade-pink/60 transition-all duration-500"
          style={{ width: `${player2Percent}%` }}
        />
        {/* Center divider */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-600 transform -translate-x-1/2" />
      </div>

      {/* Player labels with implied multipliers */}
      <div className="flex justify-between text-sm">
        <div className="text-left">
          <div className="font-semibold text-arcade-cyan truncate max-w-[120px]">
            {player1Handle || player1.slice(0, 8)}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{player1Percent.toFixed(1)}%</span>
            {total > 0 && (
              <span className="text-[10px] font-mono font-bold text-arcade-gold bg-arcade-gold/10 px-1.5 py-0.5 rounded">
                {p1Multiplier.toFixed(2)}x
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-semibold text-arcade-pink truncate max-w-[120px]">
            {player2Handle || player2.slice(0, 8)}
          </div>
          <div className="flex items-center gap-2 justify-end">
            {total > 0 && (
              <span className="text-[10px] font-mono font-bold text-arcade-gold bg-arcade-gold/10 px-1.5 py-0.5 rounded">
                {p2Multiplier.toFixed(2)}x
              </span>
            )}
            <span className="text-xs text-gray-400">{player2Percent.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Total pool with trend */}
      <div className="mt-3 pt-3 border-t border-gray-700/50">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Total Pool</span>
            {trend !== 0 && (
              <div className={clsx(
                'flex items-center gap-0.5 text-[9px] font-mono',
                trend > 0 ? 'text-arcade-green' : 'text-arcade-red',
              )}>
                {trend > 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {trend > 0 ? '+' : ''}{trend.toFixed(4)}
              </div>
            )}
          </div>
          <span className="font-mono text-sm font-bold text-arcade-gold">
            {total.toFixed(4)} ETH
          </span>
        </div>
        {/* Pool history sparkline */}
        {sparklinePath && (
          <div className="mt-2 flex items-center justify-center">
            <svg width="80" height="20" className="overflow-visible">
              <path d={sparklinePath} fill="none" stroke="#ffd740" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
            </svg>
            <span className="text-[8px] text-gray-600 ml-2">pool trend</span>
          </div>
        )}
      </div>

      {/* Betting status */}
      {!pool.bettingOpen && (
        <div className="mt-2 text-center">
          <span className="text-xs text-arcade-red uppercase tracking-wider">
            Betting Closed
          </span>
        </div>
      )}
    </div>
  );
}
