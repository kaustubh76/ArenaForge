import clsx from 'clsx';
import { CheckCircle, XCircle, Info, X } from 'lucide-react';
import { useToastStore, type ToastType } from '@/stores/toastStore';

const iconMap: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
};

const colorMap: Record<ToastType, { border: string; icon: string; bg: string; glow: string }> = {
  success: {
    border: 'border-arcade-green/30',
    icon: 'text-arcade-green',
    bg: 'bg-arcade-green/5',
    glow: '0 0 12px rgba(105,240,174,0.15)',
  },
  error: {
    border: 'border-arcade-red/30',
    icon: 'text-arcade-red',
    bg: 'bg-arcade-red/5',
    glow: '0 0 12px rgba(255,82,82,0.15)',
  },
  info: {
    border: 'border-arcade-cyan/30',
    icon: 'text-arcade-cyan',
    bg: 'bg-arcade-cyan/5',
    glow: '0 0 12px rgba(0,229,255,0.15)',
  },
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        const colors = colorMap[toast.type];
        return (
          <div
            key={toast.id}
            className={clsx(
              'pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm',
              'animate-fade-in-up opacity-0 min-w-[240px] max-w-[360px]',
              colors.border,
              colors.bg,
              'bg-surface-1/90',
            )}
            style={{ animationFillMode: 'forwards', boxShadow: colors.glow }}
          >
            <Icon size={16} className={clsx(colors.icon, 'flex-shrink-0')} style={{ filter: `drop-shadow(0 0 3px currentColor)` }} />
            <span className="text-sm text-gray-200 flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
