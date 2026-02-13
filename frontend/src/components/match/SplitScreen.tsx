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
      <div className="flex items-center justify-center px-2 py-2 sm:py-0">
        {center ?? (
          <div className="animate-versus-slam">
            <span className="font-pixel text-2xl neon-text-pink">VS</span>
          </div>
        )}
      </div>
      <div className="min-w-0">{right}</div>
    </div>
  );
}
