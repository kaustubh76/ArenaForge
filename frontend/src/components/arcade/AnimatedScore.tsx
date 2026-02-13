import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
import clsx from 'clsx';

interface AnimatedScoreProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export function AnimatedScore({ value, prefix = '', suffix = '', decimals = 0, className }: AnimatedScoreProps) {
  const animated = useAnimatedNumber(value);

  return (
    <span className={clsx('font-mono font-bold tabular-nums', className)}>
      {prefix}{animated.toFixed(decimals)}{suffix}
    </span>
  );
}
