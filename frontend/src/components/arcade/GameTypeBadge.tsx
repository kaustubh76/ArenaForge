import clsx from 'clsx';
import { GameType } from '@/types/arena';
import { GAME_TYPE_CONFIG } from '@/constants/game';
import { GameTypeIcon } from './GameTypeIcon';

interface GameTypeBadgeProps {
  gameType: GameType;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

const bgClasses: Record<GameType, string> = {
  [GameType.OracleDuel]: 'game-bg-oracle',
  [GameType.StrategyArena]: 'game-bg-strategy',
  [GameType.AuctionWars]: 'game-bg-auction',
  [GameType.QuizBowl]: 'game-bg-quiz',
};

const gameGlow: Record<GameType, string> = {
  [GameType.OracleDuel]: '0 0 6px rgba(0,229,255,0.3)',
  [GameType.StrategyArena]: '0 0 6px rgba(168,85,247,0.3)',
  [GameType.AuctionWars]: '0 0 6px rgba(255,215,0,0.3)',
  [GameType.QuizBowl]: '0 0 6px rgba(105,240,174,0.3)',
};

const gameDescriptions: Record<GameType, string> = {
  [GameType.OracleDuel]: 'Price prediction battles',
  [GameType.StrategyArena]: 'Prisoner\'s dilemma strategy',
  [GameType.AuctionWars]: 'Sealed-bid auction combat',
  [GameType.QuizBowl]: 'Knowledge showdown',
};

export function GameTypeBadge({ gameType, size = 'md', showLabel = true, className }: GameTypeBadgeProps) {
  const config = GAME_TYPE_CONFIG[gameType];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md relative overflow-hidden group',
        bgClasses[gameType],
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        'font-semibold tracking-wide uppercase transition-all duration-200',
        'hover:shadow-sm hover:brightness-110 hover:scale-105',
        className,
      )}
      title={gameDescriptions[gameType]}
      style={{ boxShadow: gameGlow[gameType] }}
    >
      {/* Hover shine effect */}
      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
      <GameTypeIcon gameType={gameType} size={size === 'sm' ? 12 : 14} />
      {showLabel && <span>{config.shortLabel}</span>}
    </span>
  );
}
