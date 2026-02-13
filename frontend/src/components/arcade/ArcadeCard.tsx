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

export function ArcadeCard({ gameType, hoverable = false, className, children, onClick }: ArcadeCardProps) {
  const gameClass = gameType !== undefined ? GAME_TYPE_CONFIG[gameType].cardClass : '';

  return (
    <div
      className={clsx(
        'arcade-card',
        gameClass,
        hoverable && 'arcade-card-hoverable',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
