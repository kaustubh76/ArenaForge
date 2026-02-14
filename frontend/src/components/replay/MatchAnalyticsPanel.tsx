import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Zap,
  Target,
  BarChart3,
  ArrowRightLeft,
  Flame,
} from 'lucide-react';
import { useReplayStore } from '@/stores/replayStore';
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_STYLE, GRID_STYLE } from '@/components/charts';
import { GameType } from '@/types/arena';
import {
  computeMatchAnalytics,
  type MatchAnalytics,
  type KeyMoment,
  type StrategyBreakdown,
} from './analyticsEngine';

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function MatchAnalyticsPanel({ className }: { className?: string }) {
  const currentReplay = useReplayStore(s => s.currentReplay);
  const currentRoundIndex = useReplayStore(s => s.currentRoundIndex);
  const seekToRound = useReplayStore(s => s.seekToRound);
  const [collapsed, setCollapsed] = useState(false);

  const analytics = useMemo(() => {
    if (!currentReplay) return null;
    return computeMatchAnalytics(currentReplay);
  }, [currentReplay]);

  if (!currentReplay || !analytics) return null;

  if (collapsed) {
    return (
      <div className={clsx('w-full lg:w-12 shrink-0', className)}>
        <button
          onClick={() => setCollapsed(false)}
          className="arcade-card w-full lg:h-[500px] h-12 flex lg:flex-col items-center justify-center gap-2 hover:bg-surface-2 transition-colors"
        >
          <BarChart3 size={16} className="text-arcade-purple" />
          <span className="text-[10px] text-gray-400 lg:[writing-mode:vertical-lr] lg:rotate-180 uppercase tracking-wider font-bold">
            Analytics
          </span>
          <ChevronLeft size={14} className="text-gray-500 hidden lg:block" />
          <ChevronRight size={14} className="text-gray-500 lg:hidden" />
        </button>
      </div>
    );
  }

  const isSingleRound = analytics.summary.totalRounds <= 1;

  return (
    <div className={clsx('w-full lg:w-[380px] shrink-0 space-y-3', className)}>
      {/* Header */}
      <div className="arcade-card p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
          <span className="text-xs font-bold text-white tracking-wider uppercase">
            Match Analytics
          </span>
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-surface-2 transition-colors"
          title="Collapse panel"
          aria-label="Collapse analytics panel"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Win Probability Chart */}
      {!isSingleRound && (
        <WinProbabilityChart
          data={analytics.winProbability}
          currentRound={currentRoundIndex + 1}
        />
      )}

      {/* Score Momentum Chart */}
      {!isSingleRound && (
        <ScoreMomentumChart
          data={analytics.momentum}
          currentRound={currentRoundIndex + 1}
        />
      )}

      {/* Game-Specific Strategy */}
      <GameStrategySection
        strategy={analytics.strategy}
        player1={currentReplay.player1}
        player2={currentReplay.player2}
      />

      {/* Key Moments */}
      {analytics.keyMoments.length > 0 && (
        <KeyMomentsTimeline
          moments={analytics.keyMoments}
          currentRound={currentRoundIndex + 1}
          onSeek={(round) => seekToRound(round - 1)}
        />
      )}

      {/* Summary */}
      <HeadToHeadSummary
        analytics={analytics}
        player1={currentReplay.player1}
        player2={currentReplay.player2}
        winner={currentReplay.winner}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Win Probability Chart
// ---------------------------------------------------------------------------

function WinProbabilityChart({
  data,
  currentRound,
}: {
  data: MatchAnalytics['winProbability'];
  currentRound: number;
}) {
  return (
    <div className="arcade-card p-3">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
        <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
          Win Probability
        </span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="round"
            {...AXIS_STYLE}
            tick={{ fill: '#666', fontSize: 10 }}
          />
          <YAxis
            domain={[0, 100]}
            {...AXIS_STYLE}
            tick={{ fill: '#666', fontSize: 10 }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown, name: unknown) => [
              `${value}%`,
              name === 'p1Prob' ? 'Player 1' : 'Player 2',
            ]}
            labelFormatter={(label: unknown) => `Round ${label}`}
          />
          <Area
            type="monotone"
            dataKey="p1Prob"
            stroke={CHART_COLORS.cyan}
            fill={CHART_COLORS.cyan}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="p2Prob"
            stroke={CHART_COLORS.pink}
            fill={CHART_COLORS.pink}
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <ReferenceLine
            x={currentRound}
            stroke="#fff"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-between mt-1 px-1">
        <span className="text-[9px] text-arcade-cyan font-bold">P1</span>
        <span className="text-[9px] text-arcade-pink font-bold">P2</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score Momentum Chart
// ---------------------------------------------------------------------------

function ScoreMomentumChart({
  data,
  currentRound,
}: {
  data: MatchAnalytics['momentum'];
  currentRound: number;
}) {
  return (
    <div className="arcade-card p-3">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
        <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
          Score Momentum
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis
            dataKey="round"
            {...AXIS_STYLE}
            tick={{ fill: '#666', fontSize: 10 }}
          />
          <YAxis
            {...AXIS_STYLE}
            tick={{ fill: '#666', fontSize: 10 }}
          />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown) => {
              const v = Number(value);
              return [
                v > 0 ? `P1 +${v}` : v < 0 ? `P2 +${Math.abs(v)}` : 'Even',
                'Advantage',
              ];
            }}
            labelFormatter={(label: unknown) => `Round ${label}`}
          />
          <Bar dataKey="delta" radius={[2, 2, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.delta >= 0 ? CHART_COLORS.cyan : CHART_COLORS.pink}
                opacity={entry.isTurningPoint ? 1 : 0.7}
              />
            ))}
          </Bar>
          <ReferenceLine y={0} stroke="#555" />
          <ReferenceLine
            x={currentRound}
            stroke="#fff"
            strokeWidth={2}
            strokeDasharray="4 2"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game Strategy Section
// ---------------------------------------------------------------------------

function GameStrategySection({
  strategy,
  player1,
  player2,
}: {
  strategy: StrategyBreakdown;
  player1: string;
  player2: string;
}) {
  const p1Label = player1.slice(0, 6);
  const p2Label = player2.slice(0, 6);

  return (
    <div className="arcade-card p-3">
      <div className="flex items-center gap-2 mb-3">
        <Target size={14} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
        <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
          Strategy Breakdown
        </span>
      </div>

      {strategy.gameType === GameType.StrategyArena && (
        <StrategyArenaBreakdown strategy={strategy} p1Label={p1Label} p2Label={p2Label} />
      )}
      {strategy.gameType === GameType.AuctionWars && (
        <AuctionWarsBreakdown strategy={strategy} p1Label={p1Label} p2Label={p2Label} />
      )}
      {strategy.gameType === GameType.QuizBowl && (
        <QuizBowlBreakdown strategy={strategy} p1Label={p1Label} p2Label={p2Label} />
      )}
      {strategy.gameType === GameType.OracleDuel && (
        <OracleDuelBreakdown strategy={strategy} p1Label={p1Label} p2Label={p2Label} />
      )}
    </div>
  );
}

function StrategyArenaBreakdown({
  strategy,
  p1Label,
  p2Label,
}: {
  strategy: StrategyBreakdown;
  p1Label: string;
  p2Label: string;
}) {
  return (
    <div className="space-y-3">
      {/* Cooperation rates */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={`${p1Label} Coop Rate`}
          value={`${Math.round((strategy.p1CoopRate ?? 0) * 100)}%`}
          color="cyan"
        />
        <StatCard
          label={`${p2Label} Coop Rate`}
          value={`${Math.round((strategy.p2CoopRate ?? 0) * 100)}%`}
          color="pink"
        />
      </div>

      {/* Move patterns */}
      {strategy.p1MovePattern && strategy.p2MovePattern && (
        <div className="space-y-1.5">
          <PatternRow label={p1Label} pattern={strategy.p1MovePattern} color="cyan" />
          <PatternRow label={p2Label} pattern={strategy.p2MovePattern} color="pink" />
        </div>
      )}

      {/* Mutual outcomes */}
      <div className="flex justify-center gap-4 text-[10px] text-gray-400">
        <span>Mutual Coop: <span className="text-arcade-green font-bold">{strategy.mutualCoopCount ?? 0}</span></span>
        <span>Mutual Defect: <span className="text-arcade-red font-bold">{strategy.mutualDefectCount ?? 0}</span></span>
      </div>
    </div>
  );
}

function PatternRow({
  label,
  pattern,
  color,
}: {
  label: string;
  pattern: ('C' | 'D')[];
  color: 'cyan' | 'pink';
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={clsx('text-[10px] font-mono w-14 truncate', color === 'cyan' ? 'text-arcade-cyan' : 'text-arcade-pink')}>
        {label}
      </span>
      <div className="flex gap-0.5 flex-wrap">
        {pattern.map((move, i) => (
          <div
            key={i}
            className={clsx(
              'w-4 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold',
              move === 'C'
                ? 'bg-arcade-green/20 text-arcade-green border border-arcade-green/30'
                : 'bg-arcade-red/20 text-arcade-red border border-arcade-red/30',
            )}
            title={`Round ${i + 1}: ${move === 'C' ? 'Cooperate' : 'Defect'}`}
          >
            {move}
          </div>
        ))}
      </div>
    </div>
  );
}

function AuctionWarsBreakdown({
  strategy,
  p1Label,
  p2Label,
}: {
  strategy: StrategyBreakdown;
  p1Label: string;
  p2Label: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={`${p1Label} Bid Accuracy`}
          value={strategy.p1AvgBidAccuracy != null ? `${Math.round(strategy.p1AvgBidAccuracy * 100)}%` : 'N/A'}
          color="cyan"
        />
        <StatCard
          label={`${p2Label} Bid Accuracy`}
          value={strategy.p2AvgBidAccuracy != null ? `${Math.round(strategy.p2AvgBidAccuracy * 100)}%` : 'N/A'}
          color="pink"
        />
      </div>
      <div className="flex justify-center gap-4 text-[10px] text-gray-400">
        <span>{p1Label} Overbids: <span className="text-arcade-orange font-bold">{strategy.p1OverbidCount ?? 0}</span></span>
        <span>{p2Label} Overbids: <span className="text-arcade-orange font-bold">{strategy.p2OverbidCount ?? 0}</span></span>
      </div>
    </div>
  );
}

function QuizBowlBreakdown({
  strategy,
  p1Label,
  p2Label,
}: {
  strategy: StrategyBreakdown;
  p1Label: string;
  p2Label: string;
}) {
  const difficulties = ['easy', 'medium', 'hard'];
  const diffColors: Record<string, string> = {
    easy: 'text-arcade-green',
    medium: 'text-arcade-orange',
    hard: 'text-arcade-red',
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={`${p1Label} Correct`}
          value={`${Math.round((strategy.p1CorrectRate ?? 0) * 100)}%`}
          color="cyan"
        />
        <StatCard
          label={`${p2Label} Correct`}
          value={`${Math.round((strategy.p2CorrectRate ?? 0) * 100)}%`}
          color="pink"
        />
      </div>

      {/* By difficulty */}
      {strategy.p1ByDifficulty && strategy.p2ByDifficulty && (
        <div className="space-y-1">
          <span className="text-[9px] text-gray-500 uppercase tracking-wider">By Difficulty</span>
          {difficulties.map(diff => {
            const p1Rate = strategy.p1ByDifficulty?.[diff];
            const p2Rate = strategy.p2ByDifficulty?.[diff];
            if (p1Rate == null && p2Rate == null) return null;
            return (
              <div key={diff} className="flex items-center gap-2 text-[10px]">
                <span className={clsx('w-14 font-bold uppercase', diffColors[diff])}>{diff}</span>
                <span className="text-arcade-cyan font-mono w-10">{p1Rate != null ? `${Math.round(p1Rate * 100)}%` : '—'}</span>
                <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                  <div className="h-full flex">
                    <div
                      className="bg-arcade-cyan/60 h-full"
                      style={{ width: `${(p1Rate ?? 0) * 50}%` }}
                    />
                    <div
                      className="bg-arcade-pink/60 h-full ml-auto"
                      style={{ width: `${(p2Rate ?? 0) * 50}%` }}
                    />
                  </div>
                </div>
                <span className="text-arcade-pink font-mono w-10 text-right">{p2Rate != null ? `${Math.round(p2Rate * 100)}%` : '—'}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OracleDuelBreakdown({
  strategy,
  p1Label,
  p2Label,
}: {
  strategy: StrategyBreakdown;
  p1Label: string;
  p2Label: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={`${p1Label} Accuracy`}
          value={`${Math.round((strategy.p1PredictionAccuracy ?? 0) * 100)}%`}
          color="cyan"
        />
        <StatCard
          label={`${p2Label} Accuracy`}
          value={`${Math.round((strategy.p2PredictionAccuracy ?? 0) * 100)}%`}
          color="pink"
        />
      </div>
      <div className="flex justify-center gap-4 text-[10px] text-gray-400">
        <span>{p1Label} Best Streak: <span className="text-arcade-cyan font-bold">{strategy.p1LongestStreak ?? 0}</span></span>
        <span>{p2Label} Best Streak: <span className="text-arcade-pink font-bold">{strategy.p2LongestStreak ?? 0}</span></span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared stat card
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: 'cyan' | 'pink';
}) {
  return (
    <div className={clsx(
      'rounded-lg border p-2 text-center transition-all duration-200 hover:scale-[1.03]',
      color === 'cyan'
        ? 'border-arcade-cyan/20 bg-arcade-cyan/5'
        : 'border-arcade-pink/20 bg-arcade-pink/5',
    )}>
      <div className="text-[9px] text-gray-500 truncate">{label}</div>
      <div className={clsx(
        'text-lg font-mono font-bold',
        color === 'cyan' ? 'text-arcade-cyan' : 'text-arcade-pink',
      )}>
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Key Moments Timeline
// ---------------------------------------------------------------------------

const MOMENT_ICONS: Record<KeyMoment['type'], { icon: typeof Zap; color: string }> = {
  lead_change: { icon: ArrowRightLeft, color: 'text-arcade-gold' },
  big_swing: { icon: Zap, color: 'text-arcade-orange' },
  streak: { icon: Flame, color: 'text-arcade-red' },
};

function KeyMomentsTimeline({
  moments,
  currentRound,
  onSeek,
}: {
  moments: KeyMoment[];
  currentRound: number;
  onSeek: (round: number) => void;
}) {
  return (
    <div className="arcade-card p-3">
      <div className="flex items-center gap-2 mb-3">
        <Zap size={14} className="text-arcade-orange" style={{ filter: 'drop-shadow(0 0 3px rgba(255,165,0,0.4))' }} />
        <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
          Key Moments
        </span>
      </div>
      <div className="space-y-1 max-h-[180px] overflow-y-auto">
        {moments.map((moment, i) => {
          const config = MOMENT_ICONS[moment.type];
          const Icon = config.icon;
          const isActive = moment.round === currentRound;
          return (
            <button
              key={i}
              onClick={() => onSeek(moment.round)}
              className={clsx(
                'flex items-center gap-2 px-2 py-1.5 rounded-lg text-left w-full transition-colors',
                'hover:bg-surface-2',
                isActive && 'bg-surface-2 border border-arcade-purple/30',
              )}
            >
              <span className="text-[10px] font-mono text-gray-500 w-6">R{moment.round}</span>
              <Icon size={12} className={config.color} />
              <span className="text-[10px] text-gray-300 flex-1 truncate">{moment.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Head-to-Head Summary
// ---------------------------------------------------------------------------

function HeadToHeadSummary({
  analytics,
  player1,
  player2,
  winner,
}: {
  analytics: MatchAnalytics;
  player1: string;
  player2: string;
  winner: string | null;
}) {
  const { summary } = analytics;
  const p1Label = player1.slice(0, 6);
  const p2Label = player2.slice(0, 6);
  const p1Won = winner === player1;
  const p2Won = winner === player2;

  return (
    <div className="arcade-card p-3">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
        <span className="text-[10px] font-bold text-gray-400 tracking-wider uppercase">
          Match Summary
        </span>
      </div>

      {/* Score comparison */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-center">
          <div className={clsx('text-[10px] font-bold truncate w-16', p1Won ? 'text-arcade-green' : 'text-arcade-cyan')}>
            {p1Label}{p1Won ? ' W' : ''}
          </div>
          <div className="text-2xl font-mono font-bold text-white" style={p1Won ? { textShadow: '0 0 8px rgba(105,240,174,0.3)' } : undefined}>{summary.p1FinalScore}</div>
        </div>
        <div className="text-xs text-gray-500 font-bold">VS</div>
        <div className="text-center">
          <div className={clsx('text-[10px] font-bold truncate w-16', p2Won ? 'text-arcade-green' : 'text-arcade-pink')}>
            {p2Label}{p2Won ? ' W' : ''}
          </div>
          <div className="text-2xl font-mono font-bold text-white" style={p2Won ? { textShadow: '0 0 8px rgba(105,240,174,0.3)' } : undefined}>{summary.p2FinalScore}</div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Rounds" value={String(summary.totalRounds)} />
        <MiniStat label="Lead Changes" value={String(summary.leadChanges)} />
        <MiniStat
          label="Best Streak"
          value={summary.longestStreak.length > 0
            ? `P${summary.longestStreak.player} x${summary.longestStreak.length}`
            : '—'
          }
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] text-gray-500 uppercase">{label}</div>
      <div className="text-xs font-mono font-bold text-white">{value}</div>
    </div>
  );
}
