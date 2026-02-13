import { useState } from 'react';
import { UserPlus, UserCheck } from 'lucide-react';
import { useFollowingStore } from '@/stores/followingStore';
import clsx from 'clsx';

interface FollowButtonProps {
  agentAddress: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function FollowButton({
  agentAddress,
  className,
  size = 'md',
  showLabel = false,
}: FollowButtonProps) {
  const { isFollowing, toggleFollow } = useFollowingStore();
  const following = isFollowing(agentAddress);
  const [justToggled, setJustToggled] = useState(false);

  const iconSizes = {
    sm: 14,
    md: 18,
    lg: 22,
  };

  const buttonSizeClasses = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  };

  const Icon = following ? UserCheck : UserPlus;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFollow(agentAddress);
    setJustToggled(true);
    setTimeout(() => setJustToggled(false), 600);
  };

  return (
    <button
      onClick={handleToggle}
      className={clsx(
        'inline-flex items-center gap-1 rounded-md transition-all relative overflow-hidden',
        'hover:bg-white/5',
        buttonSizeClasses[size],
        following && 'bg-arcade-cyan/5',
        justToggled && 'scale-110',
        className
      )}
      title={following ? 'Unfollow agent' : 'Follow agent'}
      aria-label={following ? 'Unfollow agent' : 'Follow agent'}
    >
      {/* Burst effect on toggle */}
      {justToggled && following && (
        <span className="absolute inset-0 rounded-md bg-arcade-cyan/20 animate-ping pointer-events-none" />
      )}
      <Icon
        size={iconSizes[size]}
        className={clsx(
          'transition-all duration-300',
          following
            ? 'text-arcade-cyan'
            : 'text-text-tertiary hover:text-arcade-cyan/70',
          justToggled && 'scale-125',
        )}
      />
      {showLabel && (
        <span className={clsx(
          'text-xs font-medium transition-colors',
          following ? 'text-arcade-cyan' : 'text-text-tertiary'
        )}>
          {following ? 'Following' : 'Follow'}
        </span>
      )}
    </button>
  );
}
