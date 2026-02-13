import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, AlertTriangle, Clock, Play, Wifi, WifiOff, Calendar, Radio, Trophy, CheckCircle2, Zap } from 'lucide-react';
import clsx from 'clsx';
import { GameType, MatchStatus } from '@/types/arena';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { useGameActionStore } from '@/stores/gameActionStore';
import {
  fetchStrategyArenaState,
  fetchOracleDuelState,
  fetchAuctionWarsState,
  fetchQuizBowlState,
  type StrategyArenaState,
  type OracleDuelState,
  type AuctionWarsState,
  type QuizBowlState,
} from '@/lib/contracts';
import { useMatchLive, useConnectionStatus } from '@/hooks';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { NeonButton } from '@/components/arcade/NeonButton';
import { SplitScreen } from '@/components/match/SplitScreen';
import { PlayerPanel } from '@/components/match/PlayerPanel';
import { StrategyArenaView } from '@/components/match/StrategyArenaView';
import { OracleDuelView } from '@/components/match/OracleDuelView';
import { AuctionWarsView } from '@/components/match/AuctionWarsView';
import { QuizBowlView } from '@/components/match/QuizBowlView';
import { ErrorAlert } from '@/components/arcade/ErrorAlert';
import { MatchErrorBoundary, cacheMatchState } from '@/components/match/MatchErrorBoundary';
import { ShareMatchButton } from '@/components/share/ShareMatchButton';
import { BettingPanel } from '@/components/betting';
import { ReplayPlayer } from '@/components/replay';
import { MatchCommentary } from '@/components/match/MatchCommentary';
import { MatchChat } from '@/components/match/MatchChat';
import { VictoryConfetti } from '@/components/match/VictoryConfetti';

// Timeout thresholds for warnings
const STALE_THRESHOLD_MS = 15000; // 15 seconds without update = stale warning
const CRITICAL_THRESHOLD_MS = 30000; // 30 seconds without update = critical warning

// Helper to format time since last refresh
function formatTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export function LiveMatchView() {
  const { id } = useParams<{ id: string }>();
  const matchId = Number(id);
  const allMatches = useArenaStore(s => s.allMatches);
  const loading = useArenaStore(s => s.loading);
  const { tournaments } = useArenaStore();
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);
  const match = allMatches.find(m => m.id === matchId);

  // Game-specific state
  const [strategyState, setStrategyState] = useState<StrategyArenaState | null>(null);
  const [oracleState, setOracleState] = useState<OracleDuelState | null>(null);
  const [auctionState, setAuctionState] = useState<AuctionWarsState | null>(null);
  const [quizState, setQuizState] = useState<QuizBowlState | null>(null);

  // Polling state for live matches
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds for live matches

  // Track staleness for timeout warnings
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeSinceRefresh = lastRefresh ? now - lastRefresh.getTime() : 0;
  const isStale = lastRefresh && timeSinceRefresh > STALE_THRESHOLD_MS;
  const isCritical = lastRefresh && timeSinceRefresh > CRITICAL_THRESHOLD_MS;

  // Game action store
  const {
    pendingMove,
    pendingBids,
    pendingAnswer,
    pendingPrediction,
    submitting,
    lastSubmitSuccess,
    setActiveMatch,
    setPendingMove,
    setPendingBid,
    setPendingAnswer,
    setPendingPrediction,
    submitMove,
    submitBids,
    submitAnswer,
    submitPrediction,
  } = useGameActionStore();

  // Set active match on mount/change
  useEffect(() => {
    setActiveMatch(matchId);
    return () => setActiveMatch(null);
  }, [matchId, setActiveMatch]);

  // Determine game type from tournament (need this before guard)
  const tournament = tournaments.find(t => t.id === match?.tournamentId);
  const gameType = tournament?.gameType ?? GameType.StrategyArena;

  // WebSocket real-time updates
  const {
    isSubscribed: wsSubscribed,
  } = useMatchLive(matchId, {
    onStateChange: () => {
      // Update last refresh time when we get WebSocket updates
      setLastRefresh(new Date());
      setFetchError(null);
      setConsecutiveFailures(0);
    },
    onCompleted: (result) => {
      // Match completed via WebSocket
      console.log('[LiveMatchView] Match completed via WebSocket:', result);
    },
  });

  // Connection status for UI indicator
  const { isConnected } = useConnectionStatus();

  // Fetch game-specific state function
  const fetchGameState = useCallback(async () => {
    if (!match) return;

    setIsPolling(true);
    try {
      let fetchedState: unknown = null;
      switch (gameType) {
        case GameType.StrategyArena:
          fetchedState = await fetchStrategyArenaState(matchId);
          setStrategyState(fetchedState as StrategyArenaState);
          break;
        case GameType.OracleDuel:
          fetchedState = await fetchOracleDuelState(matchId);
          setOracleState(fetchedState as OracleDuelState);
          break;
        case GameType.AuctionWars:
          fetchedState = await fetchAuctionWarsState(matchId);
          setAuctionState(fetchedState as AuctionWarsState);
          break;
        case GameType.QuizBowl:
          fetchedState = await fetchQuizBowlState(matchId);
          setQuizState(fetchedState as QuizBowlState);
          break;
      }

      // Cache state for error boundary recovery
      if (fetchedState) {
        cacheMatchState(matchId, { gameType, state: fetchedState });
      }

      setLastRefresh(new Date());
      setFetchError(null);
      setConsecutiveFailures(0);
    } catch (err) {
      console.error('[LiveMatchView] Fetch failed:', err);
      setConsecutiveFailures(prev => prev + 1);
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch match state');
    } finally {
      setIsPolling(false);
    }
  }, [matchId, match, gameType]);

  // Initial fetch and polling setup for live matches
  // When WebSocket is connected, reduce polling to fallback-only (every 15s)
  // When WebSocket is disconnected, poll more frequently (every 5s)
  useEffect(() => {
    if (!match) return;

    // Initial fetch
    fetchGameState();

    // Only poll if match is in progress (live)
    const isLiveMatch = match.status === MatchStatus.InProgress;
    if (isLiveMatch) {
      // Use slower polling when WebSocket is connected (it provides real-time updates)
      const pollInterval = isConnected ? 15000 : POLL_INTERVAL_MS;
      pollIntervalRef.current = setInterval(fetchGameState, pollInterval);
    }

    // Cleanup on unmount or when match changes
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [matchId, match?.status, fetchGameState, isConnected]);

  if (!match) {
    if (loading) {
      return (
        <div className="animate-pulse space-y-6">
          <div className="h-4 bg-surface-2 rounded w-32" />
          <div className="h-8 bg-surface-2 rounded w-48" />
          <div className="grid grid-cols-2 gap-6">
            <div className="arcade-card p-6 space-y-3">
              <div className="h-10 w-10 bg-surface-1 rounded-lg" />
              <div className="h-4 bg-surface-1 rounded w-3/4" />
              <div className="h-3 bg-surface-1 rounded w-1/2" />
            </div>
            <div className="arcade-card p-6 space-y-3">
              <div className="h-10 w-10 bg-surface-1 rounded-lg ml-auto" />
              <div className="h-4 bg-surface-1 rounded w-3/4 ml-auto" />
              <div className="h-3 bg-surface-1 rounded w-1/2 ml-auto" />
            </div>
          </div>
        </div>
      );
    }
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
  const isLive = match.status === MatchStatus.InProgress;
  const isComplete = match.status === MatchStatus.Completed;

  // Replay state
  const [showReplay, setShowReplay] = useState(false);

  // Confetti — show once when match is completed with a winner
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredRef = useRef(false);
  useEffect(() => {
    if (isComplete && match.winner && !confettiFiredRef.current) {
      confettiFiredRef.current = true;
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, match.winner]);

  // For live matches, allow interaction
  const canSubmit = isLive && !submitting;

  // Track if move/answer/prediction has been submitted this session
  const moveSubmitted = lastSubmitSuccess && pendingMove === null;
  const answerLocked = lastSubmitSuccess && pendingAnswer !== null;
  const predictionLocked = lastSubmitSuccess && pendingPrediction !== null;

  return (
    <div>
      {/* Confetti on victory */}
      {showConfetti && <VictoryConfetti />}

      {/* Back */}
      <Link
        to={tournament ? `/tournament/${tournament.id}` : '/'}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={14} />
        {tournament ? `Back to ${tournament.name}` : 'Back to Lobby'}
      </Link>

      {/* Match header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <RetroHeading level={2} color="white" className="mb-0">
            ROUND {match.round}
          </RetroHeading>
          <GameTypeBadge gameType={gameType} size="sm" />
          {isLive && <GlowBadge color="green" label="LIVE" pulsing />}
          {/* WebSocket connection indicator */}
          {isLive && (
            <div className={clsx(
              'flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px]',
              isConnected && wsSubscribed ? 'text-arcade-green' : 'text-gray-500'
            )} title={isConnected ? 'WebSocket connected' : 'WebSocket disconnected'}>
              {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
              {wsSubscribed && <span className="w-1 h-1 bg-arcade-green rounded-full animate-pulse" />}
            </div>
          )}
        </div>
        <div className="flex items-center gap-4">
          {/* Live status indicator */}
          {isLive && (
            <div className={clsx(
              'flex items-center gap-2 text-xs',
              isCritical ? 'text-arcade-red' : isStale ? 'text-arcade-orange' : 'text-gray-500'
            )}>
              <RefreshCw size={12} className={isPolling ? 'animate-spin text-arcade-cyan' : ''} />
              <span>
                {isPolling ? 'Refreshing...' : lastRefresh ? `Updated ${formatTimeSince(lastRefresh)}` : 'Loading...'}
              </span>
              {isCritical && <AlertTriangle size={12} className="text-arcade-red" />}
              {isStale && !isCritical && <Clock size={12} className="text-arcade-orange" />}
            </div>
          )}
          {tournament && (
            <span className="text-xs text-gray-500">
              {tournament.name} &middot; Match #{match.id}
            </span>
          )}
          <ShareMatchButton matchId={matchId} size="sm" />
        </div>
      </div>

      {/* Error and timeout warnings */}
      {fetchError && consecutiveFailures >= 2 && (
        <ErrorAlert
          message={`Connection issue: ${fetchError}. Retrying automatically...`}
          onRetry={fetchGameState}
          className="mb-6"
        />
      )}

      {isCritical && isLive && !fetchError && (
        <div className="flex items-center gap-3 p-4 rounded-lg border bg-arcade-red/10 border-arcade-red/30 text-arcade-red mb-6">
          <AlertTriangle size={18} />
          <div className="flex-1">
            <p className="text-sm font-semibold">Connection may be lost</p>
            <p className="text-xs text-gray-400">Match data hasn't updated in over 30 seconds. The agent may have network issues.</p>
          </div>
          <button
            onClick={fetchGameState}
            disabled={isPolling}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-arcade-red/20 hover:bg-arcade-red/30 transition-colors disabled:opacity-50"
          >
            {isPolling ? 'Retrying...' : 'Retry Now'}
          </button>
        </div>
      )}

      {isStale && !isCritical && isLive && !fetchError && (
        <div className="flex items-center gap-3 p-3 rounded-lg border bg-arcade-orange/10 border-arcade-orange/30 text-arcade-orange mb-6">
          <Clock size={16} />
          <p className="text-xs">Data may be stale. Last update: {lastRefresh && formatTimeSince(lastRefresh)}</p>
        </div>
      )}

      {/* Match Status Timeline */}
      <MatchStatusTimeline status={match.status} startTime={match.startTime} duration={match.duration} />

      {/* Score Momentum Strip — shows who's leading */}
      {(isLive || isComplete) && (
        <ScoreMomentumStrip
          player1Score={
            strategyState?.player1Score ?? quizState?.player1Score ?? (match.winner === match.player1 ? 1 : 0)
          }
          player2Score={
            strategyState?.player2Score ?? quizState?.player2Score ?? (match.winner === match.player2 ? 1 : 0)
          }
          player1Handle={player1?.moltbookHandle ?? match.player1.slice(0, 8)}
          player2Handle={player2?.moltbookHandle ?? match.player2.slice(0, 8)}
          isLive={isLive}
        />
      )}

      {/* Split screen player panels */}
      <SplitScreen
        className="mb-6"
        left={
          <PlayerPanel
            agent={player1}
            address={match.player1}
            isWinner={match.winner === match.player1}
            isLoser={isComplete && match.winner !== null && match.winner !== match.player1}
            side="left"
          />
        }
        right={
          <PlayerPanel
            agent={player2}
            address={match.player2}
            isWinner={match.winner === match.player2}
            isLoser={isComplete && match.winner !== null && match.winner !== match.player2}
            side="right"
          />
        }
      />

      {/* Game-specific view based on game type - wrapped in error boundary */}
      <MatchErrorBoundary matchId={matchId} fallbackMessage="Failed to render game view">
        {gameType === GameType.StrategyArena && (
          <StrategyArenaView
            rounds={[]}
            currentRound={strategyState?.currentRound ?? match.round}
            player1Total={strategyState?.player1Score ?? 0}
            player2Total={strategyState?.player2Score ?? 0}
            canSubmit={canSubmit}
            pendingMove={pendingMove}
            submitting={submitting}
            submitted={moveSubmitted}
            onMoveSelect={setPendingMove}
            onCommit={() => submitMove(matchId)}
          />
        )}

        {gameType === GameType.OracleDuel && (
          <OracleDuelView
            tokenSymbol={oracleState?.tokenSymbol ?? "MON"}
            snapshotPrice={oracleState?.snapshotPrice ?? "0"}
            resolvedPrice={oracleState?.resolvedPrice ?? null}
            bullPlayer={match.player1}
            bearPlayer={match.player2}
            durationSeconds={300}
            resolved={oracleState?.resolved ?? isComplete}
            endTime={match.timestamp + 300 * 1000}
            canPredict={canSubmit}
            selectedPrediction={pendingPrediction}
            predictionLocked={predictionLocked}
            submitting={submitting}
            onPredictionSelect={setPendingPrediction}
            onConfirmPrediction={() => submitPrediction(matchId)}
          />
        )}

        {gameType === GameType.AuctionWars && (
          <AuctionWarsView
            boxes={Array.from({ length: auctionState?.totalBoxes ?? 0 }, (_, i) => ({
              id: String(i + 1),
              hints: [],
              revealed: auctionState?.revealed ?? isComplete,
            }))}
            bids={[]}
            resolved={auctionState?.revealed ?? isComplete}
            canBid={canSubmit}
            playerBalance="100"
            pendingBids={pendingBids}
            submitting={submitting}
            submitted={lastSubmitSuccess && Object.keys(pendingBids).length === 0}
            onBidChange={setPendingBid}
            onSubmitBids={() => submitBids(matchId)}
          />
        )}

        {gameType === GameType.QuizBowl && (
          <QuizBowlView
            currentQuestion={null}
            totalQuestions={quizState?.totalQuestions ?? 10}
            answeredCount={quizState?.currentQuestion ?? 0}
            player1Score={quizState?.player1Score ?? 0}
            player2Score={quizState?.player2Score ?? 0}
            timeRemaining={isComplete ? undefined : 30}
            totalTime={30}
            resolved={isComplete}
            player1Streak={0}
            player2Streak={0}
            canAnswer={canSubmit}
            selectedAnswer={pendingAnswer}
            answerLocked={answerLocked}
            onAnswerSelect={(index: number) => {
              setPendingAnswer(index);
              submitAnswer(matchId);
            }}
          />
        )}
      </MatchErrorBoundary>

      {/* AI Commentary */}
      <MatchCommentary matchId={matchId} isLive={isLive} isComplete={isComplete} />

      {/* Live Chat for active matches */}
      {isLive && <MatchChat matchId={matchId} />}

      {/* Betting panel for live matches */}
      {isLive && (
        <div className="mt-6">
          <div className="arcade-card p-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">
              Place Your Bet
            </h3>
            <BettingPanel
              matchId={matchId}
              player1={match.player1}
              player2={match.player2}
            />
          </div>
        </div>
      )}

      {/* Match result overlay */}
      {isComplete && match.winner && !showReplay && (
        <div className="mt-6 text-center">
          <div className="inline-block arcade-card border-arcade-purple/30 px-8 py-6" style={{ boxShadow: '0 0 20px rgba(168,85,247,0.15)' }}>
            <p className="font-pixel text-lg neon-text-green animate-score-pop" style={{ textShadow: '0 0 12px rgba(105,240,174,0.4)' }}>
              WINNER!
            </p>
            <p className="text-sm text-gray-400 mt-2">
              {getAgentByAddress(match.winner)?.moltbookHandle ?? match.winner}
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setShowReplay(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-arcade-purple/20 hover:bg-arcade-purple/30 text-arcade-purple transition-colors text-sm font-semibold"
              >
                <Play size={14} />
                Watch Replay
              </button>
              <Link
                to={`/replay/${matchId}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-arcade-cyan/10 hover:bg-arcade-cyan/20 text-arcade-cyan transition-colors text-sm font-semibold"
              >
                Full Replay Page
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Replay player for completed matches */}
      {isComplete && showReplay && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
              Match Replay
            </h3>
            <div className="flex items-center gap-3">
              <Link
                to={`/replay/${matchId}`}
                className="text-xs text-arcade-cyan hover:underline"
              >
                Open Full Page
              </Link>
              <button
                onClick={() => setShowReplay(false)}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Close Replay
              </button>
            </div>
          </div>
          <ReplayPlayer
            matchId={matchId}
            onClose={() => setShowReplay(false)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score Momentum Strip — visual momentum bar showing which player is leading
// ---------------------------------------------------------------------------
function ScoreMomentumStrip({
  player1Score,
  player2Score,
  player1Handle,
  player2Handle,
  isLive,
}: {
  player1Score: number;
  player2Score: number;
  player1Handle: string;
  player2Handle: string;
  isLive: boolean;
}) {
  const total = player1Score + player2Score;
  const p1Pct = total > 0 ? (player1Score / total) * 100 : 50;
  const p2Pct = total > 0 ? (player2Score / total) * 100 : 50;
  const delta = player1Score - player2Score;
  const leader = delta > 0 ? 1 : delta < 0 ? 2 : 0;
  const absDelta = Math.abs(delta);

  // Momentum intensity: how dominant the lead is (0 = tied, 1 = blowout)
  const intensity = total > 0 ? absDelta / total : 0;

  return (
    <div className="arcade-card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className={clsx(
            leader === 1 ? 'text-arcade-cyan' : leader === 2 ? 'text-arcade-pink' : 'text-gray-500',
            isLive && leader !== 0 && 'animate-pulse',
          )} style={leader !== 0 ? { filter: `drop-shadow(0 0 3px ${leader === 1 ? 'rgba(0,229,255,0.4)' : 'rgba(255,64,129,0.4)'})` } : undefined} />
          <span className="text-[9px] font-pixel text-gray-500 tracking-wider">MOMENTUM</span>
        </div>
        {leader !== 0 && (
          <span
            className={clsx(
              'text-[10px] font-mono font-bold',
              leader === 1 ? 'text-arcade-cyan' : 'text-arcade-pink',
            )}
            style={{ textShadow: `0 0 6px ${leader === 1 ? 'rgba(0,229,255,0.3)' : 'rgba(255,64,129,0.3)'}` }}
          >
            {leader === 1 ? player1Handle : player2Handle} +{absDelta}
          </span>
        )}
        {leader === 0 && total > 0 && (
          <span className="text-[10px] font-mono text-gray-500">TIED</span>
        )}
      </div>

      {/* Momentum bar */}
      <div className="relative h-4 rounded-full overflow-hidden bg-surface-1 flex">
        {/* P1 side (left, cyan) */}
        <div
          className="h-full transition-all duration-700 ease-out relative"
          style={{ width: `${p1Pct}%` }}
        >
          <div
            className="absolute inset-0 rounded-l-full"
            style={{
              background: `linear-gradient(90deg, rgba(0,229,255,${0.15 + intensity * 0.55}), rgba(0,229,255,${0.3 + intensity * 0.5}))`,
            }}
          />
          {isLive && leader === 1 && (
            <div className="absolute inset-0 rounded-l-full animate-pulse"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.3))' }}
            />
          )}
        </div>
        {/* P2 side (right, pink) */}
        <div
          className="h-full transition-all duration-700 ease-out relative"
          style={{ width: `${p2Pct}%` }}
        >
          <div
            className="absolute inset-0 rounded-r-full"
            style={{
              background: `linear-gradient(90deg, rgba(255,64,129,${0.3 + intensity * 0.5}), rgba(255,64,129,${0.15 + intensity * 0.55}))`,
            }}
          />
          {isLive && leader === 2 && (
            <div className="absolute inset-0 rounded-r-full animate-pulse"
              style={{ background: 'linear-gradient(270deg, transparent, rgba(255,64,129,0.3))' }}
            />
          )}
        </div>
        {/* Center divider */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/20 -translate-x-0.5" />
      </div>

      {/* Score labels */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <span className={clsx(
            'text-xs font-mono font-bold',
            leader === 1 ? 'text-arcade-cyan' : 'text-gray-400',
          )}>
            {player1Score}
          </span>
          <span className="text-[9px] text-gray-600 truncate max-w-[80px]">
            {player1Handle}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-600 truncate max-w-[80px] text-right">
            {player2Handle}
          </span>
          <span className={clsx(
            'text-xs font-mono font-bold',
            leader === 2 ? 'text-arcade-pink' : 'text-gray-400',
          )}>
            {player2Score}
          </span>
        </div>
      </div>

      {/* Intensity dots */}
      {total > 0 && (
        <div className="flex items-center justify-center gap-1 mt-2">
          {Array.from({ length: 5 }, (_, i) => {
            const threshold = (i + 1) * 0.2;
            const active = intensity >= threshold;
            return (
              <div
                key={i}
                className={clsx(
                  'w-1.5 h-1.5 rounded-full transition-all',
                  active
                    ? leader === 1 ? 'bg-arcade-cyan' : 'bg-arcade-pink'
                    : 'bg-gray-700',
                  active && i === 4 && isLive && 'animate-pulse',
                )}
                style={active && i >= 3 ? { boxShadow: `0 0 4px ${leader === 1 ? 'rgba(0,229,255,0.4)' : 'rgba(255,64,129,0.4)'}` } : undefined}
              />
            );
          })}
          <span className="text-[8px] text-gray-600 ml-1">
            {intensity < 0.2 ? 'CLOSE' : intensity < 0.5 ? 'LEADING' : 'DOMINANT'}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match Status Timeline — horizontal stepper showing match phase progression
// ---------------------------------------------------------------------------
function MatchStatusTimeline({
  status,
  startTime,
  duration,
}: {
  status: MatchStatus;
  startTime?: number;
  duration?: number;
}) {
  const steps = [
    { label: 'Scheduled', icon: Calendar, status: MatchStatus.Scheduled },
    { label: 'In Progress', icon: Radio, status: MatchStatus.InProgress },
    { label: 'Completed', icon: Trophy, status: MatchStatus.Completed },
  ];

  const currentIdx = status === MatchStatus.Disputed ? 2 : steps.findIndex(s => s.status === status);

  return (
    <div className="arcade-card p-4 mb-6">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => {
          const isActive = i === currentIdx;
          const isPast = i < currentIdx;
          const Icon = step.icon;

          return (
            <div key={step.label} className="flex items-center flex-1">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={clsx(
                    'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                    isActive && 'border-arcade-green bg-arcade-green/20 text-arcade-green animate-pulse',
                    isPast && 'border-arcade-purple bg-arcade-purple/20 text-arcade-purple',
                    !isActive && !isPast && 'border-gray-700 bg-surface-1 text-gray-600',
                  )}
                  style={isActive ? { boxShadow: '0 0 10px rgba(105,240,174,0.25)' } : isPast ? { boxShadow: '0 0 8px rgba(168,85,247,0.15)' } : undefined}
                >
                  {isPast ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <Icon size={14} />
                  )}
                </div>
                <span
                  className={clsx(
                    'text-[9px] font-pixel tracking-wider',
                    isActive ? 'text-arcade-green' : isPast ? 'text-arcade-purple' : 'text-gray-600',
                  )}
                >
                  {step.label.toUpperCase()}
                </span>
                {/* Timestamp info */}
                {i === 0 && startTime && (
                  <span className="text-[8px] text-gray-600">
                    {new Date(startTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {i === 2 && isPast && duration != null && duration > 0 && (
                  <span className="text-[8px] text-gray-600">
                    {Math.floor(duration / 60)}m {duration % 60}s
                  </span>
                )}
              </div>

              {/* Connector line between steps */}
              {i < steps.length - 1 && (
                <div className="flex-1 mx-3">
                  <div
                    className={clsx(
                      'h-0.5 w-full rounded-full transition-all',
                      isPast ? 'bg-arcade-purple' : 'bg-gray-700',
                    )}
                    style={isPast ? { boxShadow: '0 0 4px rgba(168,85,247,0.3)' } : undefined}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
