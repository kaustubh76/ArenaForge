import clsx from 'clsx';
import { useCountdown } from '@/hooks/useCountdown';
import { COUNTDOWN_WARNING_THRESHOLD } from '@/constants/ui';

interface CountdownTimerProps {
  targetTime: number;
  className?: string;
  compact?: boolean;
  /** Total duration in seconds for progress ring calculation */
  totalDuration?: number;
}

function DigitBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-surface-1 border border-white/[0.08] rounded px-2 py-1 min-w-[2.5rem] text-center">
        <span className="font-mono text-lg font-bold text-white">{value}</span>
      </div>
      <span className="text-[8px] text-gray-500 mt-0.5 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export function CountdownTimer({ targetTime, className, compact = false, totalDuration }: CountdownTimerProps) {
  const { hours, minutes, seconds, isExpired, totalSeconds } = useCountdown(targetTime);
  const isWarning = totalSeconds > 0 && totalSeconds <= COUNTDOWN_WARNING_THRESHOLD;

  // Progress ring calculation
  const progressPct = totalDuration && totalDuration > 0 ? Math.max(0, Math.min(1, totalSeconds / totalDuration)) : null;
  const ringRadius = 28;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = progressPct !== null ? ringCircumference * (1 - progressPct) : 0;

  if (isExpired) {
    return (
      <span className={clsx('font-pixel text-xs text-arcade-red animate-neon-flicker', className)}>
        EXPIRED
      </span>
    );
  }

  if (compact) {
    return (
      <span
        className={clsx(
          'font-mono text-sm font-bold',
          isWarning ? 'text-arcade-red animate-pulse' : 'text-arcade-cyan',
          className,
        )}
        style={{ textShadow: isWarning ? '0 0 6px rgba(255,82,82,0.3)' : '0 0 6px rgba(0,229,255,0.3)' }}
      >
        {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </span>
    );
  }

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-2',
        isWarning && 'animate-pulse',
        className,
      )}
    >
      {/* Progress ring (when totalDuration is provided) */}
      {progressPct !== null && (
        <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
          <svg width="64" height="64" className="transform -rotate-90">
            <circle cx="32" cy="32" r={ringRadius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
            <circle
              cx="32" cy="32" r={ringRadius}
              fill="none"
              stroke={isWarning ? '#ff5252' : '#00e5ff'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringOffset}
              className="transition-all duration-1000"
              style={{ filter: `drop-shadow(0 0 3px ${isWarning ? 'rgba(255,82,82,0.4)' : 'rgba(0,229,255,0.4)'})` }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={clsx(
              'text-[10px] font-mono font-bold',
              isWarning ? 'text-arcade-red' : 'text-arcade-cyan',
            )}>
              {Math.round(progressPct * 100)}%
            </span>
          </div>
        </div>
      )}
      <div className="inline-flex items-center gap-1.5">
        {hours > 0 && <DigitBox value={String(hours).padStart(2, '0')} label="HRS" />}
        <span className="text-gray-500 font-bold mt-[-12px]">:</span>
        <DigitBox value={String(minutes).padStart(2, '0')} label="MIN" />
        <span className="text-gray-500 font-bold mt-[-12px]">:</span>
        <DigitBox value={String(seconds).padStart(2, '0')} label="SEC" />
      </div>
    </div>
  );
}
