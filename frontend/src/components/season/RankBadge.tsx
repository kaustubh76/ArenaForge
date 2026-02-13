import clsx from 'clsx';
import { RankTier } from '@/types/arena';

interface RankBadgeProps {
  tier: RankTier;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

const tierConfig: Record<RankTier, { name: string; color: string; bgColor: string; borderColor: string; icon: string; glow: string }> = {
  [RankTier.Iron]: {
    name: 'Iron',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/20',
    borderColor: 'border-gray-500/40',
    icon: '🪨',
    glow: '',
  },
  [RankTier.Bronze]: {
    name: 'Bronze',
    color: 'text-amber-600',
    bgColor: 'bg-amber-700/20',
    borderColor: 'border-amber-600/40',
    icon: '🥉',
    glow: '',
  },
  [RankTier.Silver]: {
    name: 'Silver',
    color: 'text-gray-300',
    bgColor: 'bg-gray-300/20',
    borderColor: 'border-gray-300/40',
    icon: '🥈',
    glow: '',
  },
  [RankTier.Gold]: {
    name: 'Gold',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/20',
    borderColor: 'border-yellow-400/40',
    icon: '🥇',
    glow: '0 0 8px rgba(250,204,21,0.2)',
  },
  [RankTier.Platinum]: {
    name: 'Platinum',
    color: 'text-cyan-300',
    bgColor: 'bg-cyan-400/20',
    borderColor: 'border-cyan-300/40',
    icon: '💎',
    glow: '0 0 10px rgba(103,232,249,0.3)',
  },
  [RankTier.Diamond]: {
    name: 'Diamond',
    color: 'text-purple-300',
    bgColor: 'bg-purple-400/20',
    borderColor: 'border-purple-300/40',
    icon: '👑',
    glow: '0 0 12px rgba(192,132,252,0.4), 0 0 24px rgba(192,132,252,0.15)',
  },
};

const sizeConfig = {
  sm: {
    badge: 'px-2 py-0.5 text-[10px]',
    icon: 'text-xs',
  },
  md: {
    badge: 'px-3 py-1 text-xs',
    icon: 'text-sm',
  },
  lg: {
    badge: 'px-4 py-2 text-sm',
    icon: 'text-base',
  },
};

export function RankBadge({ tier, size = 'md', showLabel = true, className }: RankBadgeProps) {
  const config = tierConfig[tier];
  const sizeStyles = sizeConfig[size];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full font-bold tracking-wider uppercase border transition-shadow',
        config.bgColor,
        config.borderColor,
        config.color,
        sizeStyles.badge,
        tier === RankTier.Diamond && 'animate-pulse',
        className,
      )}
      style={config.glow ? { boxShadow: config.glow } : undefined}
    >
      <span className={sizeStyles.icon}>{config.icon}</span>
      {showLabel && <span>{config.name}</span>}
    </span>
  );
}

export function getTierName(tier: RankTier): string {
  return tierConfig[tier]?.name ?? 'Unknown';
}

export function getTierColor(tier: RankTier): string {
  return tierConfig[tier]?.color ?? 'text-gray-400';
}
