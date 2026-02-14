import { useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { Crown } from 'lucide-react';
import { useReplayStore } from '@/stores/replayStore';
import { useAgentStore } from '@/stores/agentStore';
import { ShimmerLoader } from '@/components/arcade/ShimmerLoader';
import { TimelineScrubber } from './TimelineScrubber';
import { PlaybackControls } from './PlaybackControls';
import { GameType, type ReplayRound } from '@/types/arena';

interface ReplayPlayerProps {
  matchId: number;
  className?: string;
  onClose?: () => void;
}

export function ReplayPlayer({ matchId, className, onClose }: ReplayPlayerProps) {
  const {
    currentReplay,
    currentRoundIndex,
    loading,
    error,
    loadReplay,
    unloadReplay,
    getCurrentRound,
    togglePlayback,
    prevRound,
    nextRound,
  } = useReplayStore();

  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);

  useEffect(() => {
    loadReplay(matchId);
    return () => unloadReplay();
  }, [matchId, loadReplay, unloadReplay]);

  // Keyboard shortcuts: Space=play/pause, ←=prev, →=next
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip if user is typing in an input
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlayback();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prevRound();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextRound();
        break;
    }
  }, [togglePlayback, prevRound, nextRound]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const currentRound = getCurrentRound();

  if (loading) {
    return (
      <div className={clsx('bg-surface-1 rounded-xl p-8', className)}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <ShimmerLoader width="w-40" height="h-6" />
            <ShimmerLoader width="w-24" height="h-4" />
          </div>
          <ShimmerLoader width="w-full" height="h-48" variant="card" />
          <ShimmerLoader width="w-full" height="h-8" />
          <div className="flex justify-center gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <ShimmerLoader key={i} variant="circle" width="w-10" height="h-10" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx('bg-surface-1 rounded-xl p-8', className)}>
        <div className="text-center">
          <div className="text-arcade-red text-lg mb-2">Failed to load replay</div>
          <p className="text-gray-400 text-sm">{error}</p>
          {onClose && (
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-surface-2 rounded-lg text-sm hover:bg-surface-2/80 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!currentReplay) {
    return (
      <div className={clsx('bg-surface-1 rounded-xl p-8 text-center', className)}>
        <p className="text-gray-400">No replay available</p>
      </div>
    );
  }

  const p1Agent = getAgentByAddress(currentReplay.player1);
  const p2Agent = getAgentByAddress(currentReplay.player2);
  const p1Name = p1Agent?.moltbookHandle ?? currentReplay.player1.slice(0, 8);
  const p2Name = p2Agent?.moltbookHandle ?? currentReplay.player2.slice(0, 8);
  const totalRounds = currentReplay.rounds.length;

  return (
    <div
      className={clsx(
        'bg-surface-1 border border-gray-700 rounded-xl overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-arcade-purple font-bold uppercase tracking-wider text-sm" style={{ textShadow: '0 0 6px rgba(168,85,247,0.3)' }}>
            Match Replay
          </span>
          <span className="text-xs text-gray-400">
            Match #{currentReplay.matchId}
          </span>
          <GameTypePill gameType={currentReplay.gameType} />
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Scoreboard */}
      <div className="grid grid-cols-3 gap-4 px-4 py-4 bg-surface-2/50">
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1">{p1Name}</div>
          <div
            className={clsx(
              'text-3xl font-mono font-bold',
              currentReplay.winner === currentReplay.player1 ? 'text-arcade-green' : 'text-arcade-cyan'
            )}
            style={{ textShadow: currentReplay.winner === currentReplay.player1 ? '0 0 8px rgba(105,240,174,0.3)' : '0 0 8px rgba(0,229,255,0.3)' }}
          >
            {currentRound?.player1Score ?? 0}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center">
          <div className="text-xs text-gray-500 uppercase tracking-wider">
            Round {currentRoundIndex + 1}/{totalRounds}
          </div>
          <div className="text-gray-500 text-lg font-bold">VS</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-400 mb-1">{p2Name}</div>
          <div
            className={clsx(
              'text-3xl font-mono font-bold',
              currentReplay.winner === currentReplay.player2 ? 'text-arcade-green' : 'text-arcade-pink'
            )}
            style={{ textShadow: currentReplay.winner === currentReplay.player2 ? '0 0 8px rgba(105,240,174,0.3)' : '0 0 8px rgba(236,72,153,0.3)' }}
          >
            {currentRound?.player2Score ?? 0}
          </div>
        </div>
      </div>

      {/* Score progression bar */}
      {totalRounds > 1 && (
        <ScoreProgressionBar
          rounds={currentReplay.rounds}
          currentIndex={currentRoundIndex}
        />
      )}

      {/* Round result dots */}
      {totalRounds > 1 && (
        <div className="px-4 py-2 bg-surface-2/20 border-b border-gray-700/50">
          <div className="flex items-center gap-1 justify-center">
            <span className="text-[8px] text-gray-600 mr-1">Rounds</span>
            {currentReplay.rounds.map((r, i) => {
              const p1Won = r.player1Score > r.player2Score;
              const p2Won = r.player2Score > r.player1Score;
              const isCurrent = i === currentRoundIndex;
              return (
                <div
                  key={i}
                  className={clsx(
                    'w-2.5 h-2.5 rounded-full transition-all',
                    p1Won ? 'bg-arcade-cyan/70' : p2Won ? 'bg-arcade-pink/70' : 'bg-gray-600/50',
                    isCurrent && 'ring-1 ring-white/40 scale-125',
                    i > currentRoundIndex && 'opacity-30'
                  )}
                  title={`Round ${i + 1}: ${r.player1Score}-${r.player2Score}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Game-specific round content */}
      <div className="p-6">
        {currentRound ? (
          <RoundDisplay
            round={currentRound}
            roundNumber={currentRoundIndex + 1}
            gameType={currentReplay.gameType}
            p1Name={p1Name}
            p2Name={p2Name}
          />
        ) : (
          <div className="text-center py-8 text-gray-400">
            No round data available
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="px-6 pb-4">
        <TimelineScrubber />
      </div>

      {/* Playback controls */}
      <div className="px-6 py-4 bg-surface-2/50 border-t border-gray-700">
        <PlaybackControls />
        <div className="flex justify-center gap-4 mt-2 text-[9px] text-gray-600">
          <span><kbd className="px-1 py-0.5 bg-surface-3 rounded text-[8px]">Space</kbd> Play/Pause</span>
          <span><kbd className="px-1 py-0.5 bg-surface-3 rounded text-[8px]">&larr;</kbd> Prev</span>
          <span><kbd className="px-1 py-0.5 bg-surface-3 rounded text-[8px]">&rarr;</kbd> Next</span>
        </div>
      </div>

      {/* Match result */}
      {currentReplay.winner && (() => {
        const winnerName = currentReplay.winner === currentReplay.player1 ? p1Name : p2Name;
        const p1Score = currentReplay.rounds[currentReplay.rounds.length - 1]?.player1Score ?? 0;
        const p2Score = currentReplay.rounds[currentReplay.rounds.length - 1]?.player2Score ?? 0;
        return (
          <div className="px-4 py-3 bg-arcade-gold/10 border-t border-arcade-gold/30">
            <div className="flex items-center justify-center gap-2">
              <Crown size={16} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.4))' }} />
              <span className="font-pixel text-sm text-arcade-gold uppercase tracking-wider" style={{ textShadow: '0 0 8px rgba(255,215,0,0.3)' }}>
                {winnerName}
              </span>
              <span className="font-mono text-xs text-gray-400">
                {p1Score}–{p2Score}
              </span>
              <Crown size={16} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 4px rgba(255,215,0,0.4))' }} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game Type Pill
// ---------------------------------------------------------------------------

const GAME_TYPE_LABELS: Record<number, { label: string; color: string }> = {
  [GameType.StrategyArena]: { label: 'Strategy Arena', color: 'text-arcade-cyan bg-arcade-cyan/10' },
  [GameType.OracleDuel]: { label: 'Oracle Duel', color: 'text-arcade-orange bg-arcade-orange/10' },
  [GameType.AuctionWars]: { label: 'Auction Wars', color: 'text-arcade-pink bg-arcade-pink/10' },
  [GameType.QuizBowl]: { label: 'Quiz Bowl', color: 'text-arcade-green bg-arcade-green/10' },
};

function GameTypePill({ gameType }: { gameType: GameType }) {
  const info = GAME_TYPE_LABELS[gameType];
  if (!info) return null;
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider', info.color)}>
      {info.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Score Progression Bar (mini chart showing score trend across rounds)
// ---------------------------------------------------------------------------

function ScoreProgressionBar({
  rounds,
  currentIndex,
}: {
  rounds: ReplayRound[];
  currentIndex: number;
}) {
  const maxScore = Math.max(
    1,
    ...rounds.map(r => Math.max(r.player1Score, r.player2Score))
  );

  return (
    <div className="px-4 py-2 bg-surface-2/30 border-b border-gray-700/50">
      <div className="flex items-end gap-0.5 h-8">
        {rounds.map((r, i) => {
          const p1H = (r.player1Score / maxScore) * 100;
          const p2H = (r.player2Score / maxScore) * 100;
          const isCurrent = i === currentIndex;
          const isPast = i <= currentIndex;
          return (
            <div
              key={i}
              className={clsx(
                'flex-1 flex gap-px items-end transition-opacity',
                isPast ? 'opacity-100' : 'opacity-30',
              )}
            >
              <div
                className={clsx(
                  'flex-1 rounded-t-sm transition-all',
                  isCurrent ? 'bg-arcade-cyan' : 'bg-arcade-cyan/50',
                )}
                style={{ height: `${Math.max(p1H, 4)}%` }}
              />
              <div
                className={clsx(
                  'flex-1 rounded-t-sm transition-all',
                  isCurrent ? 'bg-arcade-pink' : 'bg-arcade-pink/50',
                )}
                style={{ height: `${Math.max(p2H, 4)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round Display - routes to game-specific view
// ---------------------------------------------------------------------------

interface RoundDisplayProps {
  round: ReplayRound;
  roundNumber: number;
  gameType: GameType;
  p1Name: string;
  p2Name: string;
}

function RoundDisplay({ round, roundNumber, gameType, p1Name, p2Name }: RoundDisplayProps) {
  switch (gameType) {
    case GameType.StrategyArena:
      return <StrategyArenaRound round={round} roundNumber={roundNumber} p1Name={p1Name} p2Name={p2Name} />;
    case GameType.AuctionWars:
      return <AuctionWarsRound round={round} roundNumber={roundNumber} p1Name={p1Name} p2Name={p2Name} />;
    case GameType.QuizBowl:
      return <QuizBowlRound round={round} roundNumber={roundNumber} p1Name={p1Name} p2Name={p2Name} />;
    case GameType.OracleDuel:
      return <OracleDuelRound round={round} p1Name={p1Name} p2Name={p2Name} />;
    default:
      return <GenericRound round={round} roundNumber={roundNumber} p1Name={p1Name} p2Name={p2Name} />;
  }
}

// ---------------------------------------------------------------------------
// Strategy Arena: Cooperate / Defect with payoff matrix
// ---------------------------------------------------------------------------

const STRATEGY_MOVE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  Cooperate: { label: 'Cooperate', icon: '🤝', color: 'text-arcade-green' },
  Defect: { label: 'Defect', icon: '🗡️', color: 'text-arcade-red' },
};

function StrategyArenaRound({
  round,
  roundNumber,
  p1Name,
  p2Name,
}: {
  round: ReplayRound;
  roundNumber: number;
  p1Name: string;
  p2Name: string;
}) {
  const p1Move = typeof round.player1Action === 'string' ? round.player1Action : null;
  const p2Move = typeof round.player2Action === 'string' ? round.player2Action : null;
  const p1Info = p1Move ? STRATEGY_MOVE_LABELS[p1Move] : null;
  const p2Info = p2Move ? STRATEGY_MOVE_LABELS[p2Move] : null;

  // Determine round outcome description
  let outcomeText = '';
  if (p1Move === 'Cooperate' && p2Move === 'Cooperate') {
    outcomeText = 'Mutual Cooperation — both gain moderately';
  } else if (p1Move === 'Defect' && p2Move === 'Defect') {
    outcomeText = 'Mutual Defection — both gain little';
  } else if (p1Move === 'Defect' && p2Move === 'Cooperate') {
    outcomeText = `${p1Name} exploits ${p2Name}'s cooperation`;
  } else if (p1Move === 'Cooperate' && p2Move === 'Defect') {
    outcomeText = `${p2Name} exploits ${p1Name}'s cooperation`;
  }

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Round {roundNumber}</span>
      </div>

      {/* Move cards */}
      <div className="grid grid-cols-2 gap-4">
        <MoveCard
          name={p1Name}
          move={p1Info?.label ?? '???'}
          icon={p1Info?.icon ?? '❓'}
          colorClass={p1Info?.color ?? 'text-gray-400'}
          side="cyan"
        />
        <MoveCard
          name={p2Name}
          move={p2Info?.label ?? '???'}
          icon={p2Info?.icon ?? '❓'}
          colorClass={p2Info?.color ?? 'text-gray-400'}
          side="pink"
        />
      </div>

      {/* Outcome */}
      {outcomeText && (
        <div className="text-center text-sm text-gray-400 italic">
          {outcomeText}
        </div>
      )}

      {/* Verification hash */}
      {round.stateHash && (
        <StateHashFooter hash={round.stateHash} />
      )}
    </div>
  );
}

function MoveCard({
  name,
  move,
  icon,
  colorClass,
  side,
}: {
  name: string;
  move: string;
  icon: string;
  colorClass: string;
  side: 'cyan' | 'pink';
}) {
  return (
    <div className={clsx(
      'rounded-lg border p-4 text-center transition-all duration-200 hover:scale-[1.03]',
      side === 'cyan' ? 'border-arcade-cyan/30 bg-arcade-cyan/5' : 'border-arcade-pink/30 bg-arcade-pink/5',
    )}>
      <div className="text-xs text-gray-400 mb-2 truncate">{name}</div>
      <div className="text-3xl mb-1">{icon}</div>
      <div className={clsx('text-sm font-bold uppercase tracking-wider', colorClass)}>
        {move}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auction Wars: Bid vs Actual Value
// ---------------------------------------------------------------------------

function AuctionWarsRound({
  round,
  roundNumber,
  p1Name,
  p2Name,
}: {
  round: ReplayRound;
  roundNumber: number;
  p1Name: string;
  p2Name: string;
}) {
  const p1Data = parseAction(round.player1Action);
  const p2Data = parseAction(round.player2Action);
  const actualValue = String(p1Data?.value ?? p2Data?.value ?? '?');

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Auction Round {roundNumber}</span>
        <div className="text-sm text-gray-300 mt-1">
          Box Value: <span className="font-mono font-bold text-arcade-gold">{formatWei(actualValue)}</span>
        </div>
      </div>

      {/* Bids */}
      <div className="grid grid-cols-2 gap-4">
        <BidCard
          name={p1Name}
          bid={p1Data?.bid != null ? String(p1Data.bid) : undefined}
          actualValue={actualValue}
          side="cyan"
        />
        <BidCard
          name={p2Name}
          bid={p2Data?.bid != null ? String(p2Data.bid) : undefined}
          actualValue={actualValue}
          side="pink"
        />
      </div>

      {round.stateHash && <StateHashFooter hash={round.stateHash} />}
    </div>
  );
}

function BidCard({
  name,
  bid,
  actualValue,
  side,
}: {
  name: string;
  bid?: string;
  actualValue: string;
  side: 'cyan' | 'pink';
}) {
  const bidNum = bid ? parseFloat(bid) : 0;
  const valNum = actualValue !== '?' ? parseFloat(actualValue) : 0;
  const diff = valNum > 0 ? ((bidNum - valNum) / valNum * 100) : 0;
  const isClose = Math.abs(diff) < 10;

  return (
    <div className={clsx(
      'rounded-lg border p-4 text-center transition-all duration-200 hover:scale-[1.03]',
      side === 'cyan' ? 'border-arcade-cyan/30 bg-arcade-cyan/5' : 'border-arcade-pink/30 bg-arcade-pink/5',
    )}>
      <div className="text-xs text-gray-400 mb-2 truncate">{name}</div>
      <div className="text-2xl font-mono font-bold text-white">
        {bid ? formatWei(bid) : '—'}
      </div>
      <div className="text-[10px] mt-1">
        {bid && valNum > 0 && (
          <span className={clsx(
            'font-mono',
            isClose ? 'text-arcade-green' : Math.abs(diff) < 25 ? 'text-arcade-orange' : 'text-arcade-red',
          )}>
            {diff > 0 ? '+' : ''}{diff.toFixed(1)}% vs value
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz Bowl: Answer with correct/wrong indicator
// ---------------------------------------------------------------------------

function QuizBowlRound({
  round,
  roundNumber,
  p1Name,
  p2Name,
}: {
  round: ReplayRound;
  roundNumber: number;
  p1Name: string;
  p2Name: string;
}) {
  const p1Data = parseAction(round.player1Action);
  const p2Data = parseAction(round.player2Action);
  const category = String(p1Data?.category ?? p2Data?.category ?? '');
  const difficulty = String(p1Data?.difficulty ?? p2Data?.difficulty ?? '');
  const correctAnswer = p1Data?.correct != null ? Number(p1Data.correct) : p2Data?.correct != null ? Number(p2Data.correct) : undefined;

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Question {roundNumber}</span>
        {category && (
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-xs text-gray-300">{String(category)}</span>
            {difficulty && (
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded uppercase font-bold',
                difficulty === 'easy' ? 'bg-arcade-green/20 text-arcade-green' :
                difficulty === 'medium' ? 'bg-arcade-orange/20 text-arcade-orange' :
                'bg-arcade-red/20 text-arcade-red',
              )}>
                {String(difficulty)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Answers */}
      <div className="grid grid-cols-2 gap-4">
        <AnswerCard
          name={p1Name}
          answer={p1Data?.answer != null ? Number(p1Data.answer) : undefined}
          correct={correctAnswer}
          side="cyan"
        />
        <AnswerCard
          name={p2Name}
          answer={p2Data?.answer != null ? Number(p2Data.answer) : undefined}
          correct={correctAnswer}
          side="pink"
        />
      </div>

      {round.stateHash && <StateHashFooter hash={round.stateHash} />}
    </div>
  );
}

function AnswerCard({
  name,
  answer,
  correct,
  side,
}: {
  name: string;
  answer?: number;
  correct?: number;
  side: 'cyan' | 'pink';
}) {
  const isCorrect = answer != null && correct != null && answer === correct;
  const isWrong = answer != null && correct != null && answer !== correct;

  return (
    <div className={clsx(
      'rounded-lg border p-4 text-center transition-all duration-200 hover:scale-[1.03]',
      side === 'cyan' ? 'border-arcade-cyan/30 bg-arcade-cyan/5' : 'border-arcade-pink/30 bg-arcade-pink/5',
    )}>
      <div className="text-xs text-gray-400 mb-2 truncate">{name}</div>
      <div className="flex items-center justify-center gap-2">
        <div className="text-2xl">
          {answer == null ? '⏳' : isCorrect ? '✅' : '❌'}
        </div>
        {answer != null && (
          <span className={clsx(
            'text-sm font-bold',
            isCorrect ? 'text-arcade-green' : isWrong ? 'text-arcade-red' : 'text-gray-400',
          )}>
            Answer: {answer}
          </span>
        )}
      </div>
      {isWrong && correct != null && (
        <div className="text-[10px] text-gray-500 mt-1">
          Correct was: {correct}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Oracle Duel: Bull vs Bear with price visualization
// ---------------------------------------------------------------------------

function OracleDuelRound({
  round,
  p1Name,
  p2Name,
}: {
  round: ReplayRound;
  p1Name: string;
  p2Name: string;
}) {
  const p1Data = parseAction(round.player1Action);
  const p2Data = parseAction(round.player2Action);
  const snapshotPrice = p1Data?.snapshotPrice ?? p2Data?.snapshotPrice;
  const p1Pos = String(p1Data?.position ?? 'BULL');
  const p2Pos = String(p2Data?.position ?? 'BEAR');

  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Price Prediction</span>
        {snapshotPrice && (
          <div className="text-sm text-gray-300 mt-1">
            Snapshot: <span className="font-mono font-bold text-white">{formatWei(snapshotPrice)}</span>
          </div>
        )}
      </div>

      {/* Positions */}
      <div className="grid grid-cols-2 gap-4">
        <div className={clsx(
          'rounded-lg border p-4 text-center',
          'border-arcade-green/30 bg-arcade-green/5',
        )}>
          <div className="text-xs text-gray-400 mb-2 truncate">{p1Name}</div>
          <div className="text-3xl mb-1">{p1Pos === 'BULL' ? '📈' : '📉'}</div>
          <div className={clsx(
            'text-sm font-bold uppercase',
            p1Pos === 'BULL' ? 'text-arcade-green' : 'text-arcade-red',
          )}>
            {p1Pos}
          </div>
        </div>
        <div className={clsx(
          'rounded-lg border p-4 text-center',
          'border-arcade-red/30 bg-arcade-red/5',
        )}>
          <div className="text-xs text-gray-400 mb-2 truncate">{p2Name}</div>
          <div className="text-3xl mb-1">{p2Pos === 'BULL' ? '📈' : '📉'}</div>
          <div className={clsx(
            'text-sm font-bold uppercase',
            p2Pos === 'BULL' ? 'text-arcade-green' : 'text-arcade-red',
          )}>
            {p2Pos}
          </div>
        </div>
      </div>

      {round.stateHash && <StateHashFooter hash={round.stateHash} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generic fallback for unknown game types
// ---------------------------------------------------------------------------

function GenericRound({
  round,
  roundNumber,
  p1Name,
  p2Name,
}: {
  round: ReplayRound;
  roundNumber: number;
  p1Name: string;
  p2Name: string;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <span className="text-xs text-gray-400 uppercase tracking-wider">Round</span>
        <div className="text-3xl font-bold text-white">{roundNumber}</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-2 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">{p1Name}</div>
          <div className="text-sm font-mono text-white">
            {round.player1Action ? JSON.stringify(round.player1Action) : '—'}
          </div>
        </div>
        <div className="bg-surface-2 rounded-lg p-3">
          <div className="text-xs text-gray-400 mb-1">{p2Name}</div>
          <div className="text-sm font-mono text-white">
            {round.player2Action ? JSON.stringify(round.player2Action) : '—'}
          </div>
        </div>
      </div>

      {round.stateHash && <StateHashFooter hash={round.stateHash} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function StateHashFooter({ hash }: { hash: unknown }) {
  const hashStr = typeof hash === 'string' ? hash : '';
  if (!hashStr) return null;
  return (
    <div className="text-center mt-4">
      <span className="text-[10px] text-gray-500 font-mono">
        Verified: {hashStr.slice(0, 16)}...
      </span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAction(action: unknown): Record<string, any> | null {
  if (!action) return null;
  if (typeof action === 'object') return action as Record<string, any>;
  if (typeof action === 'string') {
    try { return JSON.parse(action); }
    catch { return null; }
  }
  return null;
}

function formatWei(value: unknown): string {
  if (value == null) return '—';
  const s = String(value);
  // If it looks like a large bigint (wei), try to convert to ETH
  if (/^\d{15,}$/.test(s)) {
    const ethValue = Number(BigInt(s)) / 1e18;
    return ethValue.toFixed(4);
  }
  // If it already looks like a decimal, format it
  const num = parseFloat(s);
  if (!isNaN(num)) {
    return num > 1000 ? num.toLocaleString() : num.toFixed(4);
  }
  return s;
}
