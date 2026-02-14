import clsx from 'clsx';

interface RetroHeadingProps {
  level?: 1 | 2 | 3 | 4;
  color?: 'purple' | 'cyan' | 'pink' | 'green' | 'gold' | 'white';
  glow?: boolean;
  cursor?: boolean;
  accent?: boolean;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}

const glowShadow: Record<string, string> = {
  purple: '0 0 10px rgba(168,85,247,0.3)',
  cyan: '0 0 10px rgba(0,229,255,0.3)',
  pink: '0 0 10px rgba(236,72,153,0.3)',
  green: '0 0 10px rgba(105,240,174,0.3)',
  gold: '0 0 10px rgba(255,215,0,0.3)',
  white: '0 0 10px rgba(255,255,255,0.15)',
};

const accentGradients: Record<string, string> = {
  purple: 'from-arcade-purple/60 via-arcade-purple/20 to-transparent',
  cyan: 'from-arcade-cyan/60 via-arcade-cyan/20 to-transparent',
  pink: 'from-arcade-pink/60 via-arcade-pink/20 to-transparent',
  green: 'from-arcade-green/60 via-arcade-green/20 to-transparent',
  gold: 'from-arcade-gold/60 via-arcade-gold/20 to-transparent',
  white: 'from-white/40 via-white/10 to-transparent',
};

const sizeMap = {
  1: 'text-lg sm:text-xl',
  2: 'text-sm sm:text-base',
  3: 'text-xs sm:text-sm',
  4: 'text-[10px] sm:text-xs',
};

const neonMap = {
  purple: 'neon-text-purple',
  cyan: 'neon-text-cyan',
  pink: 'neon-text-pink',
  green: 'neon-text-green',
  gold: 'neon-text-gold',
  white: 'text-white',
};

const textMap = {
  purple: 'text-arcade-purple',
  cyan: 'text-arcade-cyan',
  pink: 'text-arcade-pink',
  green: 'text-arcade-green',
  gold: 'text-arcade-gold',
  white: 'text-white',
};

export function RetroHeading({
  level = 1,
  color = 'purple',
  glow = true,
  cursor = false,
  accent = false,
  subtitle,
  className,
  children,
}: RetroHeadingProps) {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;

  return (
    <div className={clsx('mb-6', className)}>
      <Tag
        className={clsx(
          'font-pixel leading-relaxed tracking-wide',
          sizeMap[level],
          glow ? neonMap[color] : textMap[color],
        )}
        style={glow ? { textShadow: glowShadow[color] } : undefined}
      >
        {children}
        {cursor && (
          <span className="inline-block w-[0.6em] h-[1em] ml-1 align-middle animate-type-cursor border-r-2 border-current" />
        )}
      </Tag>
      {accent && (
        <div className={clsx('mt-2 h-px w-16 bg-gradient-to-r rounded-full', accentGradients[color])} style={{ boxShadow: glowShadow[color] }} />
      )}
      {subtitle && (
        <p className={clsx('text-sm text-gray-400 font-sans', accent ? 'mt-2' : 'mt-2')}>{subtitle}</p>
      )}
    </div>
  );
}
