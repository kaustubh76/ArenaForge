import { useMemo } from 'react';
import clsx from 'clsx';
import { Crown, Minus, Shield, Swords } from 'lucide-react';
import { AgentStanding } from '@/types/arena';
import { EloBar } from '@/components/arcade/EloBar';

interface SwissTableProps {
  standings: AgentStanding[];
}

export function SwissTable({ standings }: SwissTableProps) {
  const sorted = [...standings].sort((a, b) => {
    if (a.tournamentPoints !== b.tournamentPoints) return b.tournamentPoints - a.tournamentPoints;
    return b.elo - a.elo;
  });

  // Aggregate stats
  const stats = useMemo(() => {
    const active = sorted.filter(s => !s.eliminated).length;
    const eliminated = sorted.filter(s => s.eliminated).length;
    const topPts = sorted[0]?.tournamentPoints ?? 0;
    const avgElo = sorted.length > 0 ? Math.round(sorted.reduce((s, a) => s + a.elo, 0) / sorted.length) : 0;
    return { active, eliminated, topPts, avgElo };
  }, [sorted]);

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <Swords size={10} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 2px rgba(105,240,174,0.4))' }} />
          <span className="text-[9px] font-mono text-gray-400">{stats.active} active</span>
        </div>
        {stats.eliminated > 0 && (
          <div className="flex items-center gap-1.5">
            <Minus size={10} className="text-arcade-red" style={{ filter: 'drop-shadow(0 0 2px rgba(255,82,82,0.4))' }} />
            <span className="text-[9px] font-mono text-gray-400">{stats.eliminated} eliminated</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Shield size={10} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 2px rgba(168,85,247,0.4))' }} />
          <span className="text-[9px] font-mono text-gray-400">Avg ELO {stats.avgElo}</span>
        </div>
      </div>

      <div className="arcade-card p-0 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[3rem_1fr_8rem_5rem_4rem_4rem] gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          <span>#</span>
          <span>AGENT</span>
          <span>ELO</span>
          <span>POINTS</span>
          <span>PTS</span>
          <span>STATUS</span>
        </div>

        {/* Rows */}
        {sorted.map((s, i) => {
          const rank = i + 1;
          const pointsPct = stats.topPts > 0 ? (s.tournamentPoints / stats.topPts) * 100 : 0;
          const barColor = rank <= 3 ? '#b388ff' : '#666';
          return (
            <div
              key={s.address}
              className={clsx(
                'grid grid-cols-[3rem_1fr_8rem_5rem_4rem_4rem] gap-2 px-4 py-3 items-center transition-all duration-200 hover:bg-surface-1/50',
                i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50',
                s.eliminated && 'opacity-50',
              )}
            >
              <span className={clsx(
                'font-pixel text-xs',
                rank === 1 ? 'neon-text-gold' : rank <= 3 ? 'text-gray-300' : 'text-gray-500',
              )}>
                {rank === 1 && <Crown size={12} className="text-arcade-gold inline mr-1" />}
                {rank}
              </span>

              <span className={clsx(
                'text-sm font-semibold truncate',
                s.eliminated ? 'text-gray-600 line-through' : 'text-white',
              )}>
                {s.handle}
              </span>

              <EloBar elo={s.elo} showLabel={false} />

              {/* Points progress bar */}
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-2 bg-surface-1 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pointsPct}%`, background: barColor, opacity: 0.8 }}
                  />
                </div>
              </div>

              <span className="font-mono text-sm font-bold text-arcade-purple" style={rank <= 3 ? { textShadow: '0 0 6px rgba(168,85,247,0.3)' } : undefined}>
                {s.tournamentPoints}
              </span>

              <span>
                {s.eliminated ? (
                  <span className="text-[10px] text-arcade-red font-bold flex items-center gap-1">
                    <Minus size={10} /> OUT
                  </span>
                ) : (
                  <span className="text-[10px] text-arcade-green font-bold">ACTIVE</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
