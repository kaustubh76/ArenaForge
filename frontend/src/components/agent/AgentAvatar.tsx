import clsx from 'clsx';
import { RankTier } from '@/types/arena';

interface AgentAvatarProps {
  avatarUrl?: string;
  handle: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tier?: RankTier;
  isOnline?: boolean;
  className?: string;
}

const tierRingColor: Record<RankTier, string> = {
  [RankTier.Iron]: 'ring-gray-500/40',
  [RankTier.Bronze]: 'ring-amber-600/50',
  [RankTier.Silver]: 'ring-gray-300/50',
  [RankTier.Gold]: 'ring-yellow-400/60',
  [RankTier.Platinum]: 'ring-cyan-300/60',
  [RankTier.Diamond]: 'ring-purple-400/70',
};

const sizeClasses = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-8 h-8 text-xs',
  lg: 'w-12 h-12 text-sm',
  xl: 'w-16 h-16 text-base',
};

// Generate consistent color from handle
function getAvatarColor(handle: string): string {
  const colors = [
    'bg-arcade-purple',
    'bg-arcade-cyan',
    'bg-arcade-pink',
    'bg-arcade-green',
    'bg-arcade-gold',
  ];
  const hash = handle.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

// Get initials from handle
function getInitials(handle: string): string {
  if (!handle) return '?';
  const parts = handle.replace(/[^a-zA-Z0-9\s_-]/g, '').split(/[\s_-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return handle.slice(0, 2).toUpperCase();
}

// Convert IPFS URI to gateway URL
function ipfsToHttp(uri: string): string {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  if (uri.startsWith('https://') || uri.startsWith('http://')) {
    return uri;
  }
  // Assume it's just a CID
  return `https://ipfs.io/ipfs/${uri}`;
}

export function AgentAvatar({ avatarUrl, handle, size = 'md', tier, isOnline, className }: AgentAvatarProps) {
  const hasImage = !!avatarUrl;
  const imageUrl = hasImage ? ipfsToHttp(avatarUrl) : '';

  return (
    <div className="relative inline-flex flex-shrink-0">
      <div
        className={clsx(
          'rounded-full flex items-center justify-center font-bold overflow-hidden',
          'ring-2',
          tier !== undefined ? tierRingColor[tier] : 'ring-white/10',
          !hasImage && getAvatarColor(handle),
          sizeClasses[size],
          className
        )}
      >
        {hasImage ? (
          <img
            src={imageUrl}
            alt={`${handle} avatar`}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <span className="text-white/90">{getInitials(handle)}</span>
        )}
      </div>
      {isOnline && (
        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-arcade-green rounded-full ring-2 ring-surface-0 animate-pulse" />
      )}
    </div>
  );
}
