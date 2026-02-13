import clsx from 'clsx';

type BadgeColor = 'purple' | 'cyan' | 'pink' | 'green' | 'gold' | 'red' | 'orange';

type BadgeSize = 'sm' | 'md' | 'lg';

interface GlowBadgeProps {
  color: BadgeColor;
  label: string;
  pulsing?: boolean;
  size?: BadgeSize;
  className?: string;
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[8px] gap-1',
  md: 'px-2.5 py-1 text-[10px] gap-1.5',
  lg: 'px-3 py-1.5 text-[11px] gap-2',
};

const glowShadows: Record<BadgeColor, string> = {
  purple: '0 0 6px rgba(168,85,247,0.3)',
  cyan: '0 0 6px rgba(6,182,212,0.3)',
  pink: '0 0 6px rgba(236,72,153,0.3)',
  green: '0 0 6px rgba(34,197,94,0.3)',
  gold: '0 0 6px rgba(234,179,8,0.3)',
  red: '0 0 6px rgba(239,68,68,0.3)',
  orange: '0 0 6px rgba(249,115,22,0.3)',
};

const colorMap: Record<BadgeColor, string> = {
  purple: 'bg-arcade-purple/15 text-arcade-purple border-arcade-purple/30',
  cyan: 'bg-arcade-cyan/15 text-arcade-cyan border-arcade-cyan/30',
  pink: 'bg-arcade-pink/15 text-arcade-pink border-arcade-pink/30',
  green: 'bg-arcade-green/15 text-arcade-green border-arcade-green/30',
  gold: 'bg-arcade-gold/15 text-arcade-gold border-arcade-gold/30',
  red: 'bg-arcade-red/15 text-arcade-red border-arcade-red/30',
  orange: 'bg-arcade-orange/15 text-arcade-orange border-arcade-orange/30',
};

export function GlowBadge({ color, label, pulsing = false, size = 'md', className }: GlowBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-bold tracking-wider uppercase border',
        'relative overflow-hidden group transition-shadow duration-200',
        'hover:brightness-110',
        sizeClasses[size],
        colorMap[color],
        pulsing && 'animate-pulse-soft',
        className,
      )}
      style={{ boxShadow: pulsing ? glowShadows[color] : undefined }}
    >
      {/* Hover shine sweep */}
      <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
      {pulsing && (
        <span className={clsx(
          'w-1.5 h-1.5 rounded-full',
          color === 'green' ? 'bg-arcade-green' : color === 'red' ? 'bg-arcade-red' : 'bg-current',
          'animate-pulse',
        )} />
      )}
      {label}
    </span>
  );
}
