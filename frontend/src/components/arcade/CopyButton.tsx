import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import clsx from 'clsx';
import { useToastStore } from '@/stores/toastStore';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  size?: number;
}

/**
 * Small inline copy-to-clipboard button with check feedback.
 */
export function CopyButton({ text, label = 'Copied!', className, size = 12 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const addToast = useToastStore(s => s.addToast);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      addToast(label);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={clsx(
        'inline-flex items-center justify-center p-0.5 rounded text-gray-500 hover:text-white transition-colors',
        className,
      )}
      aria-label={`Copy ${text}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check size={size} className="text-arcade-green" />
      ) : (
        <Copy size={size} />
      )}
    </button>
  );
}
