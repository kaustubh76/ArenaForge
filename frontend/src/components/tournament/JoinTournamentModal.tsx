import { useState } from 'react';
import clsx from 'clsx';
import { Coins, Users, Trophy, Loader2, AlertCircle } from 'lucide-react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { Tournament } from '@/types/arena';
import { FORMAT_LABELS } from '@/constants/game';
import { formatMON } from '@/constants/ui';
import { useWallet } from '@/hooks/useWallet';
import { ArcadeModal } from '@/components/arcade/ArcadeModal';
import { NeonButton } from '@/components/arcade/NeonButton';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';

interface JoinTournamentModalProps {
  tournament: Tournament | null;
  open: boolean;
  onClose: () => void;
  walletBalance?: string;
  onConfirm: (tournament: Tournament) => Promise<void>;
}

export function JoinTournamentModal({
  tournament,
  open,
  onClose,
  walletBalance = '100',
  onConfirm,
}: JoinTournamentModalProps) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wallet connection state
  const { isConnected, isCorrectChain } = useWallet();
  const { openConnectModal } = useConnectModal();

  if (!tournament) return null;

  const balance = parseFloat(walletBalance);
  const stake = parseFloat(tournament.entryStake);
  const insufficientBalance = balance < stake;
  const isFull = tournament.currentParticipants >= tournament.maxParticipants;

  const handleConfirm = async () => {
    if (insufficientBalance || isFull) return;

    setJoining(true);
    setError(null);

    try {
      await onConfirm(tournament);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join tournament');
    } finally {
      setJoining(false);
    }
  };

  return (
    <ArcadeModal
      open={open}
      title="JOIN TOURNAMENT"
      onClose={onClose}
    >
      <div className="space-y-6">
        {/* Tournament info */}
        <div className="text-center">
          <GameTypeBadge gameType={tournament.gameType} size="md" className="mx-auto mb-3" />
          <h3 className="font-pixel text-sm text-white mb-1">{tournament.name}</h3>
          <p className="text-xs text-gray-500">
            {FORMAT_LABELS[tournament.format]} &middot; {tournament.roundCount} rounds
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-1 rounded-lg p-4 text-center">
            <Coins size={20} className="text-arcade-gold mx-auto mb-2" />
            <p className="text-[10px] text-gray-500 mb-1">ENTRY STAKE</p>
            <p className="font-mono text-lg font-bold text-arcade-gold">
              {formatMON(tournament.entryStake)}
            </p>
          </div>
          <div className="bg-surface-1 rounded-lg p-4 text-center">
            <Trophy size={20} className="text-arcade-purple mx-auto mb-2" />
            <p className="text-[10px] text-gray-500 mb-1">PRIZE POOL</p>
            <p className="font-mono text-lg font-bold text-arcade-purple">
              {formatMON(tournament.prizePool)}
            </p>
          </div>
        </div>

        {/* Participants with capacity bar */}
        <div className="p-3 bg-surface-1 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-gray-400" />
              <span className="text-sm text-gray-400">Participants</span>
            </div>
            <span className="font-mono text-sm">
              <span className={isFull ? 'text-arcade-red' : 'text-white'}>
                {tournament.currentParticipants}
              </span>
              <span className="text-gray-600">/{tournament.maxParticipants}</span>
            </span>
          </div>
          {/* Capacity bar */}
          <div className="h-2 bg-surface-0 rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                isFull ? 'bg-arcade-red/70' :
                tournament.currentParticipants / tournament.maxParticipants > 0.8 ? 'bg-arcade-gold/70' :
                'bg-arcade-green/70'
              )}
              style={{ width: `${(tournament.currentParticipants / tournament.maxParticipants) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[8px] text-gray-600">{tournament.maxParticipants - tournament.currentParticipants} spots left</span>
            <span className={clsx(
              'text-[8px] font-pixel',
              isFull ? 'text-arcade-red' :
              tournament.currentParticipants / tournament.maxParticipants > 0.8 ? 'text-arcade-gold' :
              'text-arcade-green'
            )}>
              {isFull ? 'FULL' : tournament.currentParticipants / tournament.maxParticipants > 0.8 ? 'FILLING UP' : 'OPEN'}
            </span>
          </div>
        </div>

        {/* Expected ROI */}
        {(() => {
          const prize = parseFloat(tournament.prizePool);
          const maxRoi = stake > 0 ? ((prize / tournament.maxParticipants - stake) / stake * 100) : 0;
          const winRoi = stake > 0 ? ((prize * 0.6 - stake) / stake * 100) : 0;
          return (
            <div className="p-3 bg-surface-1 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-pixel text-gray-500 tracking-wider">EXPECTED RETURNS</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-[8px] text-gray-600 mb-0.5">1ST PLACE ROI</p>
                  <p className={clsx(
                    'font-mono text-sm font-bold',
                    winRoi > 0 ? 'text-arcade-green' : 'text-arcade-red'
                  )}>
                    {winRoi > 0 ? '+' : ''}{winRoi.toFixed(0)}%
                  </p>
                </div>
                <div>
                  <p className="text-[8px] text-gray-600 mb-0.5">AVG RETURN</p>
                  <p className={clsx(
                    'font-mono text-sm font-bold',
                    maxRoi > 0 ? 'text-arcade-gold' : 'text-arcade-red'
                  )}>
                    {maxRoi > 0 ? '+' : ''}{maxRoi.toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Wallet balance */}
        <div className="flex items-center justify-between p-3 bg-surface-1 rounded-lg">
          <span className="text-sm text-gray-400">Your Balance</span>
          <span className={`font-mono text-sm ${insufficientBalance ? 'text-arcade-red' : 'text-white'}`}>
            {formatMON(walletBalance)}
          </span>
        </div>

        {/* Warnings */}
        {insufficientBalance && (
          <div className="flex items-center gap-2 p-3 bg-arcade-red/10 border border-arcade-red/30 rounded-lg">
            <AlertCircle size={16} className="text-arcade-red flex-shrink-0" />
            <span className="text-xs text-arcade-red">Insufficient balance to join</span>
          </div>
        )}

        {isFull && (
          <div className="flex items-center gap-2 p-3 bg-arcade-orange/10 border border-arcade-orange/30 rounded-lg">
            <AlertCircle size={16} className="text-arcade-orange flex-shrink-0" />
            <span className="text-xs text-arcade-orange">Tournament is full</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-arcade-red/10 border border-arcade-red/30 rounded-lg">
            <AlertCircle size={16} className="text-arcade-red flex-shrink-0" />
            <span className="text-xs text-arcade-red">{error}</span>
          </div>
        )}

        {/* Confirm button - with wallet connection guards */}
        {!isConnected ? (
          <NeonButton
            variant="neon"
            color="purple"
            className="w-full"
            onClick={() => openConnectModal?.()}
          >
            CONNECT WALLET
          </NeonButton>
        ) : !isCorrectChain ? (
          <NeonButton
            variant="secondary"
            className="w-full"
            disabled
          >
            SWITCH NETWORK
          </NeonButton>
        ) : (
          <NeonButton
            variant="insert-coin"
            className="w-full"
            onClick={handleConfirm}
            disabled={insufficientBalance || isFull || joining}
          >
            {joining ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                JOINING...
              </span>
            ) : (
              `INSERT ${formatMON(tournament.entryStake)}`
            )}
          </NeonButton>
        )}

        {/* Fine print */}
        <p className="text-[10px] text-gray-600 text-center">
          Stakes are locked until tournament ends. Entry is non-refundable.
        </p>
      </div>
    </ArcadeModal>
  );
}
