/**
 * Tournament actions hook - handles join tournament contract interactions
 */
import { useState, useCallback } from 'react';
import { parseEther } from 'viem';
import { useWallet } from './useWallet';
import { ArenaCore } from '@/lib/contracts';
import { useArenaStore } from '@/stores/arenaStore';
import { Tournament } from '@/types/arena';

export type JoinStatus = 'idle' | 'confirming' | 'pending' | 'success' | 'error';

interface UseTournamentActionsResult {
  joinTournament: (tournament: Tournament) => Promise<boolean>;
  joinStatus: JoinStatus;
  joinError: string | null;
  txHash: string | null;
  resetJoinState: () => void;
}

export function useTournamentActions(): UseTournamentActionsResult {
  const { walletClient, address, isConnected, isCorrectChain } = useWallet();
  const fetchFromChain = useArenaStore((s) => s.fetchFromChain);

  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const resetJoinState = useCallback(() => {
    setJoinStatus('idle');
    setJoinError(null);
    setTxHash(null);
  }, []);

  const joinTournament = useCallback(async (tournament: Tournament): Promise<boolean> => {
    // Pre-flight checks
    if (!isConnected) {
      setJoinError('Please connect your wallet first');
      setJoinStatus('error');
      return false;
    }

    if (!isCorrectChain) {
      setJoinError('Please switch to the correct network');
      setJoinStatus('error');
      return false;
    }

    if (!walletClient || !address) {
      setJoinError('Wallet not ready');
      setJoinStatus('error');
      return false;
    }

    if (!ArenaCore.address) {
      setJoinError('ArenaCore contract not configured');
      setJoinStatus('error');
      return false;
    }

    try {
      setJoinStatus('confirming');
      setJoinError(null);
      setTxHash(null);

      // Convert entry stake to wei (tournament.entryStake is in ether format)
      const stakeValue = parseEther(tournament.entryStake);

      // Execute contract write
      const hash = await walletClient.writeContract({
        address: ArenaCore.address,
        abi: ArenaCore.abi,
        functionName: 'joinTournament',
        args: [BigInt(tournament.id)],
        value: stakeValue,
        account: address,
      });

      setTxHash(hash);
      setJoinStatus('pending');

      // Refresh tournament data
      await fetchFromChain();

      setJoinStatus('success');
      return true;
    } catch (error) {
      // Parse common error messages
      let errorMessage = 'Failed to join tournament';
      if (error instanceof Error) {
        if (error.message.includes('User rejected')) {
          errorMessage = 'Transaction was cancelled';
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient balance for entry stake + gas';
        } else if (error.message.includes('already joined') || error.message.includes('AlreadyJoined')) {
          errorMessage = 'You have already joined this tournament';
        } else if (error.message.includes('tournament full') || error.message.includes('TournamentFull')) {
          errorMessage = 'Tournament is full';
        } else if (error.message.includes('not open') || error.message.includes('NotOpen')) {
          errorMessage = 'Tournament is not accepting entries';
        } else {
          errorMessage = error.message.slice(0, 100); // Truncate long messages
        }
      }

      setJoinError(errorMessage);
      setJoinStatus('error');
      return false;
    }
  }, [walletClient, address, isConnected, isCorrectChain, fetchFromChain]);

  return {
    joinTournament,
    joinStatus,
    joinError,
    txHash,
    resetJoinState,
  };
}
