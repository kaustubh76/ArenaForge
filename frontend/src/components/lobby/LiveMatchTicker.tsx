import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Swords, Trophy, Shield } from 'lucide-react';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { MatchStatus, GameType, Match, AgentProfile } from '@/types/arena';
import { truncateAddress } from '@/constants/ui';
import { GameTypeIcon } from '@/components/arcade/GameTypeIcon';

interface LiveMatchTickerProps {
  className?: string;
}

function TickerItem({ match, resolveHandle, getAgent }: { match: Match; resolveHandle: (addr: string) => string; getAgent: (addr: string) => AgentProfile | undefined }) {
  const isLive = match.status === MatchStatus.InProgress;
  const gameType = (match.gameType ?? GameType.StrategyArena) as GameType;
  const p1 = resolveHandle(match.player1);
  const p2 = resolveHandle(match.player2);
  const winnerHandle = match.winner ? resolveHandle(match.winner) : null;

  // ELO gap for competitiveness indicator
  const a1 = getAgent(match.player1);
  const a2 = getAgent(match.player2);
  const eloGap = a1 && a2 ? Math.abs(a1.elo - a2.elo) : null;
  const competitiveness = eloGap !== null
    ? eloGap < 50 ? 'CLOSE' : eloGap < 150 ? 'FAIR' : 'MISMATCH'
    : null;
  const compColor = competitiveness === 'CLOSE' ? 'text-arcade-green' : competitiveness === 'FAIR' ? 'text-arcade-gold' : 'text-arcade-red';

  return (
    <Link
      to={`/match/${match.id}`}
      className={clsx(
        'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border whitespace-nowrap',
        'transition-all duration-200 hover:scale-105 shrink-0',
        isLive
          ? 'bg-arcade-green/10 border-arcade-green/30 hover:border-arcade-green/50'
          : 'bg-surface-2 border-white/[0.06] hover:border-arcade-purple/30',
      )}
      style={{
        boxShadow: isLive ? '0 0 8px rgba(105,240,174,0.12)' : undefined,
      }}
    >
      {isLive && (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-arcade-green rounded-full animate-pulse" />
          <span className="text-[9px] font-pixel text-arcade-green">LIVE</span>
        </span>
      )}
      <GameTypeIcon gameType={gameType} size={12} />
      <span className="text-xs text-gray-300 font-semibold">{p1}</span>
      <Swords size={10} className="text-gray-500" />
      <span className="text-xs text-gray-300 font-semibold">{p2}</span>
      {!isLive && winnerHandle && (
        <span className="flex items-center gap-1 text-[10px] text-arcade-gold">
          <Trophy size={10} />
          {winnerHandle}
        </span>
      )}
      {competitiveness && eloGap !== null && (
        <span
          className={clsx('flex items-center gap-0.5 text-[8px] font-bold px-1 py-0.5 rounded', compColor,
            competitiveness === 'CLOSE' && 'bg-arcade-green/10',
            competitiveness === 'FAIR' && 'bg-arcade-gold/10',
            competitiveness === 'MISMATCH' && 'bg-arcade-red/10',
          )}
        >
          <Shield size={8} />
          {competitiveness === 'CLOSE' ? '~' : `Δ${eloGap}`}
        </span>
      )}
    </Link>
  );
}

export function LiveMatchTicker({ className }: LiveMatchTickerProps) {
  const allMatches = useArenaStore(s => s.allMatches);
  const agents = useAgentStore(s => s.agents);

  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);

  const handleMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach(a => m.set(a.agentAddress.toLowerCase(), a.moltbookHandle));
    return m;
  }, [agents]);

  const resolveHandle = (address: string): string => {
    return handleMap.get(address.toLowerCase()) || truncateAddress(address);
  };

  const tickerMatches = useMemo(() => {
    const live = allMatches.filter(m => m.status === MatchStatus.InProgress);
    const completed = allMatches
      .filter(m => m.status === MatchStatus.Completed && m.timestamp > 0)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20 - live.length);
    return [...live, ...completed];
  }, [allMatches]);

  if (tickerMatches.length === 0) return null;

  return (
    <div className={clsx('relative overflow-hidden rounded-lg', className)}>
      {/* Left fade */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-surface-0 to-transparent z-10 pointer-events-none" />
      {/* Right fade */}
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-surface-0 to-transparent z-10 pointer-events-none" />

      {/* Scrolling track */}
      <div
        className="flex items-center gap-3 py-2 animate-ticker hover:[animation-play-state:paused]"
        style={{ width: 'max-content' }}
      >
        {tickerMatches.map(m => (
          <TickerItem key={`a-${m.id}`} match={m} resolveHandle={resolveHandle} getAgent={getAgentByAddress} />
        ))}
        {tickerMatches.map(m => (
          <TickerItem key={`b-${m.id}`} match={m} resolveHandle={resolveHandle} getAgent={getAgentByAddress} />
        ))}
      </div>
    </div>
  );
}
