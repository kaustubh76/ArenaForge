import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Coins, Shield } from 'lucide-react';
import clsx from 'clsx';
import { Tournament, TournamentStatus } from '@/types/arena';
import { useArenaStore } from '@/stores/arenaStore';
import { FORMAT_LABELS } from '@/constants/game';
import { formatMON } from '@/constants/ui';
import { ArcadeCard } from '@/components/arcade/ArcadeCard';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';
import { StatusIndicator } from '@/components/arcade/StatusIndicator';
import { NeonButton } from '@/components/arcade/NeonButton';
import { CountdownTimer } from '@/components/arcade/CountdownTimer';
import { ProgressBar } from '@/components/arcade/ProgressBar';

interface TournamentCardProps {
  tournament: Tournament;
  index: number;
  onJoin?: (tournament: Tournament) => void;
}

export function TournamentCard({ tournament: t, index, onJoin }: TournamentCardProps) {
  const participantPercent = (t.currentParticipants / t.maxParticipants) * 100;
  const getMatchesByTournament = useArenaStore(s => s.getMatchesByTournament);

  // Recent match results for activity dots
  const recentResults = useMemo(() => {
    if (t.status === TournamentStatus.Open) return [];
    const matches = getMatchesByTournament(t.id);
    return matches
      .filter(m => m.winner !== null || m.status === 2)
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, 8)
      .map(m => ({
        id: m.id,
        hasWinner: m.winner !== null,
        isDraw: m.winner === null && m.status === 2,
      }));
  }, [t.id, t.status, getMatchesByTournament]);

  return (
    <div
      className="animate-fade-in-up opacity-0"
      style={{ animationDelay: `${index * 0.08}s`, animationFillMode: 'forwards' }}
    >
      <ArcadeCard gameType={t.gameType} hoverable>
        <div className="flex items-start justify-between mb-3">
          <GameTypeBadge gameType={t.gameType} size="sm" />
          <StatusIndicator status={t.status} />
        </div>

        <h3 className="font-pixel text-[10px] text-white mb-1 tracking-wide leading-relaxed">
          {t.name}
        </h3>
        <p className="text-[10px] text-gray-500 mb-4">
          {FORMAT_LABELS[t.format]} &middot; {t.roundCount} rounds
        </p>

        {/* Prize pool + entry stake */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Coins size={14} className="text-arcade-gold" />
            <span className="font-mono text-sm font-bold text-arcade-gold">
              {formatMON(t.prizePool)}
            </span>
          </div>
          {/* Entry stake pill */}
          <div className="flex items-center gap-1 px-2 py-0.5 bg-surface-2 rounded-full">
            <Shield size={9} className="text-arcade-cyan" />
            <span className="text-[9px] font-mono text-arcade-cyan">{formatMON(t.entryStake)}</span>
          </div>
        </div>

        {/* ROI indicator */}
        {(() => {
          const prize = parseFloat(t.prizePool);
          const stake = parseFloat(t.entryStake);
          const roi = stake > 0 ? ((prize * 0.6 - stake) / stake * 100) : 0;
          return roi !== 0 ? (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[8px] text-gray-600">1ST ROI</span>
              <div className="flex-1 h-1 bg-surface-0 rounded-full overflow-hidden">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all duration-500',
                    roi > 100 ? 'bg-arcade-green/70' : roi > 0 ? 'bg-arcade-gold/70' : 'bg-arcade-red/50'
                  )}
                  style={{ width: `${Math.min(100, Math.max(5, roi / 5))}%` }}
                />
              </div>
              <span className={clsx(
                'text-[9px] font-mono font-bold',
                roi > 0 ? 'text-arcade-green' : 'text-arcade-red'
              )}>
                {roi > 0 ? '+' : ''}{roi.toFixed(0)}%
              </span>
            </div>
          ) : null;
        })()}

        {/* Participants */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Users size={12} />
              {t.currentParticipants}/{t.maxParticipants}
            </span>
            {(t.status === TournamentStatus.Active || t.status === TournamentStatus.Paused) && (
              <span className="text-[10px] font-mono text-gray-500">
                Round {t.currentRound}/{t.roundCount}
              </span>
            )}
          </div>
          <ProgressBar
            value={participantPercent}
            color={t.status === TournamentStatus.Active ? 'green' : t.status === TournamentStatus.Paused ? 'gold' : 'cyan'}
          />
        </div>

        {/* Recent match activity dots */}
        {recentResults.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[9px] text-gray-600 mr-1">Recent</span>
            {recentResults.map((r, i) => (
              <div
                key={r.id}
                className={clsx(
                  'w-2 h-2 rounded-full transition-all',
                  r.hasWinner ? 'bg-arcade-green' : 'bg-gray-600',
                  i === 0 && 'animate-pulse',
                )}
                title={`Match #${r.id}: ${r.hasWinner ? 'Decided' : 'Draw'}`}
              />
            ))}
          </div>
        )}

        {/* Countdown for open tournaments */}
        {t.status === TournamentStatus.Open && (
          <div className="mb-3">
            <span className="text-[10px] text-gray-500 block mb-1">STARTS IN</span>
            <CountdownTimer targetTime={t.startTime} compact />
          </div>
        )}

        {/* Action button */}
        <div className="mt-4">
          {t.status === TournamentStatus.Open && (
            <NeonButton
              variant="insert-coin"
              className="w-full text-[9px]"
              onClick={() => onJoin?.(t)}
            >
              INSERT COIN &middot; {formatMON(t.entryStake)}
            </NeonButton>
          )}
          {t.status === TournamentStatus.Active && (
            <Link to={`/tournament/${t.id}`}>
              <NeonButton variant="neon" color="green" className="w-full">
                SPECTATE
              </NeonButton>
            </Link>
          )}
          {t.status === TournamentStatus.Completed && (
            <Link to={`/tournament/${t.id}`}>
              <NeonButton variant="secondary" className="w-full">
                VIEW RESULTS
              </NeonButton>
            </Link>
          )}
          {t.status === TournamentStatus.Paused && (
            <Link to={`/tournament/${t.id}`}>
              <NeonButton variant="neon" color="pink" className="w-full">
                PAUSED — VIEW
              </NeonButton>
            </Link>
          )}
          {t.status === TournamentStatus.Cancelled && (
            <NeonButton variant="secondary" className="w-full opacity-50" disabled>
              CANCELLED
            </NeonButton>
          )}
        </div>
      </ArcadeCard>
    </div>
  );
}
