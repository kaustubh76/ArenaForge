import { Bell, BellOff, BellRing } from 'lucide-react';
import clsx from 'clsx';
import { useNotifications } from '@/hooks/useNotifications';

interface NotificationSettingsProps {
  className?: string;
  compact?: boolean;
}

export function NotificationSettings({ className, compact = false }: NotificationSettingsProps) {
  const { permission, isSupported, requestPermission } = useNotifications();

  if (!isSupported) {
    if (compact) return null;
    return (
      <div className={clsx('text-xs text-text-muted', className)}>
        Notifications not supported in this browser
      </div>
    );
  }

  const handleClick = async () => {
    if (permission === 'default') {
      await requestPermission();
    }
  };

  const getIcon = () => {
    switch (permission) {
      case 'granted':
        return <BellRing size={compact ? 14 : 16} />;
      case 'denied':
        return <BellOff size={compact ? 14 : 16} />;
      default:
        return <Bell size={compact ? 14 : 16} />;
    }
  };

  const getLabel = () => {
    switch (permission) {
      case 'granted':
        return 'Notifications On';
      case 'denied':
        return 'Notifications Blocked';
      default:
        return 'Enable Notifications';
    }
  };

  const getDescription = () => {
    switch (permission) {
      case 'granted':
        return "You'll be notified when matches complete";
      case 'denied':
        return 'Enable in browser settings to receive alerts';
      default:
        return 'Get notified about match results';
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={permission === 'denied'}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
          'border border-white/[0.06]',
          permission === 'granted'
            ? 'text-arcade-green bg-arcade-green/10 border-arcade-green/30'
            : permission === 'denied'
            ? 'text-text-muted cursor-not-allowed opacity-50'
            : 'text-text-secondary hover:text-white hover:bg-surface-3',
          className
        )}
        title={getDescription()}
      >
        {getIcon()}
        <span className="hidden sm:inline">{permission === 'granted' ? 'On' : 'Off'}</span>
      </button>
    );
  }

  return (
    <div className={clsx('arcade-card', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              permission === 'granted'
                ? 'bg-arcade-green/10 text-arcade-green'
                : permission === 'denied'
                ? 'bg-surface-3 text-text-muted'
                : 'bg-arcade-purple/10 text-arcade-purple'
            )}
          >
            {getIcon()}
          </div>
          <div>
            <h4 className="text-sm font-medium text-white">{getLabel()}</h4>
            <p className="text-xs text-text-muted">{getDescription()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-1">
            {['default', 'granted'].map((step, i) => (
              <div key={step} className="flex items-center">
                <div
                  className={clsx(
                    'w-2 h-2 rounded-full transition-all',
                    permission === 'granted'
                      ? 'bg-arcade-green'
                      : permission === 'denied'
                        ? 'bg-arcade-red'
                        : i === 0
                          ? 'bg-arcade-purple'
                          : 'bg-gray-700'
                  )}
                  style={
                    permission === 'granted'
                      ? { boxShadow: '0 0 4px rgba(105,240,174,0.5)' }
                      : permission === 'denied'
                        ? { boxShadow: '0 0 4px rgba(255,82,82,0.4)' }
                        : i === 0
                          ? { boxShadow: '0 0 4px rgba(168,85,247,0.4)' }
                          : undefined
                  }
                />
                {i === 0 && (
                  <div className={clsx(
                    'w-4 h-px mx-0.5',
                    permission === 'granted' ? 'bg-arcade-green' : 'bg-gray-700'
                  )} />
                )}
              </div>
            ))}
          </div>

          {permission === 'default' && (
            <button
              onClick={handleClick}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                'bg-arcade-purple/20 text-arcade-purple hover:bg-arcade-purple/30 hover:scale-105 active:scale-95',
                'border border-arcade-purple/30'
              )}
            >
              Enable
            </button>
          )}

          {permission === 'granted' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-arcade-green/10 text-arcade-green text-xs font-medium">
              <div className="w-1.5 h-1.5 rounded-full bg-arcade-green animate-pulse" style={{ boxShadow: '0 0 4px rgba(105,240,174,0.6)' }} />
              Active
            </div>
          )}

          {permission === 'denied' && (
            <span className="text-xs text-text-muted">Check browser settings</span>
          )}
        </div>
      </div>
    </div>
  );
}
