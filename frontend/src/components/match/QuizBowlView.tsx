import clsx from 'clsx';
import { Clock, CheckCircle, XCircle, Zap, Flame, Lock } from 'lucide-react';
import { ProgressBar } from '@/components/arcade/ProgressBar';

interface QuizBowlViewProps {
  currentQuestion: {
    index: number;
    question: string;
    options: string[];
    difficulty: 'easy' | 'medium' | 'hard';
    category: string;
    correctAnswer?: number;
  } | null;
  totalQuestions: number;
  answeredCount: number;
  player1Score: number;
  player2Score: number;
  timeRemaining?: number;
  totalTime?: number;
  resolved: boolean;
  player1Streak?: number;
  player2Streak?: number;
  // Interactive props
  canAnswer?: boolean;
  selectedAnswer?: number | null;
  answerLocked?: boolean;
  onAnswerSelect?: (index: number) => void;
}

const difficultyColors = {
  easy: 'text-arcade-green bg-arcade-green/10 border-arcade-green/30',
  medium: 'text-arcade-gold bg-arcade-gold/10 border-arcade-gold/30',
  hard: 'text-arcade-red bg-arcade-red/10 border-arcade-red/30',
};

const optionLabels = ['A', 'B', 'C', 'D'];

export function QuizBowlView({
  currentQuestion,
  totalQuestions,
  answeredCount,
  player1Score,
  player2Score,
  timeRemaining,
  totalTime,
  resolved,
  player1Streak = 0,
  player2Streak = 0,
  canAnswer = false,
  selectedAnswer = null,
  answerLocked = false,
  onAnswerSelect,
}: QuizBowlViewProps) {
  const p1Leading = player1Score > player2Score;
  const p2Leading = player2Score > player1Score;
  const isInteractive = canAnswer && !resolved && !answerLocked && onAnswerSelect;
  return (
    <div className="arcade-card">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-pixel text-[9px] text-gray-500 tracking-wider">BRAIN BLAST</h4>
        <span className="font-pixel text-[9px] text-arcade-green">
          Q {answeredCount + 1}/{totalQuestions}
        </span>
      </div>

      {/* Progress */}
      <ProgressBar
        value={(answeredCount / totalQuestions) * 100}
        color="green"
        className="mb-4"
      />

      {currentQuestion ? (
        <>
          {/* Difficulty */}
          <div className="flex items-center gap-2 mb-3">
            <span className={clsx(
              'inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border',
              difficultyColors[currentQuestion.difficulty],
            )}>
              {currentQuestion.difficulty}
            </span>
            {/* Difficulty dots */}
            <div className="flex items-center gap-0.5">
              {[1, 2, 3].map(d => {
                const active = d <= (currentQuestion.difficulty === 'easy' ? 1 : currentQuestion.difficulty === 'medium' ? 2 : 3);
                const dotColor = currentQuestion.difficulty === 'easy' ? 'bg-arcade-green' : currentQuestion.difficulty === 'medium' ? 'bg-arcade-gold' : 'bg-arcade-red';
                const glowColor = currentQuestion.difficulty === 'easy' ? 'rgba(105,240,174,0.5)' : currentQuestion.difficulty === 'medium' ? 'rgba(255,215,0,0.5)' : 'rgba(255,82,82,0.5)';
                return (
                  <div
                    key={d}
                    className={clsx(
                      'w-1.5 h-1.5 rounded-full transition-all',
                      active ? dotColor : 'bg-gray-700'
                    )}
                    style={active ? { boxShadow: `0 0 4px ${glowColor}` } : undefined}
                  />
                );
              })}
            </div>
          </div>

          {/* Category */}
          <p className="text-[10px] text-gray-500 mb-2">{currentQuestion.category}</p>

          {/* Question */}
          <p className="text-sm text-white font-medium mb-4 leading-relaxed">
            {currentQuestion.question}
          </p>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {currentQuestion.options.map((opt, i) => {
              const isCorrect = currentQuestion.correctAnswer === i;
              const isSelected = selectedAnswer === i;
              const showAsLocked = answerLocked && isSelected;

              return (
                <button
                  key={`q${currentQuestion.index}-opt${i}`}
                  type="button"
                  onClick={() => isInteractive && onAnswerSelect?.(i)}
                  disabled={!isInteractive}
                  className={clsx(
                    'flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                    // Interactive states
                    isInteractive && 'cursor-pointer hover:bg-arcade-purple/10 hover:border-arcade-purple/30',
                    // Selected state (before lock)
                    isSelected && !answerLocked && !resolved && 'bg-arcade-purple/15 border-arcade-purple/40 ring-1 ring-arcade-purple shadow-[0_0_15px_rgba(139,92,246,0.2)]',
                    // Locked state
                    showAsLocked && 'bg-arcade-cyan/10 border-arcade-cyan/40',
                    // Resolved correct
                    resolved && isCorrect && 'bg-arcade-green/10 border-arcade-green/30',
                    // Resolved wrong (if was selected)
                    resolved && !isCorrect && isSelected && 'bg-arcade-red/10 border-arcade-red/30',
                    // Default
                    !isSelected && !resolved && !showAsLocked && 'bg-surface-1 border-white/[0.06]',
                    // Disabled appearance
                    !isInteractive && !isSelected && !resolved && 'cursor-default',
                  )}
                >
                  <span className={clsx(
                    'font-pixel text-[10px] w-4',
                    isSelected ? 'text-arcade-purple' : 'text-gray-500',
                    showAsLocked && 'text-arcade-cyan',
                    resolved && isCorrect && 'text-arcade-green',
                  )}>
                    {optionLabels[i]}
                  </span>
                  <span className={clsx(
                    'text-sm flex-1',
                    isSelected && !resolved ? 'text-white' : 'text-gray-300',
                  )}>
                    {opt}
                  </span>
                  {/* Locked indicator */}
                  {showAsLocked && !resolved && (
                    <Lock size={14} className="text-arcade-cyan" />
                  )}
                  {/* Resolved indicators */}
                  {resolved && isCorrect && <CheckCircle size={14} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.5))' }} />}
                  {resolved && !isCorrect && currentQuestion.correctAnswer !== undefined && (
                    <XCircle size={14} className="text-gray-600" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Locked in message */}
          {answerLocked && !resolved && (
            <div className="flex items-center justify-center gap-2 mb-4 p-2 bg-arcade-cyan/10 border border-arcade-cyan/30 rounded-lg">
              <Lock size={12} className="text-arcade-cyan" />
              <span className="font-pixel text-[10px] text-arcade-cyan">ANSWER LOCKED IN</span>
            </div>
          )}

          {/* Timer + Speed Bonus */}
          {timeRemaining !== undefined && totalTime && !resolved && (
            <div>
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-gray-500" style={{ filter: 'drop-shadow(0 0 2px rgba(150,150,150,0.3))' }} />
                <ProgressBar
                  value={(timeRemaining / totalTime) * 100}
                  color={timeRemaining < 5 ? 'red' : 'cyan'}
                  className="flex-1"
                />
                <span className="font-mono text-xs text-gray-400">{timeRemaining}s</span>
              </div>
              {timeRemaining > totalTime * 0.7 && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <Zap size={10} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.5))' }} />
                  <span className="text-[9px] font-pixel text-arcade-gold">SPEED BONUS x2</span>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-8">
          <p className="font-pixel text-xs text-gray-600">
            {resolved ? 'QUIZ COMPLETE' : 'LOADING QUESTION...'}
          </p>
        </div>
      )}

      {/* Scores */}
      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        {/* Score comparison bar */}
        {(player1Score > 0 || player2Score > 0) && (() => {
          const total = player1Score + player2Score;
          const p1Pct = total > 0 ? (player1Score / total) * 100 : 50;
          return (
            <div className="mb-3">
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[8px] font-mono text-arcade-cyan">{player1Score}</span>
                <div className="flex-1 h-2 bg-surface-1 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-arcade-cyan/70 rounded-l-full transition-all duration-500"
                    style={{ width: `${p1Pct}%` }}
                  />
                  <div
                    className="h-full bg-arcade-pink/70 rounded-r-full transition-all duration-500"
                    style={{ width: `${100 - p1Pct}%` }}
                  />
                </div>
                <span className="text-[8px] font-mono text-arcade-pink">{player2Score}</span>
              </div>
            </div>
          );
        })()}

        <div className="flex justify-between">
          <div>
            <span className="text-[10px] text-gray-500">P1 SCORE</span>
            <p
              className={clsx(
                'font-mono text-lg font-bold',
                p1Leading ? 'text-arcade-green' : 'text-white',
              )}
              style={p1Leading ? { textShadow: '0 0 8px rgba(105,240,174,0.4)' } : undefined}
            >
              {player1Score}
            </p>
            {player1Streak >= 3 && (
              <div className="flex items-center gap-1 mt-1">
                <Flame size={10} className="text-arcade-orange" style={{ filter: 'drop-shadow(0 0 3px rgba(255,152,0,0.5))' }} />
                <span className="text-[9px] font-pixel text-arcade-orange" style={{ textShadow: '0 0 6px rgba(255,152,0,0.3)' }}>{player1Streak}x STREAK</span>
              </div>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-500">P2 SCORE</span>
            <p
              className={clsx(
                'font-mono text-lg font-bold',
                p2Leading ? 'text-arcade-green' : 'text-white',
              )}
              style={p2Leading ? { textShadow: '0 0 8px rgba(105,240,174,0.4)' } : undefined}
            >
              {player2Score}
            </p>
            {player2Streak >= 3 && (
              <div className="flex items-center gap-1 mt-1 justify-end">
                <Flame size={10} className="text-arcade-orange" style={{ filter: 'drop-shadow(0 0 3px rgba(255,152,0,0.5))' }} />
                <span className="text-[9px] font-pixel text-arcade-orange" style={{ textShadow: '0 0 6px rgba(255,152,0,0.3)' }}>{player2Streak}x STREAK</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
