import { useMemo } from 'react';
import clsx from 'clsx';
import { Shield, Sword, Loader2, Check, HeartHandshake, Swords } from 'lucide-react';
import { StrategyMove } from '@/types/arena';
import { NeonButton } from '@/components/arcade/NeonButton';

interface StrategyViewProps {
  rounds: Array<{
    round: number;
    player1Move: StrategyMove;
    player2Move: StrategyMove;
    player1Payoff: number;
    player2Payoff: number;
    resolved: boolean;
  }>;
  currentRound: number;
  player1Total: number;
  player2Total: number;
  // Interactive props (optional for backward compatibility)
  canSubmit?: boolean;
  pendingMove?: StrategyMove | null;
  submitting?: boolean;
  submitted?: boolean;
  onMoveSelect?: (move: StrategyMove) => void;
  onCommit?: () => void;
}

function MoveIcon({ move, resolved }: { move: StrategyMove; resolved: boolean }) {
  if (!resolved || move === StrategyMove.None) {
    return (
      <div className="w-10 h-10 rounded-lg bg-surface-1 border border-white/[0.06] flex items-center justify-center">
        <span className="text-gray-600 font-pixel text-xs">?</span>
      </div>
    );
  }

  if (move === StrategyMove.Cooperate) {
    return (
      <div className="w-10 h-10 rounded-lg bg-arcade-green/10 border border-arcade-green/30 flex items-center justify-center" style={{ boxShadow: '0 0 8px rgba(105,240,174,0.15)' }}>
        <Shield size={18} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
      </div>
    );
  }

  return (
    <div className="w-10 h-10 rounded-lg bg-arcade-red/10 border border-arcade-red/30 flex items-center justify-center" style={{ boxShadow: '0 0 8px rgba(255,82,82,0.15)' }}>
      <Sword size={18} className="text-arcade-red" style={{ filter: 'drop-shadow(0 0 3px rgba(255,82,82,0.4))' }} />
    </div>
  );
}

function getRoundOutcome(p1: StrategyMove, p2: StrategyMove): { label: string; color: string } | null {
  if (p1 === StrategyMove.None || p2 === StrategyMove.None) return null;
  if (p1 === StrategyMove.Cooperate && p2 === StrategyMove.Cooperate) return { label: 'Mutual Cooperation', color: 'text-arcade-green' };
  if (p1 === StrategyMove.Defect && p2 === StrategyMove.Defect) return { label: 'Mutual Defection', color: 'text-gray-500' };
  if (p1 === StrategyMove.Defect && p2 === StrategyMove.Cooperate) return { label: 'P1 Betrayal!', color: 'text-arcade-red' };
  return { label: 'P2 Betrayal!', color: 'text-arcade-red' };
}

// ---------------------------------------------------------------------------
// Strategy Insights — cooperation trend + trust meter + betrayal tracker
// ---------------------------------------------------------------------------
function StrategyInsights({ rounds }: { rounds: StrategyViewProps['rounds'] }) {
  const analysis = useMemo(() => {
    const resolved = rounds.filter(r => r.resolved && r.player1Move !== StrategyMove.None);
    if (resolved.length < 2) return null;

    const p1CoopCount = resolved.filter(r => r.player1Move === StrategyMove.Cooperate).length;
    const p2CoopCount = resolved.filter(r => r.player2Move === StrategyMove.Cooperate).length;
    const p1CoopPct = (p1CoopCount / resolved.length) * 100;
    const p2CoopPct = (p2CoopCount / resolved.length) * 100;

    // Betrayal count (defect when opponent cooperated)
    const p1Betrayals = resolved.filter(r => r.player1Move === StrategyMove.Defect && r.player2Move === StrategyMove.Cooperate).length;
    const p2Betrayals = resolved.filter(r => r.player2Move === StrategyMove.Defect && r.player1Move === StrategyMove.Cooperate).length;

    // Move pattern (colored blocks)
    const pattern = resolved.map(r => ({
      p1: r.player1Move === StrategyMove.Cooperate ? 'C' : 'D',
      p2: r.player2Move === StrategyMove.Cooperate ? 'C' : 'D',
    }));

    return { p1CoopPct, p2CoopPct, p1Betrayals, p2Betrayals, pattern, total: resolved.length };
  }, [rounds]);

  if (!analysis) return null;

  return (
    <div className="mb-4 p-3 bg-surface-1/50 rounded-lg border border-white/[0.04] space-y-3">
      {/* Move pattern visualization */}
      <div>
        <p className="text-[8px] text-gray-600 uppercase tracking-wider mb-1.5">MOVE PATTERN</p>
        <div className="space-y-1">
          {/* P1 pattern */}
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-gray-500 w-6">P1</span>
            <div className="flex gap-0.5">
              {analysis.pattern.map((p, i) => (
                <div
                  key={`p1-${i}`}
                  className={clsx(
                    'w-4 h-3 rounded-sm transition-all duration-150 hover:scale-150 cursor-default',
                    p.p1 === 'C' ? 'bg-arcade-green/60' : 'bg-arcade-red/60',
                  )}
                  title={`R${i + 1}: ${p.p1 === 'C' ? 'Cooperate' : 'Defect'}`}
                />
              ))}
            </div>
          </div>
          {/* P2 pattern */}
          <div className="flex items-center gap-1">
            <span className="text-[8px] text-gray-500 w-6">P2</span>
            <div className="flex gap-0.5">
              {analysis.pattern.map((p, i) => (
                <div
                  key={`p2-${i}`}
                  className={clsx(
                    'w-4 h-3 rounded-sm transition-all duration-150 hover:scale-150 cursor-default',
                    p.p2 === 'C' ? 'bg-arcade-green/60' : 'bg-arcade-red/60',
                  )}
                  title={`R${i + 1}: ${p.p2 === 'C' ? 'Cooperate' : 'Defect'}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Trust meters */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1 mb-1">
            <HeartHandshake size={9} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 2px rgba(105,240,174,0.4))' }} />
            <span className="text-[8px] text-gray-500">P1 TRUST</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-surface-0 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${analysis.p1CoopPct}%`, background: analysis.p1CoopPct > 50 ? '#69f0ae' : '#ff5252' }}
              />
            </div>
            <span className="text-[8px] font-mono text-gray-400">{analysis.p1CoopPct.toFixed(0)}%</span>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <HeartHandshake size={9} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 2px rgba(105,240,174,0.4))' }} />
            <span className="text-[8px] text-gray-500">P2 TRUST</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex-1 h-1.5 bg-surface-0 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${analysis.p2CoopPct}%`, background: analysis.p2CoopPct > 50 ? '#69f0ae' : '#ff5252' }}
              />
            </div>
            <span className="text-[8px] font-mono text-gray-400">{analysis.p2CoopPct.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Betrayal counts */}
      {(analysis.p1Betrayals > 0 || analysis.p2Betrayals > 0) && (
        <div className="flex items-center gap-3">
          <Swords size={9} className="text-arcade-red" style={{ filter: 'drop-shadow(0 0 2px rgba(255,82,82,0.4))' }} />
          <span className="text-[8px] text-gray-500">BETRAYALS:</span>
          <span className="text-[8px] font-mono text-arcade-red">
            P1: {analysis.p1Betrayals} | P2: {analysis.p2Betrayals}
          </span>
        </div>
      )}
    </div>
  );
}

export function StrategyArenaView({
  rounds,
  currentRound,
  player1Total,
  player2Total,
  canSubmit = false,
  pendingMove = null,
  submitting = false,
  submitted = false,
  onMoveSelect,
  onCommit,
}: StrategyViewProps) {
  const p1Leading = player1Total > player2Total;
  const p2Leading = player2Total > player1Total;
  const showMoveSelector = canSubmit && !submitted && onMoveSelect;

  return (
    <div className="arcade-card">
      {/* Move selector - only shown when player can submit */}
      {showMoveSelector && (
        <div className="mb-6 p-4 bg-arcade-purple/5 border border-arcade-purple/20 rounded-lg">
          <h4 className="font-pixel text-[9px] text-arcade-purple mb-4 tracking-wider text-center">
            CHOOSE YOUR MOVE
          </h4>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <button
              onClick={() => onMoveSelect(StrategyMove.Cooperate)}
              disabled={submitting}
              className={clsx(
                'p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2',
                pendingMove === StrategyMove.Cooperate
                  ? 'bg-arcade-green/20 border-arcade-green shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                  : 'bg-surface-1 border-white/[0.06] hover:border-arcade-green/50 hover:bg-arcade-green/5',
                submitting && 'opacity-50 cursor-not-allowed',
              )}
            >
              <Shield size={32} className={clsx(
                'transition-colors',
                pendingMove === StrategyMove.Cooperate ? 'text-arcade-green' : 'text-gray-400',
              )} />
              <span className={clsx(
                'font-pixel text-xs',
                pendingMove === StrategyMove.Cooperate ? 'text-arcade-green' : 'text-gray-400',
              )}>
                COOPERATE
              </span>
              <span className="text-[10px] text-gray-500">+6K if mutual</span>
            </button>
            <button
              onClick={() => onMoveSelect(StrategyMove.Defect)}
              disabled={submitting}
              className={clsx(
                'p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center gap-2',
                pendingMove === StrategyMove.Defect
                  ? 'bg-arcade-red/20 border-arcade-red shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                  : 'bg-surface-1 border-white/[0.06] hover:border-arcade-red/50 hover:bg-arcade-red/5',
                submitting && 'opacity-50 cursor-not-allowed',
              )}
            >
              <Sword size={32} className={clsx(
                'transition-colors',
                pendingMove === StrategyMove.Defect ? 'text-arcade-red' : 'text-gray-400',
              )} />
              <span className={clsx(
                'font-pixel text-xs',
                pendingMove === StrategyMove.Defect ? 'text-arcade-red' : 'text-gray-400',
              )}>
                DEFECT
              </span>
              <span className="text-[10px] text-gray-500">+10K if betrayal</span>
            </button>
          </div>
          {onCommit && (
            <NeonButton
              variant="neon"
              color={pendingMove === StrategyMove.Cooperate ? 'green' : pendingMove === StrategyMove.Defect ? 'pink' : 'purple'}
              className="w-full"
              onClick={onCommit}
              disabled={!pendingMove || submitting}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  COMMITTING...
                </span>
              ) : (
                'COMMIT MOVE'
              )}
            </NeonButton>
          )}
        </div>
      )}

      {/* Submitted confirmation */}
      {submitted && (
        <div className="mb-6 p-4 bg-arcade-green/10 border border-arcade-green/30 rounded-lg text-center">
          <Check size={24} className="text-arcade-green mx-auto mb-2" />
          <p className="font-pixel text-xs text-arcade-green">MOVE COMMITTED</p>
          <p className="text-[10px] text-gray-400 mt-1">Waiting for opponent...</p>
        </div>
      )}

      <h4 className="font-pixel text-[9px] text-gray-500 mb-4 tracking-wider">ROUND HISTORY</h4>

      {/* Payoff matrix reference */}
      <div className="mb-4 p-3 bg-surface-1 rounded-lg border border-white/[0.04]">
        <p className="text-[9px] text-gray-500 mb-2 font-bold">PAYOFF MATRIX (P1 / P2)</p>
        <div className="grid grid-cols-3 gap-1 text-[10px] font-mono max-w-xs">
          <div></div>
          <div className="text-center text-arcade-green">COOP</div>
          <div className="text-center text-arcade-red">DEFECT</div>
          <div className="text-arcade-green">COOP</div>
          <div className="text-center text-gray-400">6K/6K</div>
          <div className="text-center text-gray-400">0/10K</div>
          <div className="text-arcade-red">DEFECT</div>
          <div className="text-center text-gray-400">10K/0</div>
          <div className="text-center text-gray-400">2K/2K</div>
        </div>
      </div>

      {/* Strategy insights */}
      <StrategyInsights rounds={rounds} />

      {/* Round grid */}
      <div className="space-y-2">
        {rounds.map((r) => {
          const outcome = r.resolved ? getRoundOutcome(r.player1Move, r.player2Move) : null;

          return (
            <div key={r.round}>
              <div
                className={clsx(
                  'grid grid-cols-[2.5rem_1fr_auto_1fr] gap-3 items-center p-2 rounded-lg transition-all duration-200 hover:bg-surface-2/70',
                  r.round === currentRound && !r.resolved ? 'bg-arcade-purple/5 border border-arcade-purple/20 animate-pulse-soft' : 'bg-surface-1/50',
                )}
              >
                <span className="font-pixel text-[9px] text-gray-500">R{r.round}</span>
                <div className="flex items-center gap-2">
                  <MoveIcon move={r.player1Move} resolved={r.resolved} />
                  {r.resolved && (
                    <span className="text-xs font-mono text-gray-400">+{r.player1Payoff.toLocaleString()}</span>
                  )}
                </div>
                <span className="text-[9px] text-gray-600 font-pixel">VS</span>
                <div className="flex items-center gap-2 justify-end">
                  {r.resolved && (
                    <span className="text-xs font-mono text-gray-400">+{r.player2Payoff.toLocaleString()}</span>
                  )}
                  <MoveIcon move={r.player2Move} resolved={r.resolved} />
                </div>
              </div>
              {outcome && (
                <p className={clsx('text-[10px] font-pixel text-center mt-1', outcome.color)}>
                  {outcome.label}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="flex justify-between mt-4 pt-3 border-t border-white/[0.06]">
        <div>
          <span className="text-[10px] text-gray-500">P1 TOTAL</span>
          <p
            className={clsx(
              'font-mono text-lg font-bold',
              p1Leading ? 'text-arcade-green' : 'text-white',
            )}
            style={p1Leading ? { textShadow: '0 0 8px rgba(105,240,174,0.3)' } : undefined}
          >
            {player1Total.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-gray-500">P2 TOTAL</span>
          <p
            className={clsx(
              'font-mono text-lg font-bold',
              p2Leading ? 'text-arcade-green' : 'text-white',
            )}
            style={p2Leading ? { textShadow: '0 0 8px rgba(105,240,174,0.3)' } : undefined}
          >
            {player2Total.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
