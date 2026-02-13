import clsx from 'clsx';
import { TrendingUp, TrendingDown, Clock, Loader2, Check } from 'lucide-react';
import { CountdownTimer } from '@/components/arcade/CountdownTimer';
import { truncateAddress } from '@/constants/ui';
import { useAgentStore } from '@/stores/agentStore';
import { NeonButton } from '@/components/arcade/NeonButton';

interface OracleDuelViewProps {
  tokenSymbol: string;
  snapshotPrice: string;
  resolvedPrice: string | null;
  bullPlayer: string;
  bearPlayer: string;
  durationSeconds: number;
  resolved: boolean;
  endTime: number;
  // Interactive props
  canPredict?: boolean;
  selectedPrediction?: 'bull' | 'bear' | null;
  predictionLocked?: boolean;
  submitting?: boolean;
  onPredictionSelect?: (prediction: 'bull' | 'bear') => void;
  onConfirmPrediction?: () => void;
}

export function OracleDuelView({
  tokenSymbol,
  snapshotPrice,
  resolvedPrice,
  bullPlayer,
  bearPlayer,
  resolved,
  endTime,
  canPredict = false,
  selectedPrediction = null,
  predictionLocked = false,
  submitting = false,
  onPredictionSelect,
  onConfirmPrediction,
}: OracleDuelViewProps) {
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);
  const priceUp = resolvedPrice ? parseFloat(resolvedPrice) > parseFloat(snapshotPrice) : null;

  const bullAgent = getAgentByAddress(bullPlayer);
  const bearAgent = getAgentByAddress(bearPlayer);
  const bullName = bullAgent?.moltbookHandle ?? truncateAddress(bullPlayer);
  const bearName = bearAgent?.moltbookHandle ?? truncateAddress(bearPlayer);

  const priceChange = resolvedPrice
    ? (((parseFloat(resolvedPrice) - parseFloat(snapshotPrice)) / parseFloat(snapshotPrice)) * 100).toFixed(2)
    : null;

  const isInteractive = canPredict && !resolved && !predictionLocked && onPredictionSelect;

  return (
    <div className="arcade-card">
      <h4 className="font-pixel text-[9px] text-gray-500 mb-4 tracking-wider">PRICE PROPHECY</h4>

      {/* Token display */}
      <div className="text-center mb-6">
        <p className="font-pixel text-lg neon-text-gold mb-1">${tokenSymbol}</p>
        <p className="text-xs text-gray-500">Snapshot Price</p>
        <p className="font-mono text-2xl font-bold text-white mt-1">{snapshotPrice}</p>
      </div>

      {/* Prediction locked message */}
      {predictionLocked && !resolved && (
        <div className="mb-4 p-4 bg-arcade-green/10 border border-arcade-green/30 rounded-lg text-center">
          <Check size={24} className="text-arcade-green mx-auto mb-2" />
          <p className="font-pixel text-xs text-arcade-green">
            PREDICTION: {selectedPrediction?.toUpperCase()}
          </p>
          <p className="text-[10px] text-gray-400 mt-1">Waiting for resolution...</p>
        </div>
      )}

      {/* Bull vs Bear */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          type="button"
          onClick={() => isInteractive && onPredictionSelect?.('bull')}
          disabled={!isInteractive}
          className={clsx(
            'p-4 rounded-lg border text-center transition-all duration-200',
            // Interactive hover
            isInteractive && 'cursor-pointer hover:bg-arcade-green/10 hover:border-arcade-green/40',
            // Selected state
            selectedPrediction === 'bull' && !predictionLocked && !resolved && 'bg-arcade-green/15 border-arcade-green/50 ring-2 ring-arcade-green shadow-[0_0_20px_rgba(34,197,94,0.3)]',
            // Locked state
            predictionLocked && selectedPrediction === 'bull' && 'bg-arcade-green/20 border-arcade-green/50',
            // Resolved winner
            resolved && priceUp === true && 'bg-arcade-green/10 border-arcade-green/30',
            // Default
            !selectedPrediction && !resolved && 'bg-surface-1 border-white/[0.06]',
            selectedPrediction === 'bear' && !resolved && 'bg-surface-1 border-white/[0.06] opacity-60',
          )}
        >
          <TrendingUp size={24} className="text-arcade-green mx-auto mb-2" />
          <p className="font-pixel text-[9px] text-arcade-green mb-1">BULL</p>
          <p className="text-[10px] text-gray-400">Price goes UP</p>
          <p className="text-[10px] text-gray-500 font-mono mt-2 truncate">{bullName}</p>
        </button>
        <button
          type="button"
          onClick={() => isInteractive && onPredictionSelect?.('bear')}
          disabled={!isInteractive}
          className={clsx(
            'p-4 rounded-lg border text-center transition-all duration-200',
            // Interactive hover
            isInteractive && 'cursor-pointer hover:bg-arcade-red/10 hover:border-arcade-red/40',
            // Selected state
            selectedPrediction === 'bear' && !predictionLocked && !resolved && 'bg-arcade-red/15 border-arcade-red/50 ring-2 ring-arcade-red shadow-[0_0_20px_rgba(239,68,68,0.3)]',
            // Locked state
            predictionLocked && selectedPrediction === 'bear' && 'bg-arcade-red/20 border-arcade-red/50',
            // Resolved winner
            resolved && priceUp === false && 'bg-arcade-red/10 border-arcade-red/30',
            // Default
            !selectedPrediction && !resolved && 'bg-surface-1 border-white/[0.06]',
            selectedPrediction === 'bull' && !resolved && 'bg-surface-1 border-white/[0.06] opacity-60',
          )}
        >
          <TrendingDown size={24} className="text-arcade-red mx-auto mb-2" />
          <p className="font-pixel text-[9px] text-arcade-red mb-1">BEAR</p>
          <p className="text-[10px] text-gray-400">Price goes DOWN</p>
          <p className="text-[10px] text-gray-500 font-mono mt-2 truncate">{bearName}</p>
        </button>
      </div>

      {/* Confirm prediction button */}
      {canPredict && !predictionLocked && !resolved && onConfirmPrediction && (
        <div className="mb-6">
          <NeonButton
            variant="neon"
            color={selectedPrediction === 'bull' ? 'green' : selectedPrediction === 'bear' ? 'pink' : 'purple'}
            className="w-full"
            onClick={onConfirmPrediction}
            disabled={!selectedPrediction || submitting}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                CONFIRMING...
              </span>
            ) : (
              'CONFIRM PREDICTION'
            )}
          </NeonButton>
        </div>
      )}

      {/* Timer or result */}
      {!resolved ? (
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 text-gray-500 mb-2">
            <Clock size={14} />
            <span className="text-xs">Time remaining</span>
          </div>
          <CountdownTimer targetTime={endTime} />
        </div>
      ) : (
        <div className="text-center">
          {/* Price movement visualization */}
          <div className="mb-3">
            <div className="flex items-center justify-center gap-3">
              <div className="text-right">
                <p className="text-[9px] text-gray-600">SNAPSHOT</p>
                <p className="font-mono text-sm text-gray-400">{snapshotPrice}</p>
              </div>
              {/* Direction arrow */}
              <div className="flex items-center gap-1">
                <div className={clsx(
                  'w-8 h-0.5 rounded',
                  priceUp ? 'bg-arcade-green' : 'bg-arcade-red',
                )} />
                <div className={clsx(
                  'w-0 h-0 border-l-[6px] border-y-[4px] border-y-transparent',
                  priceUp ? 'border-l-arcade-green' : 'border-l-arcade-red',
                )} />
              </div>
              <div className="text-left">
                <p className="text-[9px] text-gray-600">RESOLVED</p>
                <p className={clsx(
                  'font-mono text-sm font-bold',
                  priceUp ? 'text-arcade-green' : 'text-arcade-red',
                )}>
                  {resolvedPrice}
                </p>
              </div>
            </div>
          </div>

          <p className={clsx(
            'font-mono text-2xl font-bold',
            priceUp ? 'text-arcade-green' : 'text-arcade-red',
          )}>
            {resolvedPrice}
          </p>
          {priceChange && (
            <p className={clsx(
              'font-mono text-sm mt-1',
              priceUp ? 'text-arcade-green/70' : 'text-arcade-red/70',
            )}>
              {priceUp ? '+' : ''}{priceChange}%
            </p>
          )}
          <p className={clsx(
            'font-pixel text-xs mt-2',
            priceUp ? 'neon-text-green' : 'neon-text-pink',
          )}>
            {priceUp ? 'BULL WINS' : 'BEAR WINS'}
          </p>
        </div>
      )}
    </div>
  );
}
