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
            <p className="font-pixel text-2xl neon-text-red mb-4">GAME OVER</p>
            <p className="font-pixel text-xs text-gray-500 mb-6">
              CRITICAL ERROR ENCOUNTERED
            </p>
            <div className="arcade-card p-4 mb-6 text-left">
              <p className="text-xs text-gray-400 font-mono break-all">
                {this.state.error?.message ?? 'Unknown error'}
              </p>
            </div>
            <button
              className="btn-neon btn-neon-purple text-xs px-6 py-2"
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
