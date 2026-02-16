import { useState, useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { Dna, TrendingUp, TrendingDown, Activity, Zap, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useEvolutionStore } from '@/stores/evolutionStore';
import { useArenaStore } from '@/stores/arenaStore';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';
import { ErrorAlert } from '@/components/arcade/ErrorAlert';
import { ShimmerLoader, SkeletonStatCard } from '@/components/arcade/ShimmerLoader';
import { MutationCard } from '@/components/evolution/MutationCard';
import { MetricsPanel } from '@/components/evolution/MetricsPanel';
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_STYLE } from '@/components/charts';
import { timeAgo } from '@/utils/format';
import { Breadcrumbs } from '@/components/arcade/Breadcrumbs';
import { FreshnessIndicator } from '@/components/arcade/FreshnessIndicator';

export function EvolutionDashboard() {
  const { records, selectedTournamentId, loading, error, selectTournament, getFilteredRecords, fetchFromChain, fetchFromGraphQL } = useEvolutionStore();
  const { tournaments } = useArenaStore();
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const prevRecordCount = useRef(records.length);

  // Track data freshness
  useEffect(() => {
    if (records.length > 0 && records.length !== prevRecordCount.current) {
      setLastUpdated(Date.now());
    }
    prevRecordCount.current = records.length;
    if (records.length > 0 && !lastUpdated) setLastUpdated(Date.now());
  }, [records.length]);

  // Auto-fetch on mount — tries chain first, falls back to GraphQL
  useEffect(() => {
    fetchFromChain();
  }, [fetchFromChain]);

  // Re-fetch when tournament selection changes
  useEffect(() => {
    if (selectedTournamentId !== null) {
      fetchFromGraphQL(selectedTournamentId);
    }
  }, [selectedTournamentId, fetchFromGraphQL]);

  // Auto-refresh every 30 seconds when page is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) fetchFromChain();
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchFromChain]);

  const filteredRecords = getFilteredRecords();
  const tournamentIds = [...new Set(records.map(r => r.tournamentId))];

  return (
    <div>
      <Breadcrumbs crumbs={[{ label: 'Evolution' }]} />
      <div className="flex items-start justify-between">
        <RetroHeading level={1} color="cyan" subtitle="Parameter mutations">
          EVOLUTION LAB
        </RetroHeading>
        <FreshnessIndicator lastUpdated={lastUpdated} />
      </div>

      {/* Error alert */}
      {error && !errorDismissed && (
        <ErrorAlert
          message={error}
          onRetry={() => { setErrorDismissed(false); fetchFromChain(); }}
          onDismiss={() => setErrorDismissed(true)}
          className="mb-6"
        />
      )}

      {/* Loading indicator */}
      {loading && records.length === 0 && !error && (
        <div className="space-y-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <ShimmerLoader key={i} width="w-20" height="h-8" className="rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonStatCard key={i} />
            ))}
          </div>
        </div>
      )}

      {/* Tournament selector */}
      <div className="flex flex-wrap gap-2 mb-8">
        <button
          onClick={() => selectTournament(null)}
          className={clsx(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
            selectedTournamentId === null
              ? 'bg-arcade-cyan/15 text-arcade-cyan border-arcade-cyan/40'
              : 'text-gray-500 border-white/[0.06] hover:text-gray-300',
          )}
          style={selectedTournamentId === null ? { boxShadow: '0 0 8px rgba(0,229,255,0.15)' } : undefined}
        >
          ALL
        </button>
        {tournamentIds.map(tid => {
          const t = tournaments.find(t => t.id === tid);
          if (!t) return null;
          return (
            <button
              key={tid}
              onClick={() => selectTournament(tid)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                selectedTournamentId === tid
                  ? 'bg-arcade-cyan/15 text-arcade-cyan border-arcade-cyan/40'
                  : 'text-gray-500 border-white/[0.06] hover:text-gray-300',
              )}
              style={selectedTournamentId === tid ? { boxShadow: '0 0 8px rgba(0,229,255,0.15)' } : undefined}
            >
              <GameTypeBadge gameType={t.gameType} size="sm" showLabel={false} />
              {t.name}
            </button>
          );
        })}
      </div>

      {/* Analytics panels — only shown when we have data */}
      {filteredRecords.length > 0 && <EvolutionAnalytics records={filteredRecords} />}

      {filteredRecords.length === 0 && !loading ? (
        <div className="text-center py-16">
          <Dna size={32} className="text-gray-700 mx-auto mb-4" />
          <p className="font-pixel text-xs text-gray-600">NO EVOLUTION DATA</p>
          <p className="text-sm text-gray-500 mt-2">Mutations will appear after tournament rounds complete</p>
        </div>
      ) : filteredRecords.length > 0 && (
        /* Timeline */
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-arcade-cyan/20" style={{ boxShadow: '0 0 4px rgba(0,229,255,0.1)' }} />

          <div className="space-y-8">
            {filteredRecords.map((record, i) => {
              const t = tournaments.find(t => t.id === record.tournamentId);
              return (
                <div
                  key={`${record.tournamentId}-${record.round}`}
                  className="relative pl-12 animate-fade-in-up opacity-0"
                  style={{ animationDelay: `${i * 0.1}s`, animationFillMode: 'forwards' }}
                >
                  {/* Timeline dot */}
                  <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-arcade-cyan border-2 border-surface-0 animate-glow-pulse" style={{ boxShadow: '0 0 6px rgba(0,229,255,0.4)' }} />

                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    {t && <GameTypeBadge gameType={t.gameType} size="sm" />}
                    <span className="font-pixel text-[9px] text-gray-500">
                      ROUND {record.round}
                    </span>
                    <span className="text-[10px] text-gray-600" title={new Date(record.timestamp).toLocaleString()}>
                      {timeAgo(record.timestamp)}
                    </span>
                  </div>

                  {/* Mutations */}
                  <div className="space-y-3 mb-4">
                    {record.mutations.map((mutation, mi) => (
                      <MutationCard key={mi} mutation={mutation} />
                    ))}
                  </div>

                  {/* Metrics */}
                  <MetricsPanel metrics={record.metrics} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evolution Analytics — charts & summary panels for mutation data
// ---------------------------------------------------------------------------
function EvolutionAnalytics({ records }: { records: import('@/types/arena').EvolutionRecord[] }) {
  const stats = useMemo(() => {
    let totalMutations = 0;
    let scaleMutations = 0;
    let shiftMutations = 0;
    let positiveCount = 0;
    let negativeCount = 0;
    let drawRateSum = 0;
    let durationSum = 0;
    const behaviorCounts: Record<string, number> = {};
    const allStrategies: Record<string, number> = {};

    records.forEach(r => {
      totalMutations += r.mutations.length;
      r.mutations.forEach(m => {
        if (m.type === 'scale') scaleMutations++;
        else shiftMutations++;
        const isPositive = (m.factor && m.factor > 1) || (m.increment && m.increment > 0);
        if (isPositive) positiveCount++;
        else negativeCount++;
      });

      drawRateSum += r.metrics.drawRate;
      durationSum += r.metrics.averageMatchDuration;
      behaviorCounts[r.metrics.averageStakeBehavior] = (behaviorCounts[r.metrics.averageStakeBehavior] || 0) + 1;

      Object.entries(r.metrics.strategyDistribution).forEach(([strat, pct]) => {
        allStrategies[strat] = (allStrategies[strat] || 0) + pct;
      });
    });

    // Normalize strategy percentages
    const stratEntries = Object.entries(allStrategies);
    const stratTotal = stratEntries.reduce((s, [, v]) => s + v, 0);
    const strategyData = stratEntries
      .map(([name, val]) => ({ name, value: stratTotal > 0 ? Math.round((val / stratTotal) * 100) : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const dominantBehavior = Object.entries(behaviorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';
    const avgDrawRate = records.length > 0 ? drawRateSum / records.length : 0;
    const avgDuration = records.length > 0 ? Math.round(durationSum / records.length) : 0;

    // Mutation trend data — group by round
    const trendData = records
      .slice()
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(r => {
        const scaleCount = r.mutations.filter(m => m.type === 'scale').length;
        const shiftCount = r.mutations.filter(m => m.type !== 'scale').length;
        return {
          label: `R${r.round}`,
          scale: scaleCount,
          shift: shiftCount,
        };
      });

    // Mutation type breakdown for pie
    const typeData = [
      { name: 'Scale', value: scaleMutations, color: CHART_COLORS.purple },
      { name: 'Shift', value: shiftMutations, color: CHART_COLORS.cyan },
    ];

    return {
      totalMutations, scaleMutations, shiftMutations,
      positiveCount, negativeCount,
      avgDrawRate, avgDuration, dominantBehavior,
      strategyData, trendData, typeData,
    };
  }, [records]);

  const STRAT_COLORS = [CHART_COLORS.cyan, CHART_COLORS.purple, CHART_COLORS.pink, CHART_COLORS.gold, CHART_COLORS.green, CHART_COLORS.orange];

  return (
    <div className="mb-8 space-y-4">
      {/* Stats summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="arcade-card p-3 text-center">
          <Zap size={16} className="text-arcade-purple mx-auto mb-1" style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.4))' }} />
          <p className="text-lg font-mono font-bold text-white">{stats.totalMutations}</p>
          <p className="text-[9px] font-pixel text-gray-500">MUTATIONS</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp size={14} className="text-arcade-green" />
            <TrendingDown size={14} className="text-arcade-red" />
          </div>
          <p className="text-lg font-mono font-bold text-white">
            <span className="text-arcade-green">{stats.positiveCount}</span>
            <span className="text-gray-600">/</span>
            <span className="text-arcade-red">{stats.negativeCount}</span>
          </p>
          <p className="text-[9px] font-pixel text-gray-500">BUFF / NERF</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <Activity size={16} className="text-arcade-cyan mx-auto mb-1" style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.4))' }} />
          <p className="text-lg font-mono font-bold text-white">{(stats.avgDrawRate * 100).toFixed(0)}%</p>
          <p className="text-[9px] font-pixel text-gray-500">AVG DRAW RATE</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <BarChart3 size={16} className="text-arcade-gold mx-auto mb-1" style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.4))' }} />
          <p className="text-lg font-mono font-bold text-white capitalize">{stats.dominantBehavior}</p>
          <p className="text-[9px] font-pixel text-gray-500">META BEHAVIOR</p>
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Mutation Trend Bar Chart */}
        {stats.trendData.length > 1 && (
          <div className="arcade-card p-4 md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">MUTATION TREND</span>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={stats.trendData} barGap={2}>
                <XAxis dataKey="label" {...AXIS_STYLE} />
                <YAxis allowDecimals={false} width={24} {...AXIS_STYLE} />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: unknown) => [String(value), '']}
                />
                <Bar dataKey="scale" stackId="a" fill={CHART_COLORS.purple} radius={[0, 0, 0, 0]} name="Scale" />
                <Bar dataKey="shift" stackId="a" fill={CHART_COLORS.cyan} radius={[4, 4, 0, 0]} name="Shift" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center justify-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_COLORS.purple }} />
                <span className="text-[9px] text-gray-500">Scale</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: CHART_COLORS.cyan }} />
                <span className="text-[9px] text-gray-500">Shift</span>
              </div>
            </div>
          </div>
        )}

        {/* Mutation Type Pie + Strategy Meta */}
        <div className="space-y-4">
          {/* Mutation type donut */}
          <div className="arcade-card p-4">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">TYPE SPLIT</span>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie
                    data={stats.typeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {stats.typeData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: unknown) => [String(value), '']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-3 mt-1">
              {stats.typeData.map(d => (
                <div key={d.name} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span className="text-[9px] text-gray-400">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Strategy Meta Breakdown */}
          {stats.strategyData.length > 0 && (
            <div className="arcade-card p-4">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">STRATEGY META</span>
              <div className="space-y-1.5">
                {stats.strategyData.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span className="text-[9px] text-gray-400 w-20 truncate">{s.name}</span>
                    <div className="flex-1 h-2 bg-surface-1 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${s.value}%`,
                          background: STRAT_COLORS[i % STRAT_COLORS.length],
                          opacity: 0.8,
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-gray-300 w-8 text-right">{s.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
