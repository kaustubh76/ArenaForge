import { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Sparkles, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useThemeStore } from '@/stores/themeStore';

type Theme = 'arcade' | 'dark' | 'light';

const themeConfig: Record<Theme, { icon: typeof Sparkles; label: string; color: string; description: string }> = {
  arcade: { icon: Sparkles, label: 'Arcade', color: 'text-arcade-purple', description: 'Neon purple aesthetic' },
  dark: { icon: Moon, label: 'Dark', color: 'text-arcade-cyan', description: 'Easy on the eyes' },
  light: { icon: Sun, label: 'Light', color: 'text-arcade-gold', description: 'Bright and clean' },
};

const themes: Theme[] = ['arcade', 'dark', 'light'];

export function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const config = themeConfig[theme];
  const Icon = config.icon;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 group',
          'hover:bg-surface-3 border border-white/[0.06]',
          config.color
        )}
        aria-label={`Current theme: ${config.label}. Click to change.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Icon size={14} className="group-hover:scale-110 transition-transform" />
        <span className="text-xs font-medium hidden sm:inline">{config.label}</span>
        <ChevronDown size={12} className={clsx('transition-transform duration-200', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div
          className={clsx(
            'absolute right-0 mt-2 w-48 rounded-lg overflow-hidden z-50',
            'bg-surface-2 border border-white/[0.08] shadow-xl shadow-black/40'
          )}
          style={{ animation: 'fadeIn 0.15s ease-out' }}
          role="listbox"
          aria-label="Select theme"
        >
          {themes.map((t) => {
            const cfg = themeConfig[t];
            const ThemeIcon = cfg.icon;
            const isSelected = t === theme;

            return (
              <button
                key={t}
                onClick={() => {
                  setTheme(t);
                  setIsOpen(false);
                }}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all duration-150',
                  isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                )}
                role="option"
                aria-selected={isSelected}
              >
                <div className={clsx(
                  'w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200',
                  isSelected ? 'bg-white/[0.1] scale-105' : 'bg-white/[0.04]'
                )}>
                  <ThemeIcon size={16} className={clsx(cfg.color, isSelected && 'drop-shadow-sm')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={clsx(
                    'text-sm font-medium',
                    isSelected ? 'text-white' : 'text-text-secondary'
                  )}>
                    {cfg.label}
                  </div>
                  <div className="text-[10px] text-text-muted truncate">
                    {cfg.description}
                  </div>
                </div>
                {isSelected && (
                  <div className={clsx(
                    'w-4 h-4 rounded-full flex items-center justify-center',
                    cfg.color.replace('text-', 'bg-') + '/20'
                  )}>
                    <div className={clsx('w-1.5 h-1.5 rounded-full', cfg.color.replace('text-', 'bg-'))} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
