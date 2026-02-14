import { useState, useMemo } from 'react';
import { Package, HelpCircle, Trophy, Loader2, Check, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { BoxHint } from '@/types/game-modes';
import { useAgentStore } from '@/stores/agentStore';
import { truncateAddress } from '@/constants/ui';
import { NeonButton } from '@/components/arcade/NeonButton';

interface AuctionWarsViewProps {
  boxes: Array<{
    id: string;
    hints: BoxHint[];
    revealed: boolean;
    actualValue?: string;
  }>;
  bids: Array<{
    player: string;
    boxId: string;
    amount: string;
    revealed: boolean;
  }>;
  resolved: boolean;
  // Interactive props
  canBid?: boolean;
  playerBalance?: string;
  pendingBids?: Record<string, string>;
  submitting?: boolean;
  submitted?: boolean;
  onBidChange?: (boxId: string, amount: string) => void;
  onSubmitBids?: () => void;
}

const hintTypeLabels: Record<BoxHint['type'], string> = {
  category: 'Category',
  marketCapRange: 'Market Cap',
  age: 'Token Age',
  tradeCount: 'Trades',
};

export function AuctionWarsView({
  boxes,
  bids,
  resolved,
  canBid = false,
  playerBalance = '100',
  pendingBids = {},
  submitting = false,
  submitted = false,
  onBidChange,
  onSubmitBids,
}: AuctionWarsViewProps) {
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);
  const [localBids, setLocalBids] = useState<Record<string, string>>({});

  // Use pending bids from store if available, otherwise use local state
  const activeBids = Object.keys(pendingBids).length > 0 ? pendingBids : localBids;

  // Find highest bidder per box when resolved
  const highestBidPerBox = new Map<string, { player: string; amount: number }>();
  if (resolved) {
    bids.forEach((bid) => {
      const current = highestBidPerBox.get(bid.boxId);
      const bidAmount = parseFloat(bid.amount);
      if (!current || bidAmount > current.amount) {
        highestBidPerBox.set(bid.boxId, { player: bid.player, amount: bidAmount });
      }
    });
  }

  // Calculate total bids and validation
  const totalBidAmount = useMemo(() => {
    return Object.values(activeBids).reduce((sum, amount) => {
      const parsed = parseFloat(amount);
      return sum + (isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [activeBids]);

  const balance = parseFloat(playerBalance);
  const isOverBudget = totalBidAmount > balance;
  const hasBids = totalBidAmount > 0;

  const handleBidChange = (boxId: string, amount: string) => {
    // Only allow numbers and decimals
    if (amount && !/^\d*\.?\d*$/.test(amount)) return;

    if (onBidChange) {
      onBidChange(boxId, amount);
    } else {
      setLocalBids(prev => ({ ...prev, [boxId]: amount }));
    }
  };

  const showBidInputs = canBid && !resolved && !submitted;

  return (
    <div className="arcade-card">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-pixel text-[9px] text-gray-500 tracking-wider">BIDDING BATTLE</h4>
        {resolved && (
          <span className="font-pixel text-[9px] text-arcade-cyan">RESULTS</span>
        )}
        {showBidInputs && (
          <span className="font-pixel text-[9px] text-arcade-cyan">PLACE BIDS</span>
        )}
      </div>

      {/* Submitted confirmation */}
      {submitted && !resolved && (
        <div className="mb-4 p-4 bg-arcade-green/10 border border-arcade-green/30 rounded-lg text-center">
          <Check size={24} className="text-arcade-green mx-auto mb-2" />
          <p className="font-pixel text-xs text-arcade-green">BIDS SUBMITTED</p>
          <p className="text-[10px] text-gray-400 mt-1">Waiting for reveal...</p>
        </div>
      )}

      {/* Mystery boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {boxes.map((box) => {
          const winner = highestBidPerBox.get(box.id);
          const winnerAgent = winner ? getAgentByAddress(winner.player) : null;
          const winnerName = winnerAgent?.moltbookHandle ?? (winner ? truncateAddress(winner.player) : null);

          return (
            <div
              key={box.id}
              className={clsx(
                'p-4 rounded-lg border text-center transition-all duration-200 hover:scale-[1.02]',
                box.revealed
                  ? 'bg-arcade-cyan/5 border-arcade-cyan/30'
                  : 'bg-surface-1 border-white/[0.06]',
              )}
            >
              <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-surface-0 border border-arcade-cyan/20 flex items-center justify-center">
                {box.revealed ? (
                  <Package size={24} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 4px rgba(0,229,255,0.4))' }} />
                ) : (
                  <HelpCircle size={24} className="text-gray-600 animate-pulse-soft" style={{ filter: 'drop-shadow(0 0 3px rgba(150,150,150,0.2))' }} />
                )}
              </div>

              <p className="font-pixel text-[9px] text-arcade-cyan mb-2">BOX #{box.id}</p>

              {/* Hints */}
              <div className="space-y-1">
                {box.hints.map((hint, i) => (
                  <div key={`${hint.type}-${i}`} className="flex justify-between text-[10px]">
                    <span className="text-gray-500">{hintTypeLabels[hint.type]}</span>
                    <span className="text-gray-300 font-mono">{hint.value}</span>
                  </div>
                ))}
              </div>

              {box.revealed && box.actualValue && (
                <div className="mt-3 pt-2 border-t border-white/[0.06]">
                  <p className="text-[10px] text-gray-500">Actual Value</p>
                  <p className="font-mono text-sm font-bold text-arcade-gold" style={{ textShadow: '0 0 6px rgba(255,215,0,0.3)' }}>{box.actualValue}</p>
                </div>
              )}

              {resolved && winnerName && (
                <div className="mt-2 pt-2 border-t border-white/[0.06]">
                  <div className="flex items-center justify-center gap-1">
                    <Trophy size={10} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
                    <span className="text-[10px] text-gray-400 font-mono">{winnerName}</span>
                  </div>
                  {/* Value vs Bid indicator */}
                  {box.actualValue && winner && (() => {
                    const val = parseFloat(box.actualValue);
                    const bid = winner.amount;
                    const roi = val > 0 ? ((val - bid) / bid * 100) : 0;
                    return (
                      <div className="mt-1 flex items-center justify-center gap-1">
                        <span
                          className={clsx(
                            'text-[9px] font-mono font-bold',
                            roi >= 0 ? 'text-arcade-green' : 'text-arcade-red'
                          )}
                          style={{ textShadow: `0 0 6px ${roi >= 0 ? 'rgba(105,240,174,0.3)' : 'rgba(255,82,82,0.3)'}` }}
                        >
                          {roi >= 0 ? '+' : ''}{roi.toFixed(0)}% ROI
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Bid input */}
              {showBidInputs && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                  <label className="text-[10px] text-gray-500 block mb-1">Your Bid</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={activeBids[box.id] || ''}
                      onChange={(e) => handleBidChange(box.id, e.target.value)}
                      disabled={submitting}
                      className={clsx(
                        'w-full bg-surface-0 border rounded px-3 py-2 text-sm font-mono text-white placeholder:text-gray-600',
                        'focus:outline-none focus:ring-1',
                        submitting && 'opacity-50 cursor-not-allowed',
                        activeBids[box.id] && parseFloat(activeBids[box.id]) > 0
                          ? 'border-arcade-cyan/40 focus:ring-arcade-cyan/50'
                          : 'border-white/[0.06] focus:ring-arcade-purple/50',
                      )}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">
                      MON
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bid summary and submit */}
      {showBidInputs && (
        <div className="mb-6 p-4 bg-surface-1 rounded-lg border border-white/[0.06]">
          {/* Budget allocation bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-gray-600 uppercase tracking-wider">BUDGET ALLOCATION</span>
              <span className="text-[8px] font-mono text-gray-500">
                {((totalBidAmount / balance) * 100).toFixed(0)}% used
              </span>
            </div>
            <div className="h-2 bg-surface-0 rounded-full overflow-hidden flex">
              {boxes.map((box, i) => {
                const bid = parseFloat(activeBids[box.id] || '0');
                const pct = balance > 0 ? (bid / balance) * 100 : 0;
                const colors = ['#00e5ff', '#b388ff', '#ff4081', '#ffd740'];
                return pct > 0 ? (
                  <div
                    key={box.id}
                    className="h-full transition-all duration-300"
                    style={{ width: `${pct}%`, background: colors[i % colors.length], opacity: 0.7 }}
                    title={`Box #${box.id}: ${bid.toFixed(1)} MON`}
                  />
                ) : null;
              })}
            </div>
            {boxes.some((box) => parseFloat(activeBids[box.id] || '0') > 0) && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {boxes.map((box, i) => {
                  const bid = parseFloat(activeBids[box.id] || '0');
                  if (bid <= 0) return null;
                  const colors = ['#00e5ff', '#b388ff', '#ff4081', '#ffd740'];
                  return (
                    <div key={box.id} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-sm" style={{ background: colors[i % colors.length] }} />
                      <span className="text-[8px] text-gray-500">#{box.id}: {bid.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-gray-500">Total Allocation</span>
            <span className={clsx(
              'font-mono text-sm font-bold',
              isOverBudget ? 'text-arcade-red' : 'text-white',
            )}>
              {totalBidAmount.toFixed(1)} MON
            </span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] text-gray-500">Available Balance</span>
            <span className="font-mono text-sm text-gray-400">{balance.toFixed(1)} MON</span>
          </div>

          {isOverBudget && (
            <div className="flex items-center gap-2 mb-4 p-2 bg-arcade-red/10 border border-arcade-red/30 rounded text-arcade-red">
              <AlertCircle size={14} />
              <span className="text-[10px]">Total bids exceed balance!</span>
            </div>
          )}

          <NeonButton
            variant="neon"
            color="cyan"
            className="w-full"
            onClick={onSubmitBids}
            disabled={!hasBids || isOverBudget || submitting}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                SUBMITTING...
              </span>
            ) : (
              'SUBMIT BIDS'
            )}
          </NeonButton>
        </div>
      )}

      {/* Bids */}
      {bids.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 mb-2 font-bold uppercase">BIDS</p>
          <div className="space-y-1">
            {bids.map((bid, i) => {
              const isHighest = resolved && highestBidPerBox.get(bid.boxId)?.player === bid.player;
              const agent = getAgentByAddress(bid.player);
              const name = agent?.moltbookHandle ?? `${bid.player.slice(0, 8)}...`;

              return (
                <div
                  key={`${bid.player}-${bid.boxId}-${i}`}
                  className={clsx(
                    'flex justify-between items-center text-xs p-2 rounded transition-all duration-200 hover:bg-surface-2/70',
                    isHighest ? 'bg-arcade-green/10 border border-arcade-green/20' : 'bg-surface-1/50',
                  )}
                >
                  <span className="text-gray-400 font-mono">{name}</span>
                  <span className="text-gray-500">Box #{bid.boxId}</span>
                  <span className={clsx('font-mono font-bold', bid.revealed ? 'text-white' : 'text-gray-600')}>
                    {bid.revealed ? `${bid.amount} MON` : '???'}
                  </span>
                  {isHighest && <Trophy size={10} className="text-arcade-gold ml-1" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
