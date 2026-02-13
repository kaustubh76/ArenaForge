import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { useConnectionStatus } from '@/hooks';

interface ConnectionIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function ConnectionIndicator({ className, showLabel = false }: ConnectionIndicatorProps) {
  const { status } = useConnectionStatus();

  const statusConfig = {
    connected: {
      icon: Wifi,
      color: 'text-arcade-green',
      bgColor: 'bg-arcade-green/10',
      borderColor: 'border-arcade-green/30',
      label: 'Connected',
    },
    connecting: {
      icon: RefreshCw,
      color: 'text-arcade-gold',
      bgColor: 'bg-arcade-gold/10',
      borderColor: 'border-arcade-gold/30',
      label: 'Connecting...',
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-gray-500',
      bgColor: 'bg-gray-500/10',
      borderColor: 'border-gray-500/30',
      label: 'Disconnected',
    },
    error: {
      icon: WifiOff,
      color: 'text-arcade-red',
      bgColor: 'bg-arcade-red/10',
      borderColor: 'border-arcade-red/30',
      label: 'Connection Error',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  // Signal strength: error=1, disconnected=1, connecting=2, connected=3
  const signalLevel = status === 'connected' ? 3 : status === 'connecting' ? 2 : 1;
  const signalBarColor = status === 'connected' ? 'bg-arcade-green' : status === 'connecting' ? 'bg-arcade-gold' : status === 'error' ? 'bg-arcade-red' : 'bg-gray-500';

  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-300',
        config.bgColor,
        config.borderColor,
        className
      )}
      title={`WebSocket: ${config.label}`}
    >
      <Icon
        size={12}
        className={clsx(
          config.color,
          status === 'connecting' && 'animate-spin',
          status === 'error' && 'animate-pulse',
        )}
      />
      {showLabel && (
        <span className={clsx('text-[10px] font-pixel', config.color)}>
          {config.label}
        </span>
      )}
      {/* Signal strength bars */}
      <div className="flex items-end gap-px ml-0.5">
        {[1, 2, 3].map(level => (
          <div
            key={level}
            className={clsx(
              'w-[2px] rounded-sm transition-all duration-300',
              level <= signalLevel ? signalBarColor : 'bg-gray-700',
            )}
            style={{ height: 2 + level * 2 }}
          />
        ))}
      </div>
    </div>
  );
}
