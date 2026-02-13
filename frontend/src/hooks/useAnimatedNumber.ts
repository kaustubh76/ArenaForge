import { useState, useEffect, useRef } from 'react';

export function useAnimatedNumber(target: number, duration: number = 500): number {
  const [current, setCurrent] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    const diff = target - from;
    if (diff === 0) return;

    const start = performance.now();
    let rafId: number;

    function tick(time: number) {
      const elapsed = time - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(from + diff * eased);

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return current;
}
