// Compact number formatter: 1500 → "1.5K", 1500000 → "1.5M"
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2);
}

// Re-export timeAgo for convenience
export { timeAgo } from '@/components/activity/timeAgo';
