import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import clsx from 'clsx';

const SCROLL_THRESHOLD = 400;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SCROLL_THRESHOLD);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={clsx(
        'fixed bottom-6 left-6 z-50 p-3 rounded-full',
        'bg-surface-2/90 backdrop-blur-sm border border-white/[0.06]',
        'text-gray-400 hover:text-white hover:bg-surface-3',
        'transition-all duration-200 hover:scale-110 active:scale-95',
        'animate-fade-in-up opacity-0',
      )}
      style={{ animationFillMode: 'forwards', boxShadow: '0 0 12px rgba(168,85,247,0.15)' }}
      aria-label="Scroll to top"
    >
      <ArrowUp size={18} />
    </button>
  );
}
