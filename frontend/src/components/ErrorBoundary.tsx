import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-0 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <p
              className="font-pixel text-4xl neon-text-red mb-4 animate-neon-flicker"
              style={{ textShadow: '0 0 20px rgba(255,82,82,0.4), 0 0 40px rgba(255,82,82,0.15)' }}
            >
              GAME OVER
            </p>
            <p className="font-pixel text-xs text-gray-500 mb-2 tracking-widest">
              CRITICAL ERROR ENCOUNTERED
            </p>
            <div className="flex items-center gap-2 justify-center mb-6">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-gray-700" />
              <span className="font-mono text-[10px] text-gray-700">ERR: 0x5252</span>
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-gray-700" />
            </div>
            <div
              className="arcade-card p-4 mb-6 text-left border-l-[3px] border-l-arcade-red"
              style={{ boxShadow: '0 0 12px rgba(255,82,82,0.1)' }}
            >
              <p className="text-xs text-gray-400 font-mono break-all">
                {this.state.error?.message ?? 'Unknown error'}
              </p>
            </div>
            <button
              className="btn-neon btn-neon-purple text-xs px-6 py-2 transition-all hover:scale-105 active:scale-95"
              onClick={() => window.location.reload()}
            >
              INSERT COIN TO CONTINUE
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
