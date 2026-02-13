import { useState } from 'react';
import clsx from 'clsx';
import { useBettingStore } from '@/stores/bettingStore';
import { TrendingUp } from 'lucide-react';

interface BetSlipProps {
  player1Handle?: string;
  player2Handle?: string;
  className?: string;
  onClose?: () => void;
}

const PRESET_AMOUNTS = ['0.01', '0.05', '0.1', '0.5', '1'];

export function BetSlip({ player1Handle, player2Handle, className, onClose }: BetSlipProps) {
  const {
    pendingBetMatchId,
    pendingPrediction,
    pendingBetAmount,
    pendingOdds,
    updatePendingAmount,
    clearPendingBet,
    submitBet,
    placingBet,
    error,
    matchPools,
    getPotentialPayout,
  } = useBettingStore();

  const [customAmount, setCustomAmount] = useState('');

  if (!pendingBetMatchId || !pendingPrediction) {
    return null;
  }

  const pool = matchPools[pendingBetMatchId];
  const selectedPlayer = pendingPrediction === pool?.player1 ? player1Handle || 'Player 1' : player2Handle || 'Player 2';
  const potentialPayout = getPotentialPayout(pendingBetAmount, pendingOdds || '1');

  const handleAmountSelect = (amount: string) => {
    updatePendingAmount(amount);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (value: string) => {
    setCustomAmount(value);
    updatePendingAmount(value);
  };

  const handleSubmit = async () => {
    const success = await submitBet();
    if (success && onClose) {
      onClose();
    }
  };

  const handleCancel = () => {
    clearPendingBet();
    if (onClose) {
      onClose();
    }
  };

  const isValidAmount = parseFloat(pendingBetAmount) >= 0.01 && parseFloat(pendingBetAmount) <= 100;

  return (
    <div
      className={clsx(
        'bg-surface-1 border border-arcade-purple/30 rounded-xl p-4',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-arcade-purple">
          Bet Slip
        </h3>
        <button
          onClick={handleCancel}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Selection */}
      <div className="bg-surface-2 rounded-lg p-3 mb-4">
        <div className="text-xs text-gray-400 mb-1">Your Pick</div>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white">{selectedPlayer}</span>
          <span className="font-mono text-arcade-cyan">
            @ {pendingOdds || '...'}
          </span>
        </div>
      </div>

      {/* Amount selection */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">Bet Amount (ETH)</div>

        {/* Preset buttons */}
        <div className="flex gap-2 mb-3">
          {PRESET_AMOUNTS.map(amount => (
            <button
              key={amount}
              onClick={() => handleAmountSelect(amount)}
              className={clsx(
                'flex-1 py-2 rounded-lg text-xs font-bold transition-all',
                pendingBetAmount === amount && !customAmount
                  ? 'bg-arcade-purple text-white'
                  : 'bg-surface-2 text-gray-300 hover:bg-surface-2/80',
              )}
            >
              {amount}
            </button>
          ))}
        </div>

        {/* Custom amount input */}
        <div className="relative">
          <input
            type="number"
            value={customAmount}
            onChange={(e) => handleCustomAmountChange(e.target.value)}
            placeholder="Custom amount"
            min="0.01"
            max="100"
            step="0.01"
            className={clsx(
              'w-full bg-surface-2 border rounded-lg px-3 py-2 text-sm font-mono',
              'focus:outline-none focus:ring-1',
              'border-gray-600 focus:border-arcade-purple focus:ring-arcade-purple/30',
            )}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            ETH
          </span>
        </div>

        {/* Amount validation */}
        {pendingBetAmount && !isValidAmount && (
          <p className="text-xs text-arcade-red mt-1">
            Amount must be between 0.01 and 100 ETH
          </p>
        )}
      </div>

      {/* Potential payout with multiplier */}
      <div className="bg-surface-2 rounded-lg p-3 mb-4 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-400">Potential Payout</span>
          <span className="font-mono font-bold text-arcade-gold">
            {parseFloat(potentialPayout).toFixed(4)} ETH
          </span>
        </div>
        {/* Multiplier + profit display */}
        {isValidAmount && parseFloat(pendingBetAmount) > 0 && (() => {
          const bet = parseFloat(pendingBetAmount);
          const payout = parseFloat(potentialPayout);
          const multiplier = bet > 0 ? payout / bet : 0;
          const profit = payout - bet;
          // Risk level: higher multiplier = higher risk
          const riskPct = Math.min(1, (multiplier - 1) / 9);
          const riskLabel = riskPct < 0.3 ? 'LOW' : riskPct < 0.6 ? 'MED' : 'HIGH';
          const riskColor = riskPct < 0.3 ? 'text-arcade-green' : riskPct < 0.6 ? 'text-arcade-gold' : 'text-arcade-red';
          const riskBarColor = riskPct < 0.3 ? '#69f0ae' : riskPct < 0.6 ? '#ffd740' : '#ff5252';
          return (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={12} className="text-arcade-green" />
                  <span className="text-xs text-gray-400">Profit</span>
                </div>
                <span className="font-mono text-sm text-arcade-green font-bold">
                  +{profit.toFixed(4)} ETH
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Multiplier</span>
                <span className="font-mono text-sm text-arcade-purple font-bold">
                  {multiplier.toFixed(2)}x
                </span>
              </div>
              {/* Risk gauge */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-gray-600 uppercase tracking-wider">RISK</span>
                  <span className={clsx('text-[9px] font-pixel font-bold', riskColor)}>
                    {riskLabel}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-0 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${riskPct * 100}%`, background: riskBarColor }}
                  />
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-arcade-red/10 border border-arcade-red/30 rounded-lg p-3 mb-4">
          <p className="text-xs text-arcade-red">{error}</p>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!isValidAmount || placingBet}
        className={clsx(
          'w-full py-3 rounded-lg font-bold uppercase tracking-wider transition-all',
          isValidAmount && !placingBet
            ? 'bg-arcade-purple text-white hover:bg-arcade-purple/80'
            : 'bg-gray-600 text-gray-400 cursor-not-allowed',
        )}
      >
        {placingBet ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Placing Bet...
          </span>
        ) : (
          'Place Bet'
        )}
      </button>

      {/* Disclaimer */}
      <p className="text-[10px] text-gray-500 text-center mt-3">
        3% rake applies to winning bets. Bet responsibly.
      </p>
    </div>
  );
}
