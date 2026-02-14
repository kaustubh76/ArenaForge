import { useEffect, useState, useCallback } from 'react';
import { ArcadeModal } from './ArcadeModal';

const SHORTCUTS = [
  { keys: ['⌘', 'K'], description: 'Open search / command palette' },
  { keys: ['←', '→'], description: 'Switch between tabs' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['Esc'], description: 'Close modal / overlay' },
  { keys: ['Space'], description: 'Play / pause replay' },
  { keys: ['←'], description: 'Previous round (replay)' },
  { keys: ['→'], description: 'Next round (replay)' },
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const onClose = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ArcadeModal open={open} title="KEYBOARD SHORTCUTS" onClose={onClose} className="max-w-sm">
      <div className="space-y-2">
        {SHORTCUTS.map((s, i) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <span className="text-sm text-gray-300">{s.description}</span>
            <div className="flex items-center gap-1">
              {s.keys.map((key, ki) => (
                <kbd
                  key={ki}
                  className="px-1.5 py-0.5 rounded bg-surface-1 border border-white/[0.06] text-[10px] font-mono text-gray-400 min-w-[1.5rem] text-center"
                >
                  {key}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-600 mt-4 text-center">
        Press <kbd className="px-1 py-0.5 rounded bg-surface-1 border border-white/[0.06] text-gray-500 font-mono">?</kbd> to toggle this help
      </p>
    </ArcadeModal>
  );
}
