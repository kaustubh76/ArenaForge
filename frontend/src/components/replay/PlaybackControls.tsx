import clsx from 'clsx';
import { useReplayStore } from '@/stores/replayStore';

interface PlaybackControlsProps {
  className?: string;
}

const SPEED_OPTIONS = [0.5, 1, 2];

export function PlaybackControls({ className }: PlaybackControlsProps) {
  const {
    isPlaying,
    playbackSpeed,
    togglePlayback,
    setSpeed,
    prevRound,
    nextRound,
    goToStart,
    goToEnd,
    isAtStart,
    isAtEnd,
    currentReplay,
    getProgress,
  } = useReplayStore();

  if (!currentReplay) return null;

  const progress = getProgress();
  const r = 28;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - progress / 100);

  return (
    <div className={clsx('flex items-center justify-center gap-4', className)}>
      {/* Go to start */}
      <button
        onClick={goToStart}
        disabled={isAtStart()}
        className={clsx(
          'p-2 rounded-lg transition-colors',
          isAtStart()
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:text-white hover:bg-surface-2',
        )}
        aria-label="Go to start"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      </button>

      {/* Previous round */}
      <button
        onClick={prevRound}
        disabled={isAtStart()}
        className={clsx(
          'p-2 rounded-lg transition-colors',
          isAtStart()
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:text-white hover:bg-surface-2',
        )}
        aria-label="Previous round"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Play/Pause with progress ring */}
      <div className="relative">
        <svg width="64" height="64" className="absolute inset-0 -rotate-90 pointer-events-none">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle
            cx="32" cy="32" r={r}
            fill="none"
            stroke="#a855f7"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="transition-all duration-200"
            opacity="0.7"
            style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }}
          />
        </svg>
        <button
          onClick={togglePlayback}
          className={clsx(
            'relative p-4 rounded-full transition-all',
            'bg-arcade-purple text-white hover:bg-arcade-purple/80',
            'shadow-lg shadow-arcade-purple/30',
          )}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      {/* Next round */}
      <button
        onClick={nextRound}
        disabled={isAtEnd()}
        className={clsx(
          'p-2 rounded-lg transition-colors',
          isAtEnd()
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:text-white hover:bg-surface-2',
        )}
        aria-label="Next round"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Go to end */}
      <button
        onClick={goToEnd}
        disabled={isAtEnd()}
        className={clsx(
          'p-2 rounded-lg transition-colors',
          isAtEnd()
            ? 'text-gray-600 cursor-not-allowed'
            : 'text-gray-400 hover:text-white hover:bg-surface-2',
        )}
        aria-label="Go to end"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </button>

      {/* Speed control with visual indicator */}
      <div className="ml-4 flex items-center gap-2">
        <div className="flex items-center gap-1 bg-surface-1 rounded-lg p-1">
          {SPEED_OPTIONS.map(speed => (
            <button
              key={speed}
              onClick={() => setSpeed(speed)}
              className={clsx(
                'px-2 py-1 rounded text-xs font-bold transition-all',
                playbackSpeed === speed
                  ? 'bg-arcade-purple text-white shadow-sm shadow-arcade-purple/40 scale-105'
                  : 'text-gray-400 hover:text-white hover:scale-105',
              )}
            >
              {speed}x
            </button>
          ))}
        </div>
        {/* Speed intensity dots */}
        <div className="flex items-center gap-0.5">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className={clsx(
                'rounded-full transition-all duration-300',
                i <= (playbackSpeed <= 0.5 ? 1 : playbackSpeed <= 1 ? 2 : 3)
                  ? 'bg-arcade-purple' : 'bg-gray-700',
                isPlaying && i <= (playbackSpeed <= 0.5 ? 1 : playbackSpeed <= 1 ? 2 : 3)
                  && 'animate-pulse',
              )}
              style={{ width: 4, height: 4 + i * 2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
