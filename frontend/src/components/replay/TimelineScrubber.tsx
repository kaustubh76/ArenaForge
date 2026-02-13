import { useRef, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import { useReplayStore } from '@/stores/replayStore';

interface TimelineScrubberProps {
  className?: string;
}

export function TimelineScrubber({ className }: TimelineScrubberProps) {
  const {
    currentReplay,
    currentRoundIndex,
    seekToRound,
    getProgress,
    isPlaying,
  } = useReplayStore();

  const trackRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current || !currentReplay) return;

      const rect = trackRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      const targetRound = Math.round(percentage * (currentReplay.rounds.length - 1));
      seekToRound(targetRound);
    },
    [currentReplay, seekToRound],
  );

  if (!currentReplay) return null;

  const totalRounds = currentReplay.rounds.length;
  const progress = getProgress();

  // Score momentum curve: cumulative score differential P1 - P2
  const momentumPath = useMemo(() => {
    if (totalRounds < 2) return '';
    let cumDiff = 0;
    const diffs = currentReplay.rounds.map(r => {
      cumDiff += (r.player1Score - r.player2Score);
      return cumDiff;
    });
    const maxAbs = Math.max(1, ...diffs.map(Math.abs));
    const w = 100; // percentage width
    const h = 16;
    const mid = h / 2;
    return diffs.map((d, i) => {
      const x = (i / (totalRounds - 1)) * w;
      const y = mid - (d / maxAbs) * (mid - 1);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [currentReplay.rounds, totalRounds]);

  return (
    <div className={clsx('space-y-2', className)}>
      {/* Round indicator with momentum */}
      <div className="flex justify-between items-center text-xs text-gray-400">
        <span>Round {currentRoundIndex + 1}</span>
        {/* Mini momentum curve */}
        {momentumPath && totalRounds >= 3 && (
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-gray-600">momentum</span>
            <svg width="60" height="16" className="overflow-visible">
              <line x1="0" y1="8" x2="60" y2="8" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
              <path
                d={momentumPath.replace(/(\d+\.?\d*),/g, (_, x) => `${(parseFloat(x) / 100 * 60).toFixed(1)},`)}
                fill="none"
                stroke="url(#momentumGrad)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="momentumGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="100%" stopColor="#ec4899" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        )}
        <span>{totalRounds} Total</span>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        onClick={handleClick}
        className="relative h-8 bg-surface-1 rounded-lg cursor-pointer group"
      >
        {/* Progress fill */}
        <div
          className={clsx(
            'absolute left-0 top-0 h-full rounded-lg transition-all',
            isPlaying ? 'duration-100' : 'duration-300',
            'bg-gradient-to-r from-arcade-purple to-arcade-cyan',
          )}
          style={{ width: `${progress}%` }}
        />

        {/* Round markers — color-coded by outcome */}
        <div className="absolute inset-0 flex items-center justify-between px-1">
          {currentReplay.rounds.map((round, index) => {
            const p1Won = round.player1Score > round.player2Score;
            const p2Won = round.player2Score > round.player1Score;
            const isPast = index <= currentRoundIndex;
            return (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  seekToRound(index);
                }}
                className={clsx(
                  'w-2 h-2 rounded-full transition-all',
                  isPast
                    ? p1Won ? 'bg-arcade-cyan' : p2Won ? 'bg-arcade-pink' : 'bg-white'
                    : 'bg-gray-600 hover:bg-gray-500',
                  index === currentRoundIndex && 'scale-150 shadow-lg shadow-white/30',
                )}
                title={`Round ${index + 1}: ${round.player1Score}–${round.player2Score}`}
              />
            );
          })}
        </div>

        {/* Playhead */}
        <div
          className={clsx(
            'absolute top-0 bottom-0 w-1 bg-white rounded-full shadow-lg',
            'transition-all',
            isPlaying ? 'duration-100' : 'duration-300',
          )}
          style={{ left: `calc(${progress}% - 2px)` }}
        >
          {/* Playhead handle */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-md group-hover:scale-110 transition-transform" />
        </div>
      </div>

      {/* Round labels */}
      {totalRounds <= 10 && (
        <div className="flex justify-between px-1">
          {currentReplay.rounds.map((_, index) => (
            <span
              key={index}
              className={clsx(
                'text-[10px] font-mono',
                index === currentRoundIndex ? 'text-white' : 'text-gray-500',
              )}
            >
              {index + 1}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
