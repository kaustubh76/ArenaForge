import { useState } from 'react';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useToastStore } from '@/stores/toastStore';
import clsx from 'clsx';

interface FavoriteButtonProps {
  agentAddress: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function FavoriteButton({
  agentAddress,
  className,
  size = 'md',
  showLabel = false,
}: FavoriteButtonProps) {
  const { isFavorite, toggleFavorite } = useFavoritesStore();
  const favorite = isFavorite(agentAddress);
  const [justToggled, setJustToggled] = useState(false);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const buttonSizeClasses = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  };

  const addToast = useToastStore(s => s.addToast);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const wasFavorite = favorite;
    toggleFavorite(agentAddress);
    addToast(wasFavorite ? 'Removed from favorites' : 'Added to favorites!');
    setJustToggled(true);
    setTimeout(() => setJustToggled(false), 500);
  };

  return (
    <button
      onClick={handleToggle}
      className={clsx(
        'inline-flex items-center gap-1 rounded-md transition-all relative',
        'hover:bg-white/5',
        buttonSizeClasses[size],
        justToggled && 'scale-110',
        className
      )}
      title={favorite ? 'Remove from favorites' : 'Add to favorites'}
      aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
    >
      {/* Gold burst on favorite */}
      {justToggled && favorite && (
        <span className="absolute inset-0 rounded-md bg-arcade-gold/15 animate-ping pointer-events-none" />
      )}
      <StarIcon
        className={clsx(
          sizeClasses[size],
          'transition-all duration-300',
          favorite
            ? 'fill-arcade-gold text-arcade-gold'
            : 'fill-transparent text-text-tertiary hover:text-arcade-gold/70',
          justToggled && 'scale-125',
        )}
        style={favorite ? { filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.5))' } : undefined}
      />
      {showLabel && (
        <span className={clsx(
          'text-xs font-medium transition-colors',
          favorite ? 'text-arcade-gold' : 'text-text-tertiary'
        )}>
          {favorite ? 'Favorited' : 'Favorite'}
        </span>
      )}
    </button>
  );
}

function StarIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
      />
    </svg>
  );
}
