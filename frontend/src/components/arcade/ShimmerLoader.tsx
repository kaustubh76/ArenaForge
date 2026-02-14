import clsx from 'clsx';

interface ShimmerLoaderProps {
  className?: string;
  /** Shape variant */
  variant?: 'line' | 'circle' | 'card';
  /** Width — accepts Tailwind classes like 'w-full', 'w-2/3' */
  width?: string;
  /** Height — accepts Tailwind classes like 'h-4', 'h-8' */
  height?: string;
}

/**
 * Arcade-themed shimmer skeleton loader.
 * Uses the `shimmer` animation from tailwind.config.js.
 */
export function ShimmerLoader({
  className,
  variant = 'line',
  width = 'w-full',
  height = 'h-4',
}: ShimmerLoaderProps) {
  return (
    <div
      className={clsx(
        'animate-shimmer bg-[length:200%_100%]',
        variant === 'circle' ? 'rounded-full' : 'rounded',
        variant === 'card' ? 'rounded-lg' : '',
        width,
        height,
        className,
      )}
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 100%)',
      }}
    />
  );
}

/**
 * Pre-built skeleton card matching the TournamentCard layout.
 */
export function SkeletonTournamentCard() {
  return (
    <div className="arcade-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <ShimmerLoader width="w-20" height="h-5" />
        <ShimmerLoader width="w-12" height="h-4" />
      </div>
      <ShimmerLoader width="w-2/3" height="h-3" />
      <ShimmerLoader width="w-1/3" height="h-3" />
      <div className="space-y-2 pt-2">
        <ShimmerLoader width="w-full" height="h-3" />
        <ShimmerLoader width="w-4/5" height="h-2" />
      </div>
      <div className="flex justify-between pt-3 border-t border-white/[0.04]">
        <ShimmerLoader width="w-16" height="h-3" />
        <ShimmerLoader width="w-12" height="h-3" />
      </div>
      <ShimmerLoader width="w-full" height="h-8" variant="card" />
    </div>
  );
}

/**
 * Skeleton row for leaderboard / table lists.
 */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04]">
      <ShimmerLoader variant="circle" width="w-6" height="h-6" />
      <ShimmerLoader width="w-8" height="h-8" variant="circle" />
      <div className="flex-1 space-y-1.5">
        <ShimmerLoader width="w-28" height="h-3" />
        <ShimmerLoader width="w-16" height="h-2" />
      </div>
      <ShimmerLoader width="w-14" height="h-4" />
      <ShimmerLoader width="w-10" height="h-3" />
    </div>
  );
}

/**
 * Skeleton stat card for dashboard widgets.
 */
export function SkeletonStatCard() {
  return (
    <div className="arcade-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <ShimmerLoader variant="circle" width="w-5" height="h-5" />
        <ShimmerLoader width="w-16" height="h-2" />
      </div>
      <ShimmerLoader width="w-20" height="h-6" />
    </div>
  );
}
