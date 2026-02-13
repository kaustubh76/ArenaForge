import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useSeasonStore } from '@/stores/seasonStore';
import { RankBadge } from './RankBadge';
import { TierProgress } from './TierProgress';

interface SeasonBannerProps {
  compact?: boolean;
  className?: string;
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Ended';

  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function SeasonBanner({ compact = false, className }: SeasonBannerProps) {
  const { currentSeason, mySeasonalProfile, getTimeRemaining, fetchSeason, loading } = useSeasonStore();
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Fetch season data on mount
  useEffect(() => {
    fetchSeason();
  }, [fetchSeason]);

  // Update countdown every minute
  useEffect(() => {
    const updateTime = () => setTimeRemaining(getTimeRemaining());
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [getTimeRemaining, currentSeason]);

  if (loading) {
    return (
      <div className={clsx('animate-pulse bg-surface-1 rounded-xl', compact ? 'h-16' : 'h-32', className)} />
    );
  }

  if (!currentSeason) {
    return (
      <div
        className={clsx(
          'bg-surface-1 border border-gray-700 rounded-xl p-4 text-center',
          className,
        )}
      >
        <span className="text-gray-400">No active season</span>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={clsx(
          'bg-gradient-to-r from-arcade-purple/20 to-arcade-cyan/20 border border-arcade-purple/30 rounded-xl px-4 py-3',
          className,
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-arcade-gold font-bold">SEASON {currentSeason.id}</span>
            {mySeasonalProfile && (
              <RankBadge tier={mySeasonalProfile.tier} size="sm" />
            )}
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-400">Ends in</span>
            <span className="ml-2 font-mono text-arcade-cyan font-bold">
              {formatTimeRemaining(timeRemaining)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'relative overflow-hidden bg-gradient-to-br from-arcade-purple/20 via-surface-1 to-arcade-cyan/20',
        'border border-arcade-purple/30 rounded-xl',
        className,
      )}
    >
      {/* Decorative background */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-32 h-32 bg-arcade-purple rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-32 h-32 bg-arcade-cyan rounded-full blur-3xl" />
      </div>

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-wider">
              <span className="text-arcade-gold">SEASON</span>{' '}
              <span className="text-white">{currentSeason.id}</span>
            </h2>
            <p className="text-sm text-gray-400 mt-1">
              {currentSeason.active ? 'Currently Active' : 'Season Ended'}
            </p>
          </div>

          {/* Countdown */}
          <div className="text-right">
            <div className="text-xs text-gray-400 uppercase tracking-wider">Time Remaining</div>
            <div className="font-mono text-2xl font-bold text-arcade-cyan">
              {formatTimeRemaining(timeRemaining)}
            </div>
          </div>
        </div>

        {/* User's progress */}
        {mySeasonalProfile ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TierProgress
              currentElo={mySeasonalProfile.seasonalElo}
              currentTier={mySeasonalProfile.tier}
            />

            <div className="space-y-3">
              {/* Win Rate Ring + Stats */}
              <div className="flex items-center gap-4">
                {/* SVG Win Rate Donut */}
                {(() => {
                  const wr = mySeasonalProfile.matchesPlayed > 0
                    ? (mySeasonalProfile.wins / mySeasonalProfile.matchesPlayed) * 100 : 0;
                  const r = 26;
                  const circ = 2 * Math.PI * r;
                  const offset = circ * (1 - wr / 100);
                  return (
                    <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
                      <svg width="64" height="64" className="transform -rotate-90">
                        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                        <circle
                          cx="32" cy="32" r={r}
                          fill="none"
                          stroke={wr >= 60 ? '#69f0ae' : wr >= 40 ? '#ffd740' : '#ff5252'}
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeDasharray={circ}
                          strokeDashoffset={offset}
                          className="transition-all duration-700"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={clsx(
                          'text-xs font-mono font-bold',
                          wr >= 60 ? 'text-arcade-green' : wr >= 40 ? 'text-arcade-gold' : 'text-arcade-red'
                        )}>
                          {wr.toFixed(0)}%
                        </span>
                        <span className="text-[7px] text-gray-500">WIN</span>
                      </div>
                    </div>
                  );
                })()}
                <div className="grid grid-cols-3 gap-4 flex-1">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-arcade-green">
                      {mySeasonalProfile.wins}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">Wins</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-arcade-red">
                      {mySeasonalProfile.losses}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">Losses</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">
                      {mySeasonalProfile.matchesPlayed}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase">Matches</div>
                  </div>
                </div>
              </div>

              {/* Placement status */}
              {!mySeasonalProfile.placementComplete && (
                <div className="bg-surface-2 rounded-lg p-3 text-center">
                  <div className="text-xs text-gray-400">Placement Progress</div>
                  <div className="flex items-center justify-center gap-1 mt-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className={clsx(
                          'w-3 h-3 rounded-full transition-colors',
                          i < mySeasonalProfile.placementMatches
                            ? 'bg-arcade-purple'
                            : 'bg-surface-1',
                        )}
                      />
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {mySeasonalProfile.placementMatches} / 5 matches
                  </div>
                </div>
              )}

              {/* Peak ELO with sparkline */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Peak ELO</span>
                <div className="flex items-center gap-2">
                  {/* Mini ELO progress bar (current vs peak) */}
                  {(() => {
                    const curr = mySeasonalProfile.seasonalElo;
                    const peak = mySeasonalProfile.peakElo;
                    const baseline = 1000;
                    const pct = peak > baseline ? ((curr - baseline) / (peak - baseline)) * 100 : 100;
                    const isAtPeak = curr >= peak;
                    return (
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-surface-0 rounded-full overflow-hidden">
                          <div
                            className={clsx(
                              'h-full rounded-full transition-all duration-500',
                              isAtPeak ? 'bg-arcade-gold/80' : 'bg-arcade-cyan/60'
                            )}
                            style={{ width: `${Math.max(5, Math.min(100, pct))}%` }}
                          />
                        </div>
                        {isAtPeak && (
                          <span className="text-[7px] font-pixel text-arcade-gold">PEAK</span>
                        )}
                      </div>
                    );
                  })()}
                  <span className="font-mono font-bold text-arcade-gold">
                    {mySeasonalProfile.peakElo}
                  </span>
                </div>
              </div>

              {/* Current ELO */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Current ELO</span>
                <span className={clsx(
                  'font-mono font-bold',
                  mySeasonalProfile.seasonalElo >= mySeasonalProfile.peakElo ? 'text-arcade-green' :
                  mySeasonalProfile.seasonalElo >= 1200 ? 'text-arcade-cyan' : 'text-gray-300'
                )}>
                  {mySeasonalProfile.seasonalElo}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-400">Play a match to join this season!</p>
          </div>
        )}

        {/* Prize pool */}
        {parseFloat(currentSeason.totalPrizePool) > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-700/50">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Season Prize Pool</span>
              <span className="font-mono text-lg font-bold text-arcade-gold">
                {currentSeason.totalPrizePool} ETH
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
