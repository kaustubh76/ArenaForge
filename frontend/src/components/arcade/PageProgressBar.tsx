import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Slim top-of-page progress bar that animates on route transitions.
 * Mimics NProgress behaviour without external dependencies.
 * Purple→cyan gradient with glow, fixed at top of viewport.
 */
export function PageProgressBar() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    // Skip initial mount
    if (prevPath.current === location.pathname) return;
    prevPath.current = location.pathname;

    // Start progress
    setVisible(true);
    setProgress(15);

    // Trickle up incrementally
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 90) return p;
        const inc = p < 40 ? 8 : p < 60 ? 4 : p < 80 ? 2 : 0.5;
        return Math.min(p + inc, 90);
      });
    }, 120);

    // Complete after a short delay (page content loaded via Suspense)
    const completeTimer = setTimeout(() => {
      clearInterval(timerRef.current);
      setProgress(100);
      setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 300);
    }, 400);

    return () => {
      clearInterval(timerRef.current);
      clearTimeout(completeTimer);
    };
  }, [location.pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[2px] pointer-events-none"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
    >
      <div
        className="h-full transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #a855f7, #22d3ee)',
          boxShadow: '0 0 8px rgba(168,85,247,0.5), 0 0 4px rgba(34,211,238,0.4)',
          opacity: visible ? 1 : 0,
          transition: progress === 100
            ? 'width 0.2s ease-out, opacity 0.3s ease-out 0.1s'
            : 'width 0.2s ease-out',
        }}
      />
    </div>
  );
}
