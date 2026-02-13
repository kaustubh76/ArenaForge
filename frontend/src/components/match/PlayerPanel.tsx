import clsx from 'clsx';
import { User, Trophy, Flame, Snowflake, Swords } from 'lucide-react';
import { AgentProfileExtended } from '@/types/arena';
import { EloBar } from '@/components/arcade/EloBar';
import { truncateAddress } from '@/constants/ui';

interface PlayerPanelProps {
  agent: AgentProfileExtended | undefined;
  address: string;
  score?: number;
  isWinner?: boolean;
  isLoser?: boolean;
  side: 'left' | 'right';
}

// Mini inline ELO sparkline (40×16px SVG)
function EloSparkline({ history, side }: { history: number[]; side: 'left' | 'right' }) {
  if (history.length < 3) return null;

  const recent = history.slice(-12);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const range = max - min || 1;
  const w = 40;
  const h = 16;

  const points = recent.map((v, i) => {
    const x = (i / (recent.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  const trending = recent[recent.length - 1] > recent[0];

  return (
    <svg
      width={w}
      height={h}
      className={clsx('flex-shrink-0', side === 'right' && 'ml-auto')}
      viewBox={`0 0 ${w} ${h}`}
    >
      <polyline
        points={points}
        fill="none"
        stroke={trending ? '#69f0ae' : '#ff5252'}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PlayerPanel({ agent, address, score, isWinner, isLoser, side }: PlayerPanelProps) {
  const name = agent?.moltbookHandle ?? truncateAddress(address);

  return (
    <div
      className={clsx(
        'arcade-card h-full',
        isWinner && 'border-arcade-green/30',
        isLoser && 'border-arcade-red/20 opacity-75',
        side === 'left' ? 'text-left' : 'text-right',
      )}
    >
      <div className={clsx('flex items-center gap-3 mb-3', side === 'right' && 'flex-row-reverse')}>
        <div className="w-10 h-10 rounded-lg bg-surface-1 border border-white/[0.08] flex items-center justify-center overflow-hidden">
          {agent?.avatarUrl ? (
            <img src={agent.avatarUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
          ) : (
            <User size={18} className="text-gray-500" />
          )}
        </div>
        <div>
          <p className="font-semibold text-white text-sm">{name}</p>
          <p className="text-[10px] text-gray-500 font-mono">{truncateAddress(address)}</p>
        </div>
      </div>

      {agent && (
        <div className={clsx('flex items-center gap-2 mb-3', side === 'right' && 'flex-row-reverse')}>
          <EloBar elo={agent.elo} className="flex-1" />
          {agent.eloHistory && <EloSparkline history={agent.eloHistory} side={side} />}
        </div>
      )}

      {/* Mini stats row */}
      {agent && (
        <div className={clsx(
          'flex items-center gap-2 flex-wrap mb-2',
          side === 'right' && 'flex-row-reverse',
        )}>
          {/* W/L Record */}
          <div className={clsx('flex items-center gap-1', side === 'right' && 'flex-row-reverse')}>
            <Swords size={10} className="text-gray-500" />
            <span className="text-[9px] font-mono">
              <span className="text-arcade-green">{agent.wins}W</span>
              <span className="text-gray-600"> - </span>
              <span className="text-arcade-red">{agent.losses}L</span>
            </span>
          </div>

          {/* Win Rate */}
          <span className={clsx(
            'text-[9px] font-mono px-1.5 py-0.5 rounded',
            agent.winRate >= 60 ? 'bg-arcade-green/10 text-arcade-green'
              : agent.winRate >= 40 ? 'bg-arcade-purple/10 text-arcade-purple'
              : 'bg-arcade-red/10 text-arcade-red',
          )}>
            {agent.winRate.toFixed(0)}%
          </span>

          {/* Streak */}
          {agent.streak !== 0 && (
            <div className={clsx('flex items-center gap-0.5', side === 'right' && 'flex-row-reverse')}>
              {agent.streak > 0 ? (
                <Flame size={10} className="text-arcade-green" />
              ) : (
                <Snowflake size={10} className="text-arcade-cyan/60" />
              )}
              <span className={clsx(
                'text-[9px] font-mono font-bold',
                agent.streak > 0 ? 'text-arcade-green' : 'text-arcade-cyan/60',
              )}>
                {Math.abs(agent.streak)}
              </span>
            </div>
          )}

          {/* Tournaments Won */}
          {agent.tournamentsWon != null && agent.tournamentsWon > 0 && (
            <div className={clsx('flex items-center gap-0.5', side === 'right' && 'flex-row-reverse')}>
              <Trophy size={10} className="text-arcade-gold" />
              <span className="text-[9px] font-mono font-bold text-arcade-gold">
                {agent.tournamentsWon}
              </span>
            </div>
          )}
        </div>
      )}

      {score !== undefined && (
        <div className={clsx('mt-2', side === 'right' && 'text-right')}>
          <span className="text-[10px] text-gray-500 uppercase">Score</span>
          <p className="font-mono text-2xl font-bold text-white">{score.toLocaleString()}</p>
        </div>
      )}

      {isWinner && (
        <div className={clsx(
          'mt-3 font-pixel text-[10px] neon-text-green',
          side === 'right' && 'text-right',
        )}>
          WINNER!
        </div>
      )}

      {isLoser && (
        <div className={clsx(
          'mt-3 font-pixel text-[10px] text-arcade-red/60',
          side === 'right' && 'text-right',
        )}>
          DEFEATED
        </div>
      )}
    </div>
  );
}
