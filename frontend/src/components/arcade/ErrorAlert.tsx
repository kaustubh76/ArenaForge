import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import clsx from 'clsx';

interface ErrorAlertProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

export function ErrorAlert({ message, onRetry, onDismiss, className }: ErrorAlertProps) {
  return (
    <div
      role="alert"
      className={clsx(
        'flex items-start gap-3 p-4 rounded-lg border-l-[3px] border border-arcade-red/30 text-arcade-red',
        'bg-arcade-red/10 border-l-arcade-red',
        className
      )}
      style={{ boxShadow: '0 0 12px rgba(239,68,68,0.15)', animation: 'shakeX 0.4s ease-out' }}
    >
      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 animate-pulse" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold mb-1">Error</p>
        <p className="text-xs text-gray-400 break-words">{message}</p>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <button
            onClick={onRetry}
            aria-label="Retry"
            className="p-1.5 rounded hover:bg-arcade-red/20 transition-all duration-200 hover:rotate-180"
          >
            <RefreshCw size={14} />
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="p-1.5 rounded hover:bg-white/10 transition-all duration-200 hover:scale-110"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
