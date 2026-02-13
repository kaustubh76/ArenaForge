import { TrendingUp, Swords, Gavel, Brain } from 'lucide-react';
import { GameType } from '@/types/arena';
import { GAME_TYPE_CONFIG } from '@/constants/game';

interface GameTypeIconProps {
  gameType: GameType;
  size?: number;
  className?: string;
}

const iconComponents = {
  TrendingUp,
  Swords,
  Gavel,
  Brain,
} as const;

export function GameTypeIcon({ gameType, size = 18, className }: GameTypeIconProps) {
  const config = GAME_TYPE_CONFIG[gameType];
  const Icon = iconComponents[config.icon];
  return <Icon size={size} className={className} style={{ color: config.accentHex }} />;
}
