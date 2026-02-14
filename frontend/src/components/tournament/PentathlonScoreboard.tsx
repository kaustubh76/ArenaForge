import { useMemo } from 'react';
import clsx from 'clsx';
import { Crown, Medal, Trophy, Star } from 'lucide-react';
import { PentathlonStanding, GameType } from '@/types/arena';
import { useAgentStore } from '@/stores/agentStore';
import { truncateAddress } from '@/constants/ui';

interface PentathlonScoreboardProps {
  standings: PentathlonStanding[];
  currentEvent?: GameType;
  completedEvents?: GameType[];
}

const GAME_TYPE_LABELS: Record<GameType, string> = {
  [GameType.OracleDuel]: 'Oracle',
  [GameType.StrategyArena]: 'Strategy',
  [GameType.AuctionWars]: 'Auction',
  [GameType.QuizBowl]: 'Quiz',
};

const GAME_TYPE_ICONS: Record<GameType, string> = {
  [GameType.OracleDuel]: '🔮',
  [GameType.StrategyArena]: '♟️',
  [GameType.AuctionWars]: '💰',
  [GameType.QuizBowl]: '❓',
};

const ALL_GAME_TYPES = [
  GameType.OracleDuel,
  GameType.StrategyArena,
  GameType.AuctionWars,
  GameType.QuizBowl,
];

// Points awarded by position (1st through 8th)
const POSITION_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

function getRankSuffix(rank: number): string {
  if (rank >= 11 && rank <= 13) return 'th';
  switch (rank % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export function PentathlonScoreboard({
  standings,
  currentEvent,
  completedEvents = [],
}: PentathlonScoreboardProps) {
  const getAgentByAddress = useAgentStore((s) => s.getAgentByAddress);

  const getAgentName = (address: string) => {
    const agent = getAgentByAddress(address);
    return agent?.moltbookHandle ?? truncateAddress(address);
  };

  const sorted = [...standings].sort((a, b) => b.totalPoints - a.totalPoints);

  // Max points for bar scaling
  const maxPoints = sorted.length > 0 ? sorted[0].totalPoints : 1;

  // Event dominance: who has most 1st places
  const eventDominance = useMemo(() => {
    const dominanceMap = new Map<string, number>();
    sorted.forEach(s => {
      let firstPlaces = 0;
      ALL_GAME_TYPES.forEach(gt => {
        if (s.eventScores[gt]?.rank === 1) firstPlaces++;
      });
      if (firstPlaces > 0) dominanceMap.set(s.agentAddress, firstPlaces);
    });
    return dominanceMap;
  }, [sorted]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown size={14} className="text-arcade-gold" />;
      case 2:
        return <Medal size={14} className="text-gray-300" />;
      case 3:
        return <Medal size={14} className="text-amber-600" />;
      default:
        return null;
    }
  };

  return (
    <div className="arcade-card p-0 overflow-hidden">
      {/* Header with event indicators */}
      <div className="px-4 py-3 border-b border-white/[0.06] bg-surface-3/30">
        <div className="flex items-center justify-between">
          <h3 className="font-pixel text-xs text-arcade-purple flex items-center gap-2">
            <Trophy size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.5))' }} />
            PENTATHLON STANDINGS
          </h3>
          <div className="flex items-center gap-2">
            {ALL_GAME_TYPES.map((gameType) => {
              const isCompleted = completedEvents.includes(gameType);
              const isCurrent = currentEvent === gameType;
              return (
                <div
                  key={gameType}
                  className={clsx(
                    'text-xs px-2 py-1 rounded flex items-center gap-1',
                    isCompleted
                      ? 'bg-arcade-green/10 text-arcade-green'
                      : isCurrent
                        ? 'bg-arcade-gold/10 text-arcade-gold animate-pulse'
                        : 'bg-surface-2 text-gray-600'
                  )}
                  title={GAME_TYPE_LABELS[gameType]}
                >
                  <span>{GAME_TYPE_ICONS[gameType]}</span>
                  <span className="hidden sm:inline text-[9px] font-pixel">
                    {GAME_TYPE_LABELS[gameType].slice(0, 4)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[3rem_1fr_repeat(4,3.5rem)_4rem_5rem] gap-1 px-4 py-2 border-b border-white/[0.06] text-[9px] font-bold text-gray-500 uppercase tracking-wider">
        <span>#</span>
        <span>AGENT</span>
        {ALL_GAME_TYPES.map((gameType) => (
          <span key={gameType} className="text-center" title={GAME_TYPE_LABELS[gameType]}>
            {GAME_TYPE_ICONS[gameType]}
          </span>
        ))}
        <span className="text-center">TOTAL</span>
        <span className="text-center">PROGRESS</span>
      </div>

      {/* Rows */}
      {sorted.map((standing, i) => {
        const rank = i + 1;
        return (
          <div
            key={standing.agentAddress}
            className={clsx(
              'grid grid-cols-[3rem_1fr_repeat(4,3.5rem)_4rem_5rem] gap-1 px-4 py-3 items-center transition-all duration-200 hover:bg-surface-1/50',
              i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50',
              rank <= 3 && 'border-l-2',
              rank === 1 && 'border-l-arcade-gold',
              rank === 2 && 'border-l-gray-300',
              rank === 3 && 'border-l-amber-600'
            )}
            style={rank === 1 ? { boxShadow: 'inset 0 0 20px rgba(255,215,0,0.05)' } : undefined}
          >
            <span
              className={clsx(
                'font-pixel text-xs flex items-center gap-1',
                rank === 1 ? 'neon-text-gold' : rank <= 3 ? 'text-gray-300' : 'text-gray-500'
              )}
            >
              {getRankIcon(rank)}
              {rank}
            </span>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold truncate text-white">
                {getAgentName(standing.agentAddress)}
              </span>
              {(eventDominance.get(standing.agentAddress) ?? 0) > 0 && (
                <span className="flex items-center gap-0.5 text-[8px] font-pixel text-arcade-gold bg-arcade-gold/10 px-1.5 py-0.5 rounded flex-shrink-0" style={{ boxShadow: '0 0 6px rgba(255,215,0,0.2)' }}>
                  <Star size={8} style={{ filter: 'drop-shadow(0 0 2px rgba(255,215,0,0.5))' }} />
                  {eventDominance.get(standing.agentAddress)}
                </span>
              )}
            </div>

            {ALL_GAME_TYPES.map((gameType) => {
              const eventScore = standing.eventScores[gameType];
              const hasScore = eventScore && eventScore.points > 0;
              return (
                <div
                  key={gameType}
                  className={clsx(
                    'text-center',
                    hasScore ? 'text-white' : 'text-gray-700'
                  )}
                >
                  {hasScore ? (
                    <div className="flex flex-col items-center">
                      <span className="font-mono text-sm font-bold">{eventScore.points}</span>
                      <span className="text-[8px] text-gray-500">
                        {eventScore.rank}
                        {getRankSuffix(eventScore.rank)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs">-</span>
                  )}
                </div>
              );
            })}

            <div className="text-center">
              <span
                className={clsx(
                  'font-pixel text-base',
                  rank === 1
                    ? 'neon-text-gold'
                    : rank <= 3
                      ? 'text-arcade-purple'
                      : 'text-white'
                )}
                style={rank <= 3 ? { textShadow: `0 0 6px ${rank === 1 ? 'rgba(255,215,0,0.4)' : 'rgba(168,85,247,0.3)'}` } : undefined}
              >
                {standing.totalPoints}
              </span>
            </div>

            {/* Points progress bar */}
            <div className="flex items-center">
              <div className="w-full h-2 bg-surface-0 rounded-full overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-500',
                    rank === 1 ? 'bg-arcade-gold/70' : rank <= 3 ? 'bg-arcade-purple/60' : 'bg-gray-500/40',
                  )}
                  style={{ width: `${maxPoints > 0 ? (standing.totalPoints / maxPoints) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Points legend */}
      <div className="px-4 py-2 border-t border-white/[0.06] bg-surface-3/30">
        <div className="flex items-center justify-between text-[9px] text-gray-500">
          <span className="font-pixel">POINTS BY POSITION:</span>
          <div className="flex gap-2">
            {POSITION_POINTS.slice(0, 5).map((points, i) => (
              <span key={i}>
                {i + 1}
                {getRankSuffix(i + 1)}: {points}
              </span>
            ))}
            <span>...</span>
          </div>
        </div>
      </div>
    </div>
  );
}
