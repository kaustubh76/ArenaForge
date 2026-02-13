import { useState, useEffect } from 'react';
import { COUNTDOWN_WARNING_THRESHOLD } from '@/constants/ui';

interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
  isWarning: boolean;
}

export function useCountdown(targetTimestamp: number): CountdownResult {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = Math.max(0, Math.floor((targetTimestamp - now) / 1000));

  return {
    days: Math.floor(diff / 86400),
    hours: Math.floor((diff % 86400) / 3600),
    minutes: Math.floor((diff % 3600) / 60),
    seconds: diff % 60,
    totalSeconds: diff,
    isExpired: diff <= 0,
    isWarning: diff > 0 && diff <= COUNTDOWN_WARNING_THRESHOLD,
  };
}
