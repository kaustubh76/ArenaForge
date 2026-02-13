import clsx from 'clsx';
import { GameType } from '@/types/arena';
import { GAME_TYPE_CONFIG } from '@/constants/game';

interface ArcadeCardProps {
  gameType?: GameType;
  hoverable?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const gameGlow: Record<number, string> = {
  [GameType.OracleDuel]: '0 0 12px rgba(245,158,11,0.12)',
  [GameType.StrategyArena]: '0 0 12px rgba(139,92,246,0.12)',
  [GameType.AuctionWars]: '0 0 12px rgba(6,182,212,0.12)',
  [GameType.QuizBowl]: '0 0 12px rgba(34,197,94,0.12)',
};

export function ArcadeCard({ gameType, hoverable = false, className, children, onClick }: ArcadeCardProps) {
  const gameClass = gameType !== undefined ? GAME_TYPE_CONFIG[gameType].cardClass : '';
  const glowStyle = gameType !== undefined && hoverable ? gameGlow[gameType] : undefined;

  return (
    <div
      className={clsx(
        'arcade-card transition-shadow duration-300',
        gameClass,
        hoverable && 'arcade-card-hoverable',
        className,
      )}
      onClick={onClick}
      style={glowStyle ? { boxShadow: glowStyle } : undefined}
    >
      {children}
    </div>
  );
}
