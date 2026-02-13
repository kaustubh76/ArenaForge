import clsx from 'clsx';

interface SplitScreenProps {
  left: React.ReactNode;
  right: React.ReactNode;
  center?: React.ReactNode;
  className?: string;
}

export function SplitScreen({ left, right, center, className }: SplitScreenProps) {
  return (
    <div className={clsx('grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-stretch', className)}>
      <div className="min-w-0">{left}</div>
      <div className="flex items-center justify-center px-2 py-2 sm:py-0 relative">
        {/* Vertical divider lines */}
        <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-arcade-pink/30 to-transparent hidden sm:block" />
        <div className="absolute right-0 top-2 bottom-2 w-px bg-gradient-to-b from-transparent via-arcade-pink/30 to-transparent hidden sm:block" />
        {center ?? (
          <div className="animate-versus-slam">
            <span
              className="font-pixel text-2xl neon-text-pink drop-shadow-lg"
              style={{ textShadow: '0 0 12px rgba(236,72,153,0.5), 0 0 24px rgba(236,72,153,0.2)' }}
            >
              VS
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0">{right}</div>
    </div>
  );
}
