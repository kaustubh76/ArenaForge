import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Trophy, Target, Zap, TrendingUp, Check, X, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { usePredictionsStore } from '@/stores/predictionsStore';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { NeonButton } from '@/components/arcade/NeonButton';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { ProgressBar } from '@/components/arcade/ProgressBar';
import { Breadcrumbs } from '@/components/arcade/Breadcrumbs';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { TournamentStatus, MatchStatus } from '@/types/arena';
import { truncateAddress } from '@/constants/ui';

export function PredictionsPage() {
  const tournaments = useArenaStore(s => s.tournaments);
  const allMatches = useArenaStore(s => s.allMatches);
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);
  const {
    predictions,
    addPrediction,
    getPredictionForMatch,
    resolveAll,
    getStats,
  } = usePredictionsStore();

  const [expandedTournament, setExpandedTournament] = useState<number | null>(null);

  // Auto-resolve predictions based on completed matches
  useMemo(() => {
    const completedMatches = allMatches
      .filter(m => m.status === MatchStatus.Completed && m.winner)
      .map(m => ({ id: m.id, winner: m.winner }));
    if (completedMatches.length > 0) {
      resolveAll(completedMatches);
    }
  }, [allMatches, resolveAll]);

  const stats = getStats();

  // Active tournaments (Open or Active) with upcoming matches
  const activeTournaments = useMemo(() => {
    return tournaments
      .filter(t => t.status === TournamentStatus.Active || t.status === TournamentStatus.Open)
      .sort((a, b) => b.startTime - a.startTime);
  }, [tournaments]);

  // Completed tournaments with predictions
  const completedTournaments = useMemo(() => {
    const predTournamentIds = new Set(predictions.map(p => p.tournamentId));
    return tournaments
      .filter(t => t.status === TournamentStatus.Completed && predTournamentIds.has(t.id))
      .sort((a, b) => b.startTime - a.startTime);
  }, [tournaments, predictions]);

  const getHandle = (addr: string) =>
    getAgentByAddress(addr)?.moltbookHandle ?? truncateAddress(addr);

  return (
    <div>
      <Breadcrumbs crumbs={[{ label: 'Predictions' }]} />
      <RetroHeading level={1} color="cyan" subtitle="Predict match outcomes">
        BRACKET PREDICTIONS
      </RetroHeading>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        <div className="arcade-card p-4 text-center">
          <Target size={18} className="mx-auto mb-2 text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
          <div className="text-xl font-bold text-white font-mono">{stats.total}</div>
          <div className="text-[10px] text-gray-500 uppercase">Predictions</div>
        </div>
        <div className="arcade-card p-4 text-center">
          <Check size={18} className="mx-auto mb-2 text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
          <div className="text-xl font-bold text-arcade-green font-mono">{stats.correct}</div>
          <div className="text-[10px] text-gray-500 uppercase">Correct</div>
        </div>
        <div className="arcade-card p-4 text-center">
          <TrendingUp size={18} className="mx-auto mb-2 text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
          <div className="text-xl font-bold text-arcade-gold font-mono" style={{ textShadow: '0 0 8px rgba(255,215,0,0.3)' }}>
            {stats.accuracy.toFixed(1)}%
          </div>
          <div className="text-[10px] text-gray-500 uppercase">Accuracy</div>
        </div>
        <div className="arcade-card p-4 text-center">
          <Zap size={18} className="mx-auto mb-2 text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
          <div className="text-xl font-bold text-arcade-purple font-mono">{stats.streak}</div>
          <div className="text-[10px] text-gray-500 uppercase">Streak</div>
        </div>
        <div className="arcade-card p-4 text-center col-span-2 sm:col-span-1">
          <Clock size={18} className="mx-auto mb-2 text-gray-400" />
          <div className="text-xl font-bold text-gray-300 font-mono">{stats.total - stats.resolved}</div>
          <div className="text-[10px] text-gray-500 uppercase">Pending</div>
        </div>
      </div>

      {/* Accuracy bar */}
      {stats.resolved > 0 && (
        <div className="arcade-card p-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Overall Accuracy</span>
            <span className="text-sm font-mono font-bold text-arcade-gold">
              {stats.correct}/{stats.resolved}
            </span>
          </div>
          <ProgressBar
            value={stats.accuracy}
            color={stats.accuracy >= 60 ? 'green' : stats.accuracy >= 40 ? 'gold' : 'red'}
          />
        </div>
      )}

      {/* Active Tournaments */}
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
        <Zap size={14} className="text-arcade-cyan" />
        Active Tournaments
      </h2>

      {activeTournaments.length === 0 ? (
        <div className="arcade-card p-8 text-center mb-8">
          <Trophy size={32} className="mx-auto text-gray-600 mb-3" />
          <p className="text-sm text-gray-400 mb-4">No active tournaments to predict on right now.</p>
          <Link to="/">
            <NeonButton variant="neon" color="purple">BROWSE ARENA</NeonButton>
          </Link>
        </div>
      ) : (
        <div className="space-y-3 mb-8">
          {activeTournaments.map(tournament => {
            const tournamentMatches = allMatches.filter(m => m.tournamentId === tournament.id);
            const unpredicted = tournamentMatches.filter(
              m => m.status !== MatchStatus.Completed && !getPredictionForMatch(m.id)
            );
            const isExpanded = expandedTournament === tournament.id;

            return (
              <div key={tournament.id} className="arcade-card overflow-hidden">
                <button
                  onClick={() => setExpandedTournament(isExpanded ? null : tournament.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <GameTypeBadge gameType={tournament.gameType} size="sm" />
                    <div className="text-left">
                      <div className="text-sm font-bold text-white">{tournament.name}</div>
                      <div className="text-[10px] text-gray-500">
                        Round {tournament.currentRound}/{tournament.roundCount} &middot;
                        {tournamentMatches.length} matches
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {unpredicted.length > 0 && (
                      <GlowBadge color="cyan" label={`${unpredicted.length} open`} />
                    )}
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] p-4 space-y-2">
                    {tournamentMatches
                      .sort((a, b) => a.round - b.round || a.id - b.id)
                      .map(match => {
                        const prediction = getPredictionForMatch(match.id);
                        const isCompleted = match.status === MatchStatus.Completed;
                        const isLive = match.status === MatchStatus.InProgress;

                        return (
                          <MatchPredictionRow
                            key={match.id}
                            matchId={match.id}
                            round={match.round}
                            player1={match.player1}
                            player2={match.player2}
                            winner={match.winner}
                            isCompleted={isCompleted}
                            isLive={isLive}
                            prediction={prediction}
                            getHandle={getHandle}
                            getAgent={getAgentByAddress}
                            onPredict={(winner) => addPrediction(tournament.id, match.id, winner)}
                          />
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed Predictions History */}
      {completedTournaments.length > 0 && (
        <>
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Trophy size={14} className="text-arcade-gold" />
            Past Predictions
          </h2>

          <div className="space-y-3">
            {completedTournaments.map(tournament => {
              const preds = predictions.filter(p => p.tournamentId === tournament.id);
              const correctCount = preds.filter(p => p.correct).length;
              const accuracy = preds.length > 0 ? (correctCount / preds.length) * 100 : 0;

              return (
                <Link
                  key={tournament.id}
                  to={`/tournament/${tournament.id}`}
                  className="arcade-card p-4 flex items-center justify-between hover:bg-surface-1 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <GameTypeBadge gameType={tournament.gameType} size="sm" />
                    <div>
                      <div className="text-sm font-bold text-white">{tournament.name}</div>
                      <div className="text-[10px] text-gray-500">{preds.length} predictions</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={clsx(
                        'text-sm font-mono font-bold',
                        accuracy >= 60 ? 'text-arcade-green' : accuracy >= 40 ? 'text-arcade-gold' : 'text-arcade-red'
                      )}>
                        {accuracy.toFixed(0)}%
                      </div>
                      <div className="text-[9px] text-gray-500">{correctCount}/{preds.length}</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Match Prediction Row ───────────────────────────────────────────────

function MatchPredictionRow({
  matchId,
  round,
  player1,
  player2,
  winner,
  isCompleted,
  isLive,
  prediction,
  getHandle,
  getAgent,
  onPredict,
}: {
  matchId: number;
  round: number;
  player1: string;
  player2: string;
  winner: string | null;
  isCompleted: boolean;
  isLive: boolean;
  prediction: { predictedWinner: string; resolved: boolean; correct?: boolean } | undefined;
  getHandle: (addr: string) => string;
  getAgent: (addr: string) => { moltbookHandle: string; agentAddress: string; elo: number; avatarUrl?: string } | undefined;
  onPredict: (winner: string) => void;
}) {
  const agent1 = getAgent(player1);
  const agent2 = getAgent(player2);
  const hasPrediction = !!prediction;
  const isCorrect = prediction?.resolved && prediction?.correct;
  const isWrong = prediction?.resolved && !prediction?.correct;

  return (
    <div className={clsx(
      'flex items-center gap-3 p-3 rounded-lg border transition-all',
      isCorrect ? 'bg-arcade-green/5 border-arcade-green/20' :
      isWrong ? 'bg-arcade-red/5 border-arcade-red/20' :
      isLive ? 'bg-arcade-gold/5 border-arcade-gold/20' :
      'bg-surface-1 border-white/[0.04]'
    )}>
      {/* Round badge */}
      <div className="text-[9px] font-pixel text-gray-500 w-6 text-center flex-shrink-0">
        R{round}
      </div>

      {/* Player 1 */}
      <button
        onClick={() => !isCompleted && !hasPrediction && onPredict(player1)}
        disabled={isCompleted || hasPrediction}
        className={clsx(
          'flex-1 flex items-center gap-2 p-2 rounded-lg transition-all',
          prediction?.predictedWinner === player1.toLowerCase()
            ? isCorrect ? 'bg-arcade-green/15 ring-1 ring-arcade-green/40' :
              isWrong ? 'bg-arcade-red/15 ring-1 ring-arcade-red/40' :
              'bg-arcade-cyan/15 ring-1 ring-arcade-cyan/40'
            : !isCompleted && !hasPrediction
              ? 'hover:bg-surface-2 cursor-pointer'
              : '',
          winner?.toLowerCase() === player1.toLowerCase() ? 'bg-arcade-green/10' : '',
        )}
      >
        <AgentAvatar handle={getHandle(player1)} avatarUrl={agent1?.avatarUrl} size="sm" />
        <div className="text-left min-w-0">
          <div className="text-xs font-bold text-white truncate">{getHandle(player1)}</div>
          {agent1 && <div className="text-[9px] text-gray-500 font-mono">{agent1.elo} ELO</div>}
        </div>
      </button>

      {/* VS / Result */}
      <div className="flex-shrink-0 w-12 text-center">
        {isCompleted ? (
          prediction ? (
            isCorrect ? (
              <Check size={16} className="mx-auto text-arcade-green" />
            ) : (
              <X size={16} className="mx-auto text-arcade-red" />
            )
          ) : (
            <span className="text-[9px] text-gray-500">DONE</span>
          )
        ) : isLive ? (
          <GlowBadge color="green" label="LIVE" />
        ) : hasPrediction ? (
          <Clock size={14} className="mx-auto text-arcade-cyan" />
        ) : (
          <span className="text-[9px] font-pixel text-gray-600">VS</span>
        )}
      </div>

      {/* Player 2 */}
      <button
        onClick={() => !isCompleted && !hasPrediction && onPredict(player2)}
        disabled={isCompleted || hasPrediction}
        className={clsx(
          'flex-1 flex items-center gap-2 p-2 rounded-lg transition-all',
          prediction?.predictedWinner === player2.toLowerCase()
            ? isCorrect ? 'bg-arcade-green/15 ring-1 ring-arcade-green/40' :
              isWrong ? 'bg-arcade-red/15 ring-1 ring-arcade-red/40' :
              'bg-arcade-cyan/15 ring-1 ring-arcade-cyan/40'
            : !isCompleted && !hasPrediction
              ? 'hover:bg-surface-2 cursor-pointer'
              : '',
          winner?.toLowerCase() === player2.toLowerCase() ? 'bg-arcade-green/10' : '',
        )}
      >
        <AgentAvatar handle={getHandle(player2)} avatarUrl={agent2?.avatarUrl} size="sm" />
        <div className="text-left min-w-0">
          <div className="text-xs font-bold text-white truncate">{getHandle(player2)}</div>
          {agent2 && <div className="text-[9px] text-gray-500 font-mono">{agent2.elo} ELO</div>}
        </div>
      </button>

      {/* Match link */}
      <Link
        to={`/match/${matchId}`}
        className="text-gray-600 hover:text-arcade-purple transition-colors flex-shrink-0"
        title="View match"
      >
        <Target size={12} />
      </Link>
    </div>
  );
}
