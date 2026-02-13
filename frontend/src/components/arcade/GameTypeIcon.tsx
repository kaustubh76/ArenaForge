import { TrendingUp, Swords, Gavel, Brain } from 'lucide-react';
import clsx from 'clsx';
import { GameType } from '@/types/arena';
import { GAME_TYPE_CONFIG } from '@/constants/game';

interface GameTypeIconProps {
  gameType: GameType;
  size?: number;
  animated?: boolean;
  className?: string;
}

const iconComponents = {
  TrendingUp,
  Swords,
  Gavel,
  Brain,
} as const;

export function GameTypeIcon({ gameType, size = 18, animated = false, className }: GameTypeIconProps) {
  const config = GAME_TYPE_CONFIG[gameType];
  const Icon = iconComponents[config.icon];
  return (
    <Icon
      size={size}
      className={clsx(
        'transition-all duration-200',
        animated && 'animate-pulse-soft',
        className,
      )}
      style={{
        color: config.accentHex,
        filter: `drop-shadow(0 0 3px ${config.accentHex}40)`,
      }}
    />
  );
}
