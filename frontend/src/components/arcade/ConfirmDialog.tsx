import { ArcadeModal } from './ArcadeModal';
import { NeonButton } from './NeonButton';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: 'purple' | 'cyan' | 'pink' | 'green';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmColor = 'pink',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ArcadeModal open={open} title={title} onClose={onCancel} className="max-w-sm">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-10 h-10 rounded-full bg-arcade-pink/10 border border-arcade-pink/20 flex items-center justify-center">
          <AlertTriangle size={20} className="text-arcade-pink" />
        </div>
        <p className="text-sm text-gray-300">{message}</p>
        <div className="flex gap-3 w-full">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-xs font-semibold rounded-lg border border-white/[0.06] text-gray-400 hover:text-white hover:bg-surface-1 transition-colors"
          >
            Cancel
          </button>
          <NeonButton color={confirmColor} onClick={onConfirm} className="flex-1">
            {confirmLabel}
          </NeonButton>
        </div>
      </div>
    </ArcadeModal>
  );
}
