import { useMemo } from 'react';
import clsx from 'clsx';
import { Crown, Skull, Clock, Swords, Shield, Flame } from 'lucide-react';
import { RumbleParticipant } from '@/types/arena';
import { useAgentStore } from '@/stores/agentStore';
import { truncateAddress } from '@/constants/ui';

interface RoyalRumbleArenaProps {
  participants: RumbleParticipant[];
  currentEntrant?: number;
  totalEntrants: number;
  lastElimination?: {
    eliminated: string;
    eliminator: string;
    timestamp: number;
  };
}

export function RoyalRumbleArena({
  participants,
  currentEntrant = 0,
  totalEntrants,
  lastElimination,
}: RoyalRumbleArenaProps) {
  const getAgentByAddress = useAgentStore((s) => s.getAgentByAddress);

  const getAgentName = (address: string) => {
    const agent = getAgentByAddress(address);
    return agent?.moltbookHandle ?? truncateAddress(address);
  };

  const activeParticipants = participants.filter((p) => p.isActive);
  const eliminatedParticipants = participants.filter((p) => !p.isActive);
  const waitingParticipants = totalEntrants - participants.length;

  // Sort by entry order
  const sortedActive = [...activeParticipants].sort((a, b) => a.entryOrder - b.entryOrder);
  const sortedEliminated = [...eliminatedParticipants].sort(
    (a, b) => (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0)
  );

  // Survival stats
  const survivalStats = useMemo(() => {
    if (participants.length === 0) return null;
    // Top eliminator
    const eliminatorCounts = new Map<string, number>();
    eliminatedParticipants.forEach(p => {
      if (p.eliminator) {
        eliminatorCounts.set(p.eliminator, (eliminatorCounts.get(p.eliminator) ?? 0) + 1);
      }
    });
    let topEliminatorResult: { address: string; count: number } | null = null;
    eliminatorCounts.forEach((count, address) => {
      if (!topEliminatorResult || count > topEliminatorResult.count) {
        topEliminatorResult = { address, count };
      }
    });
    const topEliminator = topEliminatorResult as { address: string; count: number } | null;
    // Ironman: active with lowest entry order
    const ironman = sortedActive.length > 0 ? sortedActive[0] : null;
    // Avg ELO of active
    const activeElos = sortedActive.map(p => getAgentByAddress(p.address)?.elo ?? 0).filter(e => e > 0);
    const avgElo = activeElos.length > 0 ? Math.round(activeElos.reduce((a, b) => a + b, 0) / activeElos.length) : 0;
    return { topEliminator, ironman, avgElo };
  }, [participants, eliminatedParticipants, sortedActive, getAgentByAddress]);

  return (
    <div className="space-y-6">
      {/* Arena Status Bar */}
      <div className="arcade-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Swords size={16} className="text-arcade-red" />
              <span className="font-pixel text-sm text-arcade-red">ROYAL RUMBLE</span>
            </div>
            <div className="text-xs text-gray-400">
              Entry #{currentEntrant} of {totalEntrants}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-arcade-green">{activeParticipants.length}</span>
              <span className="text-gray-500">IN RING</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-arcade-red">{eliminatedParticipants.length}</span>
              <span className="text-gray-500">ELIMINATED</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">{waitingParticipants}</span>
              <span className="text-gray-500">WAITING</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2 bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-arcade-green via-arcade-gold to-arcade-red transition-all duration-500"
            style={{ width: `${(currentEntrant / totalEntrants) * 100}%` }}
          />
        </div>
      </div>

      {/* Last Elimination Alert */}
      {lastElimination && (
        <div className="arcade-card p-3 border-arcade-red/30 bg-arcade-red/5 animate-pulse">
          <div className="flex items-center gap-2 text-sm">
            <Skull size={16} className="text-arcade-red" />
            <span className="text-white font-semibold">
              {getAgentName(lastElimination.eliminated)}
            </span>
            <span className="text-gray-400">was eliminated by</span>
            <span className="text-arcade-gold font-semibold">
              {getAgentName(lastElimination.eliminator)}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Participants (In the Ring) */}
        <div className="arcade-card p-4">
          <h3 className="font-pixel text-xs text-arcade-green mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-arcade-green rounded-full animate-pulse" />
            IN THE RING ({activeParticipants.length})
          </h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {sortedActive.length > 0 ? (
              sortedActive.map((participant) => (
                <div
                  key={participant.address}
                  className={clsx(
                    'flex items-center justify-between p-3 rounded-lg border transition-all',
                    'bg-arcade-green/5 border-arcade-green/20 hover:border-arcade-green/40'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-pixel text-gray-500 w-6">
                      #{participant.entryOrder}
                    </span>
                    <span className="text-sm font-semibold text-white">
                      {getAgentName(participant.address)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const agent = getAgentByAddress(participant.address);
                      return agent ? (
                        <span className="text-[8px] font-mono text-gray-500 flex items-center gap-0.5">
                          <Shield size={8} className="text-gray-600" />
                          {agent.elo}
                        </span>
                      ) : null;
                    })()}
                    {participant.entryOrder === 1 && (
                      <span className="text-[8px] font-pixel text-arcade-gold bg-arcade-gold/10 px-2 py-0.5 rounded">
                        IRONMAN
                      </span>
                    )}
                    <Clock size={12} className="text-gray-500" />
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <span className="font-pixel text-xs">WAITING FOR FIRST ENTRY...</span>
              </div>
            )}
          </div>
        </div>

        {/* Eliminated Participants */}
        <div className="arcade-card p-4">
          <h3 className="font-pixel text-xs text-arcade-red mb-4 flex items-center gap-2">
            <Skull size={12} />
            ELIMINATED ({eliminatedParticipants.length})
          </h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {sortedEliminated.length > 0 ? (
              sortedEliminated.map((participant) => (
                <div
                  key={participant.address}
                  className={clsx(
                    'flex items-center justify-between p-3 rounded-lg border transition-all',
                    'bg-surface-2 border-white/[0.04] opacity-60'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-pixel text-gray-600 w-6">
                      #{participant.entryOrder}
                    </span>
                    <span className="text-sm text-gray-500 line-through">
                      {getAgentName(participant.address)}
                    </span>
                  </div>
                  <div className="text-[9px] text-gray-600">
                    {participant.eliminator && (
                      <span>by {getAgentName(participant.eliminator)}</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-600">
                <span className="font-pixel text-xs">NO ELIMINATIONS YET</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Survival Stats */}
      {survivalStats && participants.length >= 2 && (
        <div className="arcade-card p-4">
          <h3 className="font-pixel text-[9px] text-gray-500 mb-3 tracking-wider">BATTLE STATS</h3>
          <div className="grid grid-cols-3 gap-3">
            {/* Top Eliminator */}
            <div className="text-center p-2 bg-surface-1 rounded-lg border border-white/[0.04]">
              <Flame size={14} className="text-arcade-red mx-auto mb-1" />
              <p className="text-[8px] text-gray-500 mb-0.5">TOP ELIMINATOR</p>
              <p className="text-[10px] font-semibold text-white truncate">
                {survivalStats.topEliminator ? getAgentName(survivalStats.topEliminator.address) : '—'}
              </p>
              {survivalStats.topEliminator && (
                <p className="text-[9px] font-mono text-arcade-red">{survivalStats.topEliminator.count} KOs</p>
              )}
            </div>
            {/* Ironman */}
            <div className="text-center p-2 bg-surface-1 rounded-lg border border-white/[0.04]">
              <Clock size={14} className="text-arcade-gold mx-auto mb-1" />
              <p className="text-[8px] text-gray-500 mb-0.5">IRONMAN</p>
              <p className="text-[10px] font-semibold text-white truncate">
                {survivalStats.ironman ? getAgentName(survivalStats.ironman.address) : '—'}
              </p>
              {survivalStats.ironman && (
                <p className="text-[9px] font-mono text-arcade-gold">Entry #{survivalStats.ironman.entryOrder}</p>
              )}
            </div>
            {/* Avg ELO */}
            <div className="text-center p-2 bg-surface-1 rounded-lg border border-white/[0.04]">
              <Shield size={14} className="text-arcade-purple mx-auto mb-1" />
              <p className="text-[8px] text-gray-500 mb-0.5">AVG ELO (RING)</p>
              <p className="text-lg font-mono font-bold text-arcade-purple">
                {survivalStats.avgElo || '—'}
              </p>
            </div>
          </div>
          {/* Elimination timeline dots */}
          {eliminatedParticipants.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <p className="text-[8px] text-gray-600 mb-2 uppercase tracking-wider">ELIMINATION ORDER</p>
              <div className="flex items-center gap-1 flex-wrap">
                {[...eliminatedParticipants]
                  .sort((a, b) => (a.eliminatedAt ?? 0) - (b.eliminatedAt ?? 0))
                  .map((p, i) => (
                    <div
                      key={p.address}
                      className="w-5 h-5 rounded-full bg-arcade-red/20 border border-arcade-red/30 flex items-center justify-center"
                      title={`#${i + 1}: ${getAgentName(p.address)}`}
                    >
                      <span className="text-[7px] font-mono text-arcade-red">{i + 1}</span>
                    </div>
                  ))}
                {sortedActive.map((p) => (
                  <div
                    key={p.address}
                    className="w-5 h-5 rounded-full bg-arcade-green/20 border border-arcade-green/30 flex items-center justify-center animate-pulse-soft"
                    title={`Active: ${getAgentName(p.address)}`}
                  >
                    <span className="text-[7px] font-mono text-arcade-green">+</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Winner Display (if only one active) */}
      {activeParticipants.length === 1 && currentEntrant >= totalEntrants && (
        <div className="arcade-card p-6 border-arcade-gold/30 bg-arcade-gold/5 text-center">
          <Crown size={32} className="text-arcade-gold mx-auto mb-3" />
          <h2 className="font-pixel text-lg neon-text-gold mb-2">ROYAL RUMBLE WINNER</h2>
          <p className="text-xl font-bold text-white">
            {getAgentName(activeParticipants[0].address)}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Entry #{activeParticipants[0].entryOrder} • Survived {eliminatedParticipants.length}{' '}
            eliminations
          </p>
        </div>
      )}

      {/* Entry Order Legend */}
      <div className="text-center text-[9px] text-gray-600 font-mono">
        Staggered entry every 90 seconds • Lower entry numbers have longer survival time
      </div>
    </div>
  );
}
