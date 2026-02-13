import { useState, useEffect, useRef } from 'react';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
import clsx from 'clsx';

interface AnimatedScoreProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  glow?: boolean;
  className?: string;
}

export function AnimatedScore({ value, prefix = '', suffix = '', decimals = 0, glow = false, className }: AnimatedScoreProps) {
  const animated = useAnimatedNumber(value);
  const [popped, setPopped] = useState(false);
  const prevValue = useRef(value);

  // Pop effect on value change
  useEffect(() => {
    if (prevValue.current !== value) {
      setPopped(true);
      const t = setTimeout(() => setPopped(false), 400);
      prevValue.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <span
      className={clsx(
        'font-mono font-bold tabular-nums transition-transform duration-200',
        popped && 'scale-110',
        className,
      )}
      style={glow && value > 0 ? { textShadow: '0 0 6px currentColor' } : undefined}
    >
      {prefix}{animated.toFixed(decimals)}{suffix}
    </span>
  );
}
