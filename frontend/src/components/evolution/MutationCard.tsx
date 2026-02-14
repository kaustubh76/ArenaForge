import clsx from 'clsx';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import type { Mutation } from '@/types/arena';

interface MutationCardProps {
  mutation: Mutation;
}

export function MutationCard({ mutation }: MutationCardProps) {
  const isPositive = (mutation.factor && mutation.factor > 1) ||
    (mutation.increment && mutation.increment > 0);

  // Calculate impact magnitude (0-1 scale)
  const magnitude = mutation.factor
    ? Math.min(1, Math.abs(mutation.factor - 1) * 5) // ×1.2 = 100% impact
    : mutation.increment
      ? Math.min(1, Math.abs(mutation.increment) / 10)
      : 0;

  const impactLabel = magnitude > 0.7 ? 'MAJOR' : magnitude > 0.3 ? 'MODERATE' : 'MINOR';
  const impactColor = isPositive ? '#69f0ae' : '#ff5252';

  return (
    <div className="arcade-card p-4 transition-all duration-200 hover:scale-[1.01]">
      <div className="flex items-start gap-3">
        <div className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isPositive
            ? 'bg-arcade-green/10 text-arcade-green'
            : 'bg-arcade-red/10 text-arcade-red',
        )}>
          {isPositive ? <ArrowUp size={16} style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.5))' }} /> : <ArrowDown size={16} style={{ filter: 'drop-shadow(0 0 3px rgba(255,82,82,0.5))' }} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <GlowBadge
              color={mutation.type === 'scale' ? 'purple' : 'cyan'}
              label={mutation.type}
            />
            {mutation.factor && (
              <span className="font-mono text-xs text-gray-300">
                x{mutation.factor.toFixed(2)}
              </span>
            )}
            {mutation.increment && (
              <span className="font-mono text-xs text-gray-300">
                {mutation.increment > 0 ? '+' : ''}{mutation.increment}
              </span>
            )}
            <span
              className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color: impactColor,
                backgroundColor: `${impactColor}15`,
                border: `1px solid ${impactColor}30`,
              }}
            >
              {impactLabel}
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed italic">
            &ldquo;{mutation.reason}&rdquo;
          </p>
          {/* Impact magnitude bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1 bg-surface-1 rounded-full overflow-hidden max-w-[120px]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${magnitude * 100}%`, background: impactColor, opacity: 0.7 }}
              />
            </div>
            <span className="text-[8px] font-mono text-gray-600">{(magnitude * 100).toFixed(0)}% impact</span>
          </div>
        </div>
      </div>
    </div>
  );
}
