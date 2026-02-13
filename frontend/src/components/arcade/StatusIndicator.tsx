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

export function StatusIndicator({ status, type = 'tournament', showLabel = true, className }: StatusIndicatorProps) {
  const config = type === 'tournament'
    ? STATUS_CONFIG[status as TournamentStatus]
    : MATCH_STATUS_CONFIG[status as MatchStatus];

  const isLive = config.label === 'LIVE';

  return (
    <span className={clsx('inline-flex items-center gap-1.5', className)}>
      <span
        className={clsx(
          'w-2 h-2 rounded-full',
          dotColors[config.color] || 'bg-gray-500',
          isLive && 'animate-pulse',
        )}
      />
      {showLabel && (
        <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400">
          {config.label}
        </span>
      )}
    </span>
  );
}
