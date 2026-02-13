import { useEffect } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

interface ArcadeModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}

export function ArcadeModal({ open, title, onClose, className, children }: ArcadeModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200"
        style={{ animation: 'fadeIn 0.2s ease-out' }}
        onClick={onClose}
      />
      <div
        className={clsx(
          'relative bg-surface-2 border border-arcade-purple/30 rounded-lg shadow-arcade-card-hover max-w-2xl w-full max-h-[85vh] overflow-hidden animate-scale-in',
          className,
        )}
      >
        {/* Corner decorations */}
        <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-arcade-purple/50 rounded-tl-lg pointer-events-none" />
        <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-arcade-purple/50 rounded-tr-lg pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-arcade-purple/50 rounded-bl-lg pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-arcade-purple/50 rounded-br-lg pointer-events-none" />

        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-arcade-purple animate-pulse" />
            <h3 className="font-pixel text-xs text-arcade-purple tracking-wide">{title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-gray-500 hover:text-white hover:rotate-90 transition-all duration-200 p-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[calc(85vh-3.5rem)]">
          {children}
        </div>
      </div>
    </div>
  );
}
