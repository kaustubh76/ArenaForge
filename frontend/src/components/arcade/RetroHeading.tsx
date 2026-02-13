import clsx from 'clsx';

interface RetroHeadingProps {
  level?: 1 | 2 | 3 | 4;
  color?: 'purple' | 'cyan' | 'pink' | 'green' | 'gold' | 'white';
  glow?: boolean;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}

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
      >
        {children}
      </Tag>
      {subtitle && (
        <p className="mt-2 text-sm text-gray-400 font-sans">{subtitle}</p>
      )}
    </div>
  );
}
