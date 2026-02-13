import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Database } from 'lucide-react';
import { useArenaStore } from '@/stores/arenaStore';
import { createNetworkListener, isOnline } from '@/lib/indexeddb-storage';

/**
 * Network status indicator that shows:
 * - Online/offline status
 * - Whether cached data is being used
 */
export function NetworkStatus() {
  const { isOffline, usingCachedData, setOfflineStatus, lastFetchTimestamp } = useArenaStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Set initial status
    setOfflineStatus(!isOnline());

    // Listen for network changes
    const cleanup = createNetworkListener(
      () => {
        setOfflineStatus(false);
        setVisible(false);
      },
      () => {
        setOfflineStatus(true);
        setVisible(true);
      }
    );

    return cleanup;
  }, [setOfflineStatus]);

  // Show indicator when offline or using cached data
  const shouldShow = isOffline || usingCachedData;

  if (!shouldShow && !visible) return null;

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return 'unknown';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  // Signal strength: offline=1 red, cached=2 gold, online=3 green
  const signalCount = isOffline ? 1 : usingCachedData ? 2 : 3;
  const signalColor = isOffline ? 'bg-arcade-red' : usingCachedData ? 'bg-arcade-gold' : 'bg-arcade-green';

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono transition-all duration-500 animate-slide-in-right ${
        isOffline
          ? 'bg-arcade-red/20 border border-arcade-red/40 text-arcade-red'
          : usingCachedData
          ? 'bg-arcade-gold/10 border border-arcade-gold/30 text-arcade-gold'
          : 'bg-arcade-cyan/20 border border-arcade-cyan/40 text-arcade-cyan'
      }`}
      style={{ animation: 'slideInRight 0.3s ease-out' }}
    >
      {isOffline ? (
        <>
          <WifiOff size={14} className="animate-pulse" />
          <span>OFFLINE</span>
        </>
      ) : usingCachedData ? (
        <>
          <Database size={14} />
          <span>CACHED</span>
        </>
      ) : (
        <>
          <Wifi size={14} />
          <span>ONLINE</span>
        </>
      )}
      {/* Signal strength dots */}
      <div className="flex items-end gap-0.5 ml-1">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={`rounded-sm transition-all duration-300 ${
              level <= signalCount ? signalColor : 'bg-gray-700'
            }`}
            style={{ width: 3, height: 4 + level * 3 }}
          />
        ))}
      </div>
      {lastFetchTimestamp && (
        <span className="text-gray-500 ml-1">
          ({formatTimestamp(lastFetchTimestamp)})
        </span>
      )}
    </div>
  );
}
