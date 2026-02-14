import clsx from 'clsx';

type NeonColor = 'purple' | 'cyan' | 'pink' | 'green';
type ButtonVariant = 'neon' | 'insert-coin' | 'primary' | 'secondary';

const colorGlow: Record<NeonColor, string> = {
  purple: '0 0 12px rgba(168,85,247,0.25)',
  cyan: '0 0 12px rgba(0,229,255,0.25)',
  pink: '0 0 12px rgba(236,72,153,0.25)',
  green: '0 0 12px rgba(105,240,174,0.25)',
};

interface NeonButtonProps {
  variant?: ButtonVariant;
  color?: NeonColor;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: '',
  lg: 'px-7 py-3 text-base',
};

export function NeonButton({
  variant = 'neon',
  color = 'purple',
  size = 'md',
  disabled = false,
  className,
  children,
  onClick,
}: NeonButtonProps) {
  const baseClass = variant === 'insert-coin'
    ? 'btn-insert-coin'
    : variant === 'primary'
      ? 'btn-primary'
      : variant === 'secondary'
        ? 'btn-secondary'
        : `btn-neon btn-neon-${color}`;

  return (
    <button
      className={clsx(
        baseClass,
        size !== 'md' && sizeClasses[size],
        disabled && 'opacity-40 pointer-events-none',
        'relative overflow-hidden group',
        'hover:scale-[1.03] active:scale-[0.97] transition-all duration-100',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      style={!disabled && variant === 'neon' ? { boxShadow: colorGlow[color] } : undefined}
    >
      {/* Hover shine sweep */}
      {!disabled && (
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
      )}
      {children}
    </button>
  );
}
