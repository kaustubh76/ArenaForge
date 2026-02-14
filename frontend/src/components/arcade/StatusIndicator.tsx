import clsx from 'clsx';
import { TournamentStatus, MatchStatus } from '@/types/arena';
import { STATUS_CONFIG, MATCH_STATUS_CONFIG } from '@/constants/game';

interface StatusIndicatorProps {
  status: TournamentStatus | MatchStatus;
  type?: 'tournament' | 'match';
  showLabel?: boolean;
  className?: string;
}

const dotColors: Record<string, string> = {
  green: 'bg-arcade-green',
  cyan: 'bg-arcade-cyan',
  purple: 'bg-arcade-purple',
  red: 'bg-arcade-red',
  orange: 'bg-arcade-orange',
};

const labelColors: Record<string, string> = {
  green: 'text-arcade-green',
  cyan: 'text-arcade-cyan',
  purple: 'text-arcade-purple',
  red: 'text-arcade-red',
  orange: 'text-arcade-orange',
};

export function StatusIndicator({ status, type = 'tournament', showLabel = true, className }: StatusIndicatorProps) {
  const config = type === 'tournament'
    ? STATUS_CONFIG[status as TournamentStatus]
    : MATCH_STATUS_CONFIG[status as MatchStatus];

  const isLive = config.label === 'LIVE';
  const dotColor = dotColors[config.color] || 'bg-gray-500';

  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      <span className="relative flex items-center justify-center">
        {/* Halo ring for LIVE */}
        {isLive && (
          <span className={clsx('absolute w-3.5 h-3.5 rounded-full animate-ping opacity-30', dotColor)} />
        )}
        <span
          className={clsx(
            'w-2 h-2 rounded-full relative',
            dotColor,
            isLive && 'animate-pulse',
          )}
          style={isLive ? {
            boxShadow: config.color === 'green' ? '0 0 4px rgba(105,240,174,0.6)'
              : config.color === 'cyan' ? '0 0 4px rgba(0,229,255,0.6)'
              : config.color === 'purple' ? '0 0 4px rgba(168,85,247,0.6)'
              : config.color === 'red' ? '0 0 4px rgba(255,82,82,0.6)'
              : '0 0 4px rgba(255,152,0,0.6)'
          } : undefined}
        />
      </span>
      {showLabel && (
        <span
          className={clsx(
            'text-[10px] font-bold tracking-wider uppercase',
            isLive ? (labelColors[config.color] || 'text-gray-400') : 'text-gray-400',
          )}
          style={isLive ? {
            textShadow: config.color === 'green' ? '0 0 6px rgba(105,240,174,0.3)'
              : config.color === 'cyan' ? '0 0 6px rgba(0,229,255,0.3)'
              : '0 0 6px rgba(168,85,247,0.3)'
          } : undefined}
        >
          {config.label}
        </span>
      )}
    </span>
  );
}
