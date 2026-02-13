import clsx from 'clsx';

type BadgeColor = 'purple' | 'cyan' | 'pink' | 'green' | 'gold' | 'red' | 'orange';

interface GlowBadgeProps {
  color: BadgeColor;
  label: string;
  pulsing?: boolean;
  className?: string;
}

const colorMap: Record<BadgeColor, string> = {
  purple: 'bg-arcade-purple/15 text-arcade-purple border-arcade-purple/30',
  cyan: 'bg-arcade-cyan/15 text-arcade-cyan border-arcade-cyan/30',
  pink: 'bg-arcade-pink/15 text-arcade-pink border-arcade-pink/30',
  green: 'bg-arcade-green/15 text-arcade-green border-arcade-green/30',
  gold: 'bg-arcade-gold/15 text-arcade-gold border-arcade-gold/30',
  red: 'bg-arcade-red/15 text-arcade-red border-arcade-red/30',
  orange: 'bg-arcade-orange/15 text-arcade-orange border-arcade-orange/30',
};

export function GlowBadge({ color, label, pulsing = false, className }: GlowBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border',
        colorMap[color],
        pulsing && 'animate-pulse-soft',
        className,
      )}
    >
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
