import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Database, Clock } from 'lucide-react';
import { NeonButton } from '@/components/arcade/NeonButton';

interface Props {
  children: ReactNode;
  matchId: number;
  fallbackMessage?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  lastValidState: string | null;
}

const CACHE_KEY_PREFIX = 'match_state_cache_';

export class MatchErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      lastValidState: this.getCachedState(),
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[MatchErrorBoundary] Caught error:', error, errorInfo);
  }

  getCachedState(): string | null {
    try {
      const key = `${CACHE_KEY_PREFIX}${this.props.matchId}`;
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallbackMessage } = this.props;
      const { error, lastValidState } = this.state;

      return (
        <div className="arcade-card p-6 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-arcade-red/10 flex items-center justify-center">
              <AlertTriangle size={24} className="text-arcade-red" />
            </div>
          </div>

          <h3 className="font-pixel text-sm text-arcade-red mb-2">
            DISPLAY ERROR
          </h3>

          <p className="text-xs text-gray-400 mb-4">
            {fallbackMessage || 'Failed to render match view'}
          </p>

          {error && (
            <p className="text-[10px] text-gray-600 font-mono mb-4 break-all">
              {error.message}
            </p>
          )}

          {lastValidState && (() => {
            let cacheAge = '';
            try {
              const parsed = JSON.parse(lastValidState);
              if (parsed.timestamp) {
                const secs = Math.floor((Date.now() - parsed.timestamp) / 1000);
                cacheAge = secs < 60 ? `${secs}s ago` : secs < 3600 ? `${Math.floor(secs / 60)}m ago` : `${Math.floor(secs / 3600)}h ago`;
              }
            } catch { /* ignore */ }
            return (
              <div className="mb-4 p-3 bg-surface-1 rounded-lg border border-arcade-cyan/20">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Database size={14} className="text-arcade-cyan" />
                  <p className="text-[10px] font-pixel text-arcade-cyan">CACHED STATE AVAILABLE</p>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-arcade-green animate-pulse" />
                    <span className="text-[9px] text-gray-400">Recovery ready</span>
                  </div>
                  {cacheAge && (
                    <div className="flex items-center gap-1">
                      <Clock size={9} className="text-gray-500" />
                      <span className="text-[9px] text-gray-500 font-mono">{cacheAge}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <NeonButton
            variant="neon"
            color="purple"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2"
          >
            <RefreshCw size={14} />
            RETRY
          </NeonButton>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Cache game state to sessionStorage for recovery.
 */
export function cacheMatchState(matchId: number, state: unknown): void {
  try {
    const key = `${CACHE_KEY_PREFIX}${matchId}`;
    const serialized = JSON.stringify({
      state,
      timestamp: Date.now(),
    });
    sessionStorage.setItem(key, serialized);
  } catch (e) {
    console.warn('[MatchErrorBoundary] Failed to cache state:', e);
  }
}

/**
 * Retrieve cached game state.
 */
export function getCachedMatchState<T>(matchId: number): { state: T; timestamp: number } | null {
  try {
    const key = `${CACHE_KEY_PREFIX}${matchId}`;
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

/**
 * Clear cached state for a match.
 */
export function clearMatchStateCache(matchId: number): void {
  try {
    const key = `${CACHE_KEY_PREFIX}${matchId}`;
    sessionStorage.removeItem(key);
  } catch {
    // Ignore
  }
}
