import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Trophy, Swords } from 'lucide-react';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { NeonButton } from '@/components/arcade/NeonButton';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';
import { ShareMatchButton } from '@/components/share/ShareMatchButton';
import { ReplayPlayer, MatchAnalyticsPanel } from '@/components/replay';
import { MATCH_STATUS_CONFIG } from '@/constants/game';
import { timeAgo } from '@/utils/format';

export function ReplayPage() {
  const { id } = useParams<{ id: string }>();
  const matchId = Number(id);
  const allMatches = useArenaStore(s => s.allMatches);
  const { tournaments } = useArenaStore();
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);

  const match = allMatches.find(m => m.id === matchId);
  const tournament = match ? tournaments.find(t => t.id === match.tournamentId) : null;

  if (!match) {
    return (
      <div className="text-center py-16">
        <p className="font-pixel text-sm text-gray-600 mb-4">MATCH NOT FOUND</p>
        <Link to="/">
          <NeonButton variant="neon" color="purple">BACK TO LOBBY</NeonButton>
        </Link>
      </div>
    );
  }

  const player1 = getAgentByAddress(match.player1);
  const player2 = getAgentByAddress(match.player2);

  return (
    <div>
      <Link
        to={`/match/${matchId}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        Back to Match
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <RetroHeading level={2} color="purple" className="mb-0">
            MATCH REPLAY
          </RetroHeading>
          {tournament && <GameTypeBadge gameType={tournament.gameType} size="sm" />}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">
            {player1?.moltbookHandle ?? match.player1.slice(0, 8)} vs {player2?.moltbookHandle ?? match.player2.slice(0, 8)}
          </span>
          <ShareMatchButton matchId={matchId} size="sm" />
        </div>
      </div>

      {/* Match stats header */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-surface-1 rounded-lg overflow-x-auto">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Swords size={14} className="text-gray-500" style={{ filter: 'drop-shadow(0 0 2px rgba(168,85,247,0.3))' }} />
          <span className="text-[10px] text-gray-500 uppercase">Round {match.round}</span>
        </div>
        <div className="w-px h-6 bg-gray-700/50 flex-shrink-0" />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[9px] font-pixel px-1.5 py-0.5 rounded ${
            match.status === 2 ? 'bg-arcade-green/10 text-arcade-green' :
            match.status === 1 ? 'bg-arcade-gold/10 text-arcade-gold' :
            'bg-gray-500/10 text-gray-400'
          }`}>
            {MATCH_STATUS_CONFIG[match.status]?.label ?? 'UNKNOWN'}
          </span>
        </div>
        {match.duration && (
          <>
            <div className="w-px h-6 bg-gray-700/50 flex-shrink-0" />
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Clock size={12} className="text-gray-500" style={{ filter: 'drop-shadow(0 0 2px rgba(168,85,247,0.3))' }} />
              <span className="text-xs font-mono text-gray-400">
                {match.duration < 60 ? `${match.duration}s` : `${Math.floor(match.duration / 60)}m ${match.duration % 60}s`}
              </span>
            </div>
          </>
        )}
        {match.winner && (
          <>
            <div className="w-px h-6 bg-gray-700/50 flex-shrink-0" />
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Trophy size={12} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.5))' }} />
              <span className="text-xs font-mono text-arcade-gold" style={{ textShadow: '0 0 6px rgba(255,215,0,0.3)' }}>
                {match.winner === match.player1
                  ? (player1?.moltbookHandle ?? match.player1.slice(0, 8))
                  : (player2?.moltbookHandle ?? match.player2.slice(0, 8))}
              </span>
            </div>
          </>
        )}
        {match.timestamp > 0 && (
          <>
            <div className="w-px h-6 bg-gray-700/50 flex-shrink-0" />
            <span className="text-[10px] text-gray-600 font-mono flex-shrink-0" title={new Date(match.timestamp * 1000).toLocaleString()}>
              {timeAgo(match.timestamp * 1000)}
            </span>
          </>
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 min-w-0">
          <ReplayPlayer matchId={matchId} />
        </div>
        <MatchAnalyticsPanel />
      </div>
    </div>
  );
}
