import { Link } from 'react-router-dom';
import { Crown, Play, Shield } from 'lucide-react';
import clsx from 'clsx';
import { TournamentWithStandings, MatchStatus } from '@/types/arena';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { truncateAddress } from '@/constants/ui';

interface BracketViewProps {
  tournament: TournamentWithStandings;
}

function PlayerSlot({ address, isWinner }: { address: string | null; isWinner: boolean }) {
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);

  if (!address) {
    return (
      <div className="h-10 flex items-center px-3 bg-surface-1/50 border border-white/[0.04] rounded text-xs text-gray-600 font-mono">
        TBD
      </div>
    );
  }

  const agent = getAgentByAddress(address);
  const name = agent?.moltbookHandle ?? truncateAddress(address);

  return (
    <div
      className={clsx(
        'h-10 flex items-center justify-between px-3 rounded border transition-all text-sm hover:scale-[1.02]',
        isWinner
          ? 'bg-arcade-green/10 border-arcade-green/30 text-white'
          : 'bg-surface-2 border-white/[0.06] text-gray-400',
      )}
      style={isWinner ? { boxShadow: '0 0 8px rgba(105,240,174,0.15)' } : undefined}
    >
      <span className="font-semibold truncate">{name}</span>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        {agent && (
          <span className="flex items-center gap-0.5 text-[9px] font-mono text-gray-500">
            <Shield size={8} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 2px rgba(168,85,247,0.4))' }} />
            {agent.elo}
          </span>
        )}
        {isWinner && <Crown size={12} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.5))' }} />}
      </div>
    </div>
  );
}

export function BracketView({ tournament }: BracketViewProps) {
  const matches = useArenaStore(s => s.getMatchesByTournament(tournament.id));

  // Group matches by round
  const roundMap = new Map<number, typeof matches>();
  matches.forEach(m => {
    const arr = roundMap.get(m.round) ?? [];
    arr.push(m);
    roundMap.set(m.round, arr);
  });

  const totalRounds = tournament.roundCount;
  const roundLabels = totalRounds === 3
    ? ['QUARTERFINALS', 'SEMIFINALS', 'FINAL']
    : totalRounds === 2
      ? ['SEMIFINALS', 'FINAL']
      : Array.from({ length: totalRounds }, (_, i) => `ROUND ${i + 1}`);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 min-w-max">
        {Array.from({ length: totalRounds }, (_, roundIdx) => {
          const round = roundIdx + 1;
          const roundMatches = roundMap.get(round) ?? [];

          const isLastRound = roundIdx === totalRounds - 1;

          return (
            <div key={round} className={clsx('flex flex-col', isLastRound && 'bracket-round-last')}>
              <h4 className="font-pixel text-[9px] text-gray-500 mb-1 tracking-wider text-center">
                {roundLabels[roundIdx]}
              </h4>
              {/* Round completion indicator */}
              {roundMatches.length > 0 && (() => {
                const completed = roundMatches.filter(m => m.status === MatchStatus.Completed).length;
                const total = roundMatches.length;
                const pct = total > 0 ? (completed / total) * 100 : 0;
                return (
                  <div className="flex items-center gap-1.5 justify-center mb-3">
                    <div className="w-12 h-1 bg-surface-1 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: pct === 100 ? '#69f0ae' : '#00e5ff',
                        }}
                      />
                    </div>
                    <span className="text-[8px] font-mono text-gray-600">{completed}/{total}</span>
                  </div>
                );
              })()}
              <div className="flex flex-col justify-around flex-1 gap-4">
                {roundMatches.length > 0 ? (
                  roundMatches.map((match, matchIdx) => (
                    <div
                      key={match.id}
                      className={clsx(
                        'relative bracket-match',
                        !isLastRound && matchIdx % 2 === 0 && 'bracket-connector-top',
                        !isLastRound && matchIdx % 2 === 1 && 'bracket-connector-bottom',
                      )}
                    >
                      {match.status === MatchStatus.InProgress && (
                        <div className="absolute -top-2 -right-2 z-10">
                          <GlowBadge color="green" label="LIVE" pulsing />
                        </div>
                      )}
                      <Link
                        to={`/match/${match.id}`}
                        className={clsx(
                          'block w-52 arcade-card p-2 hover:border-arcade-purple/30 transition-all',
                          match.status === MatchStatus.InProgress && 'ring-1 ring-arcade-green/50 animate-pulse',
                        )}
                      >
                        <div className="space-y-1.5">
                          <PlayerSlot
                            address={match.player1}
                            isWinner={match.winner === match.player1}
                          />
                          <div className="text-center">
                            <span className="text-[9px] font-pixel text-gray-600">VS</span>
                          </div>
                          <PlayerSlot
                            address={match.player2}
                            isWinner={match.winner === match.player2}
                          />
                        </div>
                        {match.winner && (
                          <div className="flex justify-end mt-1">
                            <span
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.location.href = `/replay/${match.id}`; }}
                              className="text-arcade-cyan hover:text-white transition-colors flex items-center gap-1 text-[9px] hover:scale-105"
                              title="Watch Replay"
                            >
                              <Play size={10} style={{ filter: 'drop-shadow(0 0 2px rgba(0,229,255,0.4))' }} />
                              Replay
                            </span>
                          </div>
                        )}
                      </Link>
                    </div>
                  ))
                ) : (
                  <div className="w-52 h-24 flex items-center justify-center border border-dashed border-white/[0.06] rounded-lg">
                    <span className="text-xs text-gray-600 font-mono">PENDING</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Champion slot */}
        <div className="flex flex-col justify-center">
          <h4 className="font-pixel text-[9px] text-arcade-gold mb-3 tracking-wider text-center" style={{ textShadow: '0 0 6px rgba(255,215,0,0.3)' }}>
            CHAMPION
          </h4>
          <div className="w-48 arcade-card p-4 border-arcade-gold/20 text-center" style={{ boxShadow: '0 0 12px rgba(255,215,0,0.1)' }}>
            {(() => {
              const champion = [...tournament.standings]
                .sort((a, b) => b.tournamentPoints - a.tournamentPoints)
                .find(s => !s.eliminated && s.tournamentPoints > 0);
              return champion ? (
                <div>
                  <Crown size={24} className="text-arcade-gold mx-auto mb-2" style={{ filter: 'drop-shadow(0 0 5px rgba(255,215,0,0.5))' }} />
                  <p className="font-pixel text-[10px] neon-text-gold" style={{ textShadow: '0 0 8px rgba(255,215,0,0.4)' }}>
                    {champion.handle}
                  </p>
                </div>
              ) : (
                <div>
                  <span className="text-xs text-gray-600 font-pixel">?</span>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
