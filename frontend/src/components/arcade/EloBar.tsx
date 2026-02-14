import clsx from 'clsx';
import { getEloTier } from '@/constants/ui';

interface EloBarProps {
  elo: number;
  showLabel?: boolean;
  className?: string;
}

const barColors: Record<string, string> = {
  'elo-bronze': 'bg-elo-bronze',
  'elo-silver': 'bg-elo-silver',
  'elo-gold': 'bg-elo-gold',
  'elo-diamond': 'bg-elo-diamond',
  'elo-master': 'bg-elo-master',
};

// Tier thresholds for marker display
const TIER_THRESHOLDS = [
  { elo: 1000, label: 'S', name: 'Silver (1000+)' },
  { elo: 1200, label: 'G', name: 'Gold (1200+)' },
  { elo: 1600, label: 'D', name: 'Diamond (1600+)' },
  { elo: 2000, label: 'M', name: 'Master (2000+)' },
];

const glowColors: Record<string, string> = {
  'elo-bronze': '0 0 6px rgba(205,127,50,0.3)',
  'elo-silver': '0 0 6px rgba(192,192,192,0.3)',
  'elo-gold': '0 0 8px rgba(255,215,0,0.35)',
  'elo-diamond': '0 0 10px rgba(185,242,255,0.4)',
  'elo-master': '0 0 12px rgba(255,0,128,0.4)',
};

export function EloBar({ elo, showLabel = true, className }: EloBarProps) {
  const tier = getEloTier(elo);
  const maxDisplay = 2400;
  const percentage = Math.min((elo / maxDisplay) * 100, 100);

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {showLabel && (
        <span className="font-mono text-sm font-bold text-white min-w-[3rem] text-right">
          {elo}
        </span>
      )}
      <div className="relative flex-1 h-1.5 bg-surface-1 rounded-full overflow-hidden min-w-[60px]" title={`ELO ${elo} — ${tier.label} tier`}>
        <div
          className={clsx('h-full rounded-full transition-all duration-700', barColors[tier.cssClass])}
          style={{
            width: `${percentage}%`,
            boxShadow: glowColors[tier.cssClass] ?? 'none',
          }}
        />
        {/* Tier threshold markers */}
        {TIER_THRESHOLDS.map(t => {
          const pos = (t.elo / maxDisplay) * 100;
          return (
            <div
              key={t.elo}
              className={clsx(
                'absolute top-0 bottom-0 w-px',
                elo >= t.elo ? 'bg-white/20' : 'bg-white/5',
              )}
              style={{ left: `${pos}%` }}
              title={t.name}
            />
          );
        })}
      </div>
      {showLabel && (
        <span className={clsx('text-[10px] font-bold uppercase tracking-wider', tier.cssClass, 'px-1.5 py-0.5 rounded')}>
          {tier.label}
        </span>
      )}
    </div>
  );
}
