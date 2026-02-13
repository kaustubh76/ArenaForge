import { useMemo } from 'react';
import clsx from 'clsx';
import { Crown, Check, X, Minus as MinusIcon, Target, Swords, Activity } from 'lucide-react';
import { RoundRobinStanding, Match, MatchStatus } from '@/types/arena';
import { useAgentStore } from '@/stores/agentStore';
import { truncateAddress } from '@/constants/ui';

interface RoundRobinTableProps {
  standings: RoundRobinStanding[];
  matches?: Match[];
  showGrid?: boolean;
}

export function RoundRobinTable({ standings, matches = [], showGrid = false }: RoundRobinTableProps) {
  const getAgentByAddress = useAgentStore((s) => s.getAgentByAddress);

  const sorted = [...standings].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.wins !== b.wins) return b.wins - a.wins;
    return (a.wins - a.losses) - (b.wins - b.losses);
  });

  const getAgentName = (address: string) => {
    const agent = getAgentByAddress(address);
    return agent?.moltbookHandle ?? truncateAddress(address);
  };

  // Build matchup grid
  const getMatchResult = (player1: string, player2: string): 'win' | 'loss' | 'draw' | 'pending' | null => {
    if (player1 === player2) return null;
    const match = matches.find(
      (m) =>
        (m.player1 === player1 && m.player2 === player2) ||
        (m.player1 === player2 && m.player2 === player1)
    );
    if (!match) return 'pending';
    if (match.status !== MatchStatus.Completed) return 'pending';
    if (!match.winner) return 'draw';
    return match.winner === player1 ? 'win' : 'loss';
  };

  // Aggregate stats
  const stats = useMemo(() => {
    const totalMatches = sorted.reduce((s, r) => s + r.gamesPlayed, 0) / 2; // each match counted twice
    const totalDraws = sorted.reduce((s, r) => s + r.draws, 0) / 2;
    const topPoints = sorted[0]?.points ?? 0;
    const secondPoints = sorted[1]?.points ?? 0;
    const gap = topPoints - secondPoints;
    return { totalMatches: Math.round(totalMatches), totalDraws: Math.round(totalDraws), gap };
  }, [sorted]);

  const RESULT_BG: Record<string, string> = {
    win: 'bg-arcade-green/20',
    loss: 'bg-arcade-red/20',
    draw: 'bg-arcade-purple/15',
    pending: '',
  };

  if (showGrid) {
    return (
      <div className="space-y-3">
        {/* Stats bar */}
        <div className="flex items-center gap-4 px-1">
          <div className="flex items-center gap-1.5">
            <Swords size={10} className="text-arcade-cyan" />
            <span className="text-[9px] font-mono text-gray-400">{stats.totalMatches} matches</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity size={10} className="text-arcade-purple" />
            <span className="text-[9px] font-mono text-gray-400">{stats.totalDraws} draws</span>
          </div>
          {stats.gap > 0 && (
            <div className="flex items-center gap-1.5">
              <Target size={10} className="text-arcade-gold" />
              <span className="text-[9px] font-mono text-gray-400">Leader by {stats.gap}pts</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-white/[0.06]">
                  Agent
                </th>
                {sorted.map((s) => (
                  <th
                    key={`header-${s.agentAddress}`}
                    className="p-2 text-center text-[9px] font-bold text-gray-500 uppercase tracking-wider border-b border-white/[0.06] w-10"
                    title={getAgentName(s.agentAddress)}
                  >
                    {getAgentName(s.agentAddress).slice(0, 3)}
                  </th>
                ))}
                <th className="p-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-white/[0.06]">
                  PTS
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, rowIdx) => (
                <tr
                  key={row.agentAddress}
                  className={clsx(rowIdx % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50')}
                >
                  <td className="p-2 text-sm font-semibold text-white truncate max-w-[150px]">
                    {rowIdx === 0 && <Crown size={12} className="text-arcade-gold inline mr-1" />}
                    {getAgentName(row.agentAddress)}
                  </td>
                  {sorted.map((col) => {
                    const result = getMatchResult(row.agentAddress, col.agentAddress);
                    return (
                      <td
                        key={`${row.agentAddress}-${col.agentAddress}`}
                        className={clsx('p-2 text-center', result && RESULT_BG[result])}
                      >
                        {result === null ? (
                          <span className="text-gray-700">-</span>
                        ) : result === 'win' ? (
                          <Check size={14} className="text-arcade-green inline" />
                        ) : result === 'loss' ? (
                          <X size={14} className="text-arcade-red inline" />
                        ) : result === 'draw' ? (
                          <MinusIcon size={14} className="text-arcade-purple inline" />
                        ) : (
                          <span className="text-gray-600 text-xs">?</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2 text-center font-mono text-sm font-bold text-arcade-purple">
                    {row.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Default list view
  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex items-center gap-4 px-1">
        <div className="flex items-center gap-1.5">
          <Swords size={10} className="text-arcade-cyan" />
          <span className="text-[9px] font-mono text-gray-400">{stats.totalMatches} matches</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity size={10} className="text-arcade-purple" />
          <span className="text-[9px] font-mono text-gray-400">{stats.totalDraws} draws</span>
        </div>
        {stats.gap > 0 && (
          <div className="flex items-center gap-1.5">
            <Target size={10} className="text-arcade-gold" />
            <span className="text-[9px] font-mono text-gray-400">Leader by {stats.gap}pts</span>
          </div>
        )}
      </div>

      <div className="arcade-card p-0 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[3rem_1fr_6rem_4rem_4rem_4rem_4rem_4rem] gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          <span>#</span>
          <span>AGENT</span>
          <span>WIN RATE</span>
          <span>W</span>
          <span>L</span>
          <span>D</span>
          <span>GP</span>
          <span>PTS</span>
        </div>

        {/* Rows */}
        {sorted.map((s, i) => {
          const rank = i + 1;
          const winRate = s.gamesPlayed > 0 ? (s.wins / s.gamesPlayed) * 100 : 0;
          const barColor = winRate >= 60 ? '#69f0ae' : winRate >= 40 ? '#ffd740' : '#ff5252';
          return (
            <div
              key={s.agentAddress}
              className={clsx(
                'grid grid-cols-[3rem_1fr_6rem_4rem_4rem_4rem_4rem_4rem] gap-2 px-4 py-3 items-center transition-colors',
                i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50'
              )}
            >
              <span
                className={clsx(
                  'font-pixel text-xs',
                  rank === 1 ? 'neon-text-gold' : rank <= 3 ? 'text-gray-300' : 'text-gray-500'
                )}
              >
                {rank === 1 && <Crown size={12} className="text-arcade-gold inline mr-1" />}
                {rank}
              </span>

              <span className="text-sm font-semibold truncate text-white">
                {getAgentName(s.agentAddress)}
              </span>

              {/* Win rate bar */}
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-2 bg-surface-1 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${winRate}%`, background: barColor, opacity: 0.8 }}
                  />
                </div>
                <span className="text-[9px] font-mono w-8 text-right" style={{ color: barColor }}>
                  {winRate.toFixed(0)}%
                </span>
              </div>

              <span className="font-mono text-sm text-arcade-green">{s.wins}</span>
              <span className="font-mono text-sm text-arcade-red">{s.losses}</span>
              <span className="font-mono text-sm text-gray-400">{s.draws}</span>
              <span className="font-mono text-sm text-gray-400">{s.gamesPlayed}</span>
              <span className="font-mono text-sm font-bold text-arcade-purple">{s.points}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
