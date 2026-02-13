import clsx from 'clsx';
import { RankTier } from '@/types/arena';
import { RankBadge } from './RankBadge';

interface TierProgressProps {
  currentElo: number;
  currentTier: RankTier;
  className?: string;
}

// Tier thresholds matching SeasonalRankings.sol
const TIER_THRESHOLDS = [
  { tier: RankTier.Iron, minElo: 0, maxElo: 799 },
  { tier: RankTier.Bronze, minElo: 800, maxElo: 1099 },
  { tier: RankTier.Silver, minElo: 1100, maxElo: 1399 },
  { tier: RankTier.Gold, minElo: 1400, maxElo: 1699 },
  { tier: RankTier.Platinum, minElo: 1700, maxElo: 1999 },
  { tier: RankTier.Diamond, minElo: 2000, maxElo: Infinity },
];

function getTierProgress(elo: number, tier: RankTier): number {
  const tierData = TIER_THRESHOLDS[tier];
  if (!tierData) return 0;

  // Diamond has no upper bound
  if (tier === RankTier.Diamond) {
    // Show progress based on how far above 2000
    const above2000 = elo - 2000;
    return Math.min(100, (above2000 / 500) * 100); // 500 ELO range display
  }

  const range = tierData.maxElo - tierData.minElo + 1;
  const progress = elo - tierData.minElo;
  return Math.min(100, Math.max(0, (progress / range) * 100));
}

function getNextTierThreshold(tier: RankTier): number | null {
  if (tier === RankTier.Diamond) return null;
  const nextTierData = TIER_THRESHOLDS[tier + 1];
  return nextTierData?.minElo ?? null;
}

function getPrevTierThreshold(tier: RankTier): number {
  const tierData = TIER_THRESHOLDS[tier];
  return tierData?.minElo ?? 0;
}

const tierColors: Record<RankTier, string> = {
  [RankTier.Iron]: 'bg-gray-500',
  [RankTier.Bronze]: 'bg-amber-600',
  [RankTier.Silver]: 'bg-gray-300',
  [RankTier.Gold]: 'bg-yellow-400',
  [RankTier.Platinum]: 'bg-cyan-300',
  [RankTier.Diamond]: 'bg-purple-400',
};

const TIER_NAMES: Record<RankTier, string> = {
  [RankTier.Iron]: 'Iron',
  [RankTier.Bronze]: 'Bronze',
  [RankTier.Silver]: 'Silver',
  [RankTier.Gold]: 'Gold',
  [RankTier.Platinum]: 'Platinum',
  [RankTier.Diamond]: 'Diamond',
};

export function TierProgress({ currentElo, currentTier, className }: TierProgressProps) {
  const progress = getTierProgress(currentElo, currentTier);
  const nextThreshold = getNextTierThreshold(currentTier);
  const currentThreshold = getPrevTierThreshold(currentTier);
  const eloToNext = nextThreshold ? nextThreshold - currentElo : null;

  return (
    <div className={clsx('space-y-3', className)}>
      {/* Current tier and ELO */}
      <div className="flex items-center justify-between">
        <RankBadge tier={currentTier} size="md" />
        <span className="font-mono text-lg font-bold text-white">{currentElo}</span>
      </div>

      {/* Progress bar */}
      <div className="relative">
        <div className="h-2 bg-surface-1 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              tierColors[currentTier],
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Threshold markers */}
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-gray-500 font-mono">{currentThreshold}</span>
          {nextThreshold && (
            <span className="text-[10px] text-gray-500 font-mono">{nextThreshold}</span>
          )}
        </div>
      </div>

      {/* ELO to next tier */}
      {eloToNext !== null && eloToNext > 0 && (
        <div className="text-center">
          <span className="text-xs text-gray-400">
            <span className="text-arcade-cyan font-bold">{eloToNext}</span> ELO to{' '}
            <RankBadge tier={currentTier + 1} size="sm" />
          </span>
        </div>
      )}

      {/* Tier ladder — all tiers with current marker */}
      <div className="flex items-center gap-0.5">
        {TIER_THRESHOLDS.map((td, i) => {
          const isCurrent = i === currentTier;
          const isPast = i < currentTier;
          return (
            <div
              key={td.tier}
              className={clsx(
                'flex-1 h-1.5 rounded-full transition-all duration-500',
                isCurrent ? tierColors[td.tier] :
                isPast ? `${tierColors[td.tier]} opacity-40` :
                'bg-surface-0'
              )}
              title={`${TIER_NAMES[td.tier]}: ${td.minElo}${td.maxElo === Infinity ? '+' : `–${td.maxElo}`}`}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        {TIER_THRESHOLDS.map((td, i) => (
          <span
            key={td.tier}
            className={clsx(
              'text-[7px] font-pixel',
              i === currentTier ? 'text-white' :
              i < currentTier ? 'text-gray-500' : 'text-gray-700'
            )}
          >
            {TIER_NAMES[td.tier].slice(0, 3).toUpperCase()}
          </span>
        ))}
      </div>

      {/* At max tier */}
      {currentTier === RankTier.Diamond && (
        <div className="text-center">
          <span className="text-xs text-purple-300 font-semibold">Max Tier Achieved!</span>
        </div>
      )}
    </div>
  );
}
