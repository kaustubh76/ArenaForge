import clsx from 'clsx';

type NeonColor = 'purple' | 'cyan' | 'pink' | 'green';
type ButtonVariant = 'neon' | 'insert-coin' | 'primary' | 'secondary';

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
        'active:scale-[0.97] transition-transform duration-100',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {/* Hover shine sweep */}
      {!disabled && (
        <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-500 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
      )}
      {children}
    </button>
  );
}
