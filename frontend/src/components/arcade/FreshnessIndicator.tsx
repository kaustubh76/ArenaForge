import { useState, useEffect } from 'react';
import clsx from 'clsx';

interface FreshnessIndicatorProps {
  lastUpdated: number | null; // timestamp in ms
  className?: string;
}

/**
 * Shows how fresh data is with a pulsing dot and "Updated Xs ago" label.
 * Green = fresh (<60s), Gold = aging (1-5m), Gray = stale (>5m).
 */
export function FreshnessIndicator({ lastUpdated, className }: FreshnessIndicatorProps) {
  const [, setTick] = useState(0);

  // Re-render every 10s to keep the label current
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  if (!lastUpdated) return null;

  const age = Date.now() - lastUpdated;
  const seconds = Math.floor(age / 1000);

  let label: string;
  if (seconds < 5) label = 'just now';
  else if (seconds < 60) label = `${seconds}s ago`;
  else if (seconds < 3600) label = `${Math.floor(seconds / 60)}m ago`;
  else label = `${Math.floor(seconds / 3600)}h ago`;

  const isFresh = age < 60_000;
  const isAging = age >= 60_000 && age < 300_000;

  return (
    <div className={clsx('flex items-center gap-1.5', className)} title={`Last updated: ${new Date(lastUpdated).toLocaleTimeString()}`}>
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          isFresh && 'bg-arcade-green animate-pulse',
          isAging && 'bg-arcade-gold',
          !isFresh && !isAging && 'bg-gray-500',
        )}
      />
      <span className="text-[9px] font-mono text-gray-500">
        Updated {label}
      </span>
    </div>
  );
}
