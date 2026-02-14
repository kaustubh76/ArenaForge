import clsx from 'clsx';
import { Gamepad2, Trophy, Star, Target, Zap, Radio, type LucideIcon } from 'lucide-react';
import { NeonButton } from './NeonButton';

interface EmptyStateProps {
  icon?: LucideIcon;
  headline: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionColor?: 'purple' | 'cyan' | 'pink' | 'green';
  className?: string;
}

/**
 * Arcade-themed empty state with floating icon, glowing text, and optional CTA.
 */
export function EmptyState({
  icon: Icon = Gamepad2,
  headline,
  subtitle,
  actionLabel,
  onAction,
  actionColor = 'purple',
  className,
}: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center py-12 px-6', className)}>
      {/* Floating icon with glow ring */}
      <div className="relative mb-6">
        <div className="w-16 h-16 rounded-full bg-surface-1 border border-white/[0.06] flex items-center justify-center animate-float">
          <Icon
            size={28}
            className="text-gray-500"
            style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.3))' }}
          />
        </div>
        <div className="absolute inset-0 w-16 h-16 rounded-full border border-arcade-purple/20 animate-glow-pulse" />
      </div>

      {/* Headline */}
      <h3
        className="font-pixel text-xs text-gray-300 tracking-wider mb-2"
        style={{ textShadow: '0 0 8px rgba(168,85,247,0.2)' }}
      >
        {headline}
      </h3>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-sm text-gray-500 text-center max-w-xs mb-6">{subtitle}</p>
      )}

      {/* CTA Button */}
      {actionLabel && onAction && (
        <NeonButton variant="neon" color={actionColor} size="sm" onClick={onAction}>
          {actionLabel}
        </NeonButton>
      )}

      {/* Decorative dots */}
      <div className="flex items-center gap-1.5 mt-6">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-gray-700 animate-pulse-soft"
            style={{ animationDelay: `${i * 0.3}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Pre-built variants ────────────────────────────────

export function EmptyTournaments({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Trophy}
      headline="NO BATTLES AVAILABLE"
      subtitle="No tournaments match your filters. Try adjusting your search or create a new tournament."
      actionLabel={onAction ? 'CREATE TOURNAMENT' : undefined}
      onAction={onAction}
      actionColor="cyan"
    />
  );
}

export function EmptyFavorites({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon={Star}
      headline="NO FAVORITES YET"
      subtitle="Star agents you want to track. Visit the leaderboard to discover top performers."
      actionLabel={onAction ? 'BROWSE AGENTS' : undefined}
      onAction={onAction}
      actionColor="purple"
    />
  );
}

export function EmptyActivity() {
  return (
    <EmptyState
      icon={Zap}
      headline="NO RECENT ACTIVITY"
      subtitle="Events will appear here as matches start, finish, and tournaments progress."
    />
  );
}

export function EmptyBets() {
  return (
    <EmptyState
      icon={Target}
      headline="NO BETS FOUND"
      subtitle="Place bets on live matches from the tournament board to see your history here."
    />
  );
}

export function EmptyAgents() {
  return (
    <EmptyState
      icon={Radio}
      headline="NO AGENTS DISCOVERED"
      subtitle="Enable the autonomous scheduler to scan on-chain tournaments and discover agents."
    />
  );
}
