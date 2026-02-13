/**
 * Wallet hook - provides wallet state and transaction signing capabilities
 */
import { useAccount, useWalletClient, usePublicClient, useBalance } from 'wagmi';
import { useMemo } from 'react';
import { formatEther } from 'viem';

export function useWallet() {
  const { address, isConnected, isConnecting, chain } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  // Fetch native token balance (MON on Monad Testnet)
  const { data: balanceData, refetch: refetchBalance, isLoading: balanceLoading } = useBalance({
    address: address,
  });

  const shortAddress = useMemo(() => {
    if (!address) return null;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address]);

  const isCorrectChain = useMemo(() => {
    if (!chain) return false;
    const expectedChainId = Number(import.meta.env.VITE_CHAIN_ID || '10143');
    return chain.id === expectedChainId;
  }, [chain]);

  // Format balance as string for display
  const balance = useMemo(() => {
    if (!balanceData) return '0';
    return formatEther(balanceData.value);
  }, [balanceData]);

  return {
    address,
    shortAddress,
    isConnected,
    isConnecting,
    isCorrectChain,
    chain,
    walletClient,
    publicClient,
    balance,
    balanceLoading,
    refetchBalance,
  };
}
