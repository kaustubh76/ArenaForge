/**
 * Wagmi configuration for wallet connection
 * Supports Monad Testnet (10143) and local Anvil (31337)
 */
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

// Monad Testnet chain definition
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
  testnet: true,
});

// Local Anvil chain for development
export const localhost = defineChain({
  id: 31337,
  name: 'Localhost (Anvil)',
  nativeCurrency: {
    decimals: 18,
    name: 'ETH',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
  },
  testnet: true,
});

// Determine which chain to use based on env
const chainId = Number(import.meta.env.VITE_CHAIN_ID || '10143');
const activeChain = chainId === 31337 ? localhost : monadTestnet;

// RainbowKit configuration
export const config = getDefaultConfig({
  appName: 'ArenaForge',
  projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'arenaforge-demo',
  chains: [activeChain],
  ssr: false,
});

export { activeChain };
