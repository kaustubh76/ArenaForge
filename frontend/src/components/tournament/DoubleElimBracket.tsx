import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Crown, ArrowRight, Play, Shield } from 'lucide-react';
import clsx from 'clsx';
import { Bracket, BracketMatch } from '@/types/arena';
import { useAgentStore } from '@/stores/agentStore';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { truncateAddress } from '@/constants/ui';

interface DoubleElimBracketProps {
  bracket: Bracket;
  activeMatchId?: number;
}

function PlayerSlot({
  address,
  isWinner,
  isLoser,
}: {
  address: string | null;
  isWinner: boolean;
  isLoser?: boolean;
}) {
  const getAgentByAddress = useAgentStore((s) => s.getAgentByAddress);

  if (!address) {
    return (
      <div className="h-9 flex items-center px-3 bg-surface-1/50 border border-white/[0.04] rounded text-xs text-gray-600 font-mono">
        TBD
      </div>
    );
  }

  const agent = getAgentByAddress(address);
  const name = agent?.moltbookHandle ?? truncateAddress(address);

  return (
    <div
      className={clsx(
        'h-9 flex items-center justify-between px-3 rounded border transition-all text-sm hover:scale-[1.02]',
        isWinner
          ? 'bg-arcade-green/10 border-arcade-green/30 text-white'
          : isLoser
            ? 'bg-arcade-red/10 border-arcade-red/30 text-gray-500 line-through'
            : 'bg-surface-2 border-white/[0.06] text-gray-400'
      )}
      style={isWinner ? { boxShadow: '0 0 8px rgba(105,240,174,0.15)' } : undefined}
    >
      <span className="font-semibold truncate">{name}</span>
      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        {agent && (
          <span className="text-[8px] font-mono text-gray-500 flex items-center gap-0.5">
            <Shield size={8} className="text-gray-600" style={{ filter: 'drop-shadow(0 0 2px rgba(150,150,150,0.3))' }} />
            {agent.elo}
          </span>
        )}
        {isWinner && <Crown size={12} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.5))' }} />}
      </div>
    </div>
  );
}

function BracketMatchCard({
  match,
  isLive,
}: {
  match: BracketMatch;
  isLive?: boolean;
}) {
  const content = (
    <div
      className={clsx(
        'w-44 arcade-card p-2 relative transition-all duration-200 hover:scale-[1.02]',
        isLive && 'ring-1 ring-arcade-green/50 animate-pulse',
      )}
      style={isLive ? { boxShadow: '0 0 12px rgba(105,240,174,0.2)' } : undefined}
    >
      {isLive && (
        <div className="absolute -top-2 -right-2 z-10">
          <GlowBadge color="green" label="LIVE" pulsing />
        </div>
      )}
      <div className="space-y-1">
        <PlayerSlot
          address={match.player1}
          isWinner={match.winner === match.player1}
          isLoser={match.completed && match.winner === match.player2}
        />
        <div className="text-center">
          <span className="text-[8px] font-pixel text-gray-600">VS</span>
        </div>
        <PlayerSlot
          address={match.player2}
          isWinner={match.winner === match.player2}
          isLoser={match.completed && match.winner === match.player1}
        />
      </div>
      {match.completed && match.matchId && (
        <div className="flex justify-end mt-1">
          <Link
            to={`/replay/${match.matchId}`}
            className="text-arcade-cyan hover:text-white transition-colors flex items-center gap-1 text-[9px]"
            title="Watch Replay"
            onClick={(e) => e.stopPropagation()}
          >
            <Play size={10} style={{ filter: 'drop-shadow(0 0 2px rgba(0,229,255,0.4))' }} />
            Replay
          </Link>
        </div>
      )}
    </div>
  );

  if (match.matchId) {
    return (
      <Link to={`/match/${match.matchId}`} className="hover:opacity-90 transition-opacity">
        {content}
      </Link>
    );
  }

  return content;
}

export function DoubleElimBracket({ bracket, activeMatchId }: DoubleElimBracketProps) {
  const { winnersBracket, losersBracket, currentPhase } = bracket;

  // Phase completion stats
  const phaseStats = useMemo(() => {
    const wMatches = winnersBracket.flatMap(r => r.matches);
    const wCompleted = wMatches.filter(m => m.completed).length;
    const lMatches = losersBracket?.flatMap(r => r.matches) ?? [];
    const lCompleted = lMatches.filter(m => m.completed).length;
    return {
      winnersTotal: wMatches.length, winnersCompleted: wCompleted,
      losersTotal: lMatches.length, losersCompleted: lCompleted,
    };
  }, [winnersBracket, losersBracket]);

  return (
    <div className="overflow-x-auto pb-4">
      {/* Winners Bracket */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="font-pixel text-xs text-arcade-green flex items-center gap-2">
            <span className="w-2 h-2 bg-arcade-green rounded-full" />
            WINNERS BRACKET
            {currentPhase === 'winners' && (
              <span className="text-[8px] bg-arcade-green/20 px-2 py-0.5 rounded">ACTIVE</span>
            )}
          </h3>
          {phaseStats.winnersTotal > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-16 h-1.5 bg-surface-0 rounded-full overflow-hidden">
                <div
                  className="h-full bg-arcade-green/60 rounded-full transition-all duration-500"
                  style={{ width: `${(phaseStats.winnersCompleted / phaseStats.winnersTotal) * 100}%` }}
                />
              </div>
              <span className="text-[8px] font-mono text-gray-500">
                {phaseStats.winnersCompleted}/{phaseStats.winnersTotal}
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-6">
          {winnersBracket.map((round, roundIdx) => {
            const roundCompleted = round.matches.filter(m => m.completed).length;
            const roundTotal = round.matches.length;
            return (
            <div key={`winners-${round.roundNumber}`} className="flex flex-col">
              <h4 className="font-pixel text-[9px] text-gray-500 mb-1 tracking-wider text-center">
                W-ROUND {round.roundNumber}
              </h4>
              {roundTotal > 0 && (
                <div className="flex items-center justify-center gap-1 mb-3">
                  <div className="w-10 h-1 bg-surface-0 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-arcade-green/50 rounded-full"
                      style={{ width: `${(roundCompleted / roundTotal) * 100}%` }}
                    />
                  </div>
                  <span className="text-[7px] font-mono text-gray-600">{roundCompleted}/{roundTotal}</span>
                </div>
              )}
              <div className="flex flex-col justify-around flex-1 gap-4">
                {round.matches.map((match, matchIdx) => (
                  <BracketMatchCard
                    key={`w-${roundIdx}-${matchIdx}`}
                    match={match}
                    isLive={match.matchId === activeMatchId}
                  />
                ))}
              </div>
            </div>
          );
          })}
        </div>
      </div>

      {/* Losers Bracket */}
      {losersBracket && losersBracket.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="font-pixel text-xs text-arcade-red flex items-center gap-2">
              <span className="w-2 h-2 bg-arcade-red rounded-full" />
              LOSERS BRACKET
              {currentPhase === 'losers' && (
                <span className="text-[8px] bg-arcade-red/20 px-2 py-0.5 rounded">ACTIVE</span>
              )}
            </h3>
            {phaseStats.losersTotal > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-16 h-1.5 bg-surface-0 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-arcade-red/60 rounded-full transition-all duration-500"
                    style={{ width: `${(phaseStats.losersCompleted / phaseStats.losersTotal) * 100}%` }}
                  />
                </div>
                <span className="text-[8px] font-mono text-gray-500">
                  {phaseStats.losersCompleted}/{phaseStats.losersTotal}
                </span>
              </div>
            )}
          </div>
          <div className="flex gap-6">
            {losersBracket.map((round, roundIdx) => {
              const roundCompleted = round.matches.filter(m => m.completed).length;
              const roundTotal = round.matches.length;
              return (
              <div key={`losers-${round.roundNumber}`} className="flex flex-col">
                <h4 className="font-pixel text-[9px] text-gray-500 mb-1 tracking-wider text-center">
                  L-ROUND {round.roundNumber}
                </h4>
                {roundTotal > 0 && (
                  <div className="flex items-center justify-center gap-1 mb-3">
                    <div className="w-10 h-1 bg-surface-0 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-arcade-red/50 rounded-full"
                        style={{ width: `${(roundCompleted / roundTotal) * 100}%` }}
                      />
                    </div>
                    <span className="text-[7px] font-mono text-gray-600">{roundCompleted}/{roundTotal}</span>
                  </div>
                )}
                <div className="flex flex-col justify-around flex-1 gap-4">
                  {round.matches.map((match, matchIdx) => (
                    <BracketMatchCard
                      key={`l-${roundIdx}-${matchIdx}`}
                      match={match}
                      isLive={match.matchId === activeMatchId}
                    />
                  ))}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grand Finals indicator */}
      {currentPhase === 'finals' && (
        <div className="flex items-center gap-4">
          <h3 className="font-pixel text-xs text-arcade-gold flex items-center gap-2">
            <Crown size={14} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.5))' }} />
            GRAND FINALS
          </h3>
          <ArrowRight size={16} className="text-gray-500" />
          <div className="text-xs text-gray-400">
            Winners bracket champion vs Losers bracket champion
          </div>
        </div>
      )}
    </div>
  );
}
