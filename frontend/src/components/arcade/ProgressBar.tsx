import clsx from 'clsx';

type BarColor = 'purple' | 'cyan' | 'pink' | 'green' | 'gold' | 'red';

interface ProgressBarProps {
  value: number;
  color?: BarColor;
  label?: string;
  animated?: boolean;
  className?: string;
}

const barClasses: Record<BarColor, string> = {
  purple: 'bg-arcade-purple',
  cyan: 'bg-arcade-cyan',
  pink: 'bg-arcade-pink',
  green: 'bg-arcade-green',
  gold: 'bg-arcade-gold',
  red: 'bg-arcade-red',
};

const glowShadows: Record<BarColor, string> = {
  purple: '0 0 8px rgba(168,85,247,0.4)',
  cyan: '0 0 8px rgba(34,211,238,0.4)',
  pink: '0 0 8px rgba(236,72,153,0.4)',
  green: '0 0 8px rgba(74,222,128,0.4)',
  gold: '0 0 8px rgba(255,215,0,0.4)',
  red: '0 0 8px rgba(239,68,68,0.4)',
};

export function ProgressBar({ value, color = 'purple', label, animated = true, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const isComplete = clamped >= 100;

  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-400">{label}</span>
          <span className={clsx(
            'text-xs font-mono',
            isComplete ? 'text-arcade-green font-bold' : 'text-gray-300',
          )}>
            {clamped.toFixed(0)}%
          </span>
        </div>
      )}
      <div className="relative h-1.5 bg-surface-1 rounded-full overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full transition-all',
            barClasses[color],
            animated ? 'duration-1000 ease-out' : 'duration-0',
          )}
          style={{
            width: `${clamped}%`,
            boxShadow: clamped > 50 ? glowShadows[color] : 'none',
          }}
        />
        {/* Quarter milestone markers */}
        {[25, 50, 75].map(m => (
          <div
            key={m}
            className={clsx(
              'absolute top-0 bottom-0 w-px',
              clamped >= m ? 'bg-white/15' : 'bg-white/5',
            )}
            style={{ left: `${m}%` }}
          />
        ))}
      </div>
    </div>
  );
}
