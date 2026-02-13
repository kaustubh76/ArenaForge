import { create } from 'zustand';
import { StrategyMove } from '@/types/arena';
import { GameContracts, getClient } from '@/lib/contracts';

interface GameActionState {
  // Pending actions before submission
  pendingMove: StrategyMove | null;
  pendingBids: Record<string, string>; // boxId -> amount in MON
  pendingAnswer: number | null;
  pendingPrediction: 'bull' | 'bear' | null;

  // Submission state
  submitting: boolean;
  submitError: string | null;
  lastSubmitSuccess: boolean;

  // Current match context
  activeMatchId: number | null;

  // Actions - staging
  setActiveMatch: (matchId: number | null) => void;
  setPendingMove: (move: StrategyMove | null) => void;
  setPendingBid: (boxId: string, amount: string) => void;
  clearPendingBids: () => void;
  setPendingAnswer: (index: number | null) => void;
  setPendingPrediction: (prediction: 'bull' | 'bear' | null) => void;
  clearAll: () => void;

  // Actions - submission (blockchain)
  submitMove: (matchId: number) => Promise<boolean>;
  submitBids: (matchId: number) => Promise<boolean>;
  submitAnswer: (matchId: number) => Promise<boolean>;
  submitPrediction: (matchId: number) => Promise<boolean>;
}

// Extend window type for ethereum provider
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      isMetaMask?: boolean;
    };
  }
}

// Helper to get wallet client for write operations
async function getWalletClient() {
  // This requires wallet connection via wagmi/RainbowKit
  // For now we'll try to use window.ethereum if available
  if (typeof window !== 'undefined' && window.ethereum) {
    const { createWalletClient, custom } = await import('viem');
    const rpcUrl = import.meta.env.VITE_RPC_URL || 'http://127.0.0.1:8545';
    const chainId = Number(import.meta.env.VITE_CHAIN_ID || '31337');
    const isLocal = chainId === 31337;

    const { defineChain } = await import('viem');
    const chain = defineChain({
      id: chainId,
      name: isLocal ? 'Localhost (Anvil)' : 'Monad Testnet',
      nativeCurrency: {
        decimals: 18,
        name: isLocal ? 'ETH' : 'MON',
        symbol: isLocal ? 'ETH' : 'MON',
      },
      rpcUrls: { default: { http: [rpcUrl] } },
    });

    const walletClient = createWalletClient({
      chain,
      transport: custom(window.ethereum),
    });

    const [account] = await walletClient.getAddresses();
    if (!account) throw new Error('No wallet connected');

    return { walletClient, account };
  }
  throw new Error('No wallet provider found. Please connect your wallet.');
}

// Generate random salt for commit-reveal
function generateSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}

// Double-submit prevention: track recent submissions
const SUBMISSION_CACHE_KEY_PREFIX = 'recent_submission_';
const SUBMISSION_CACHE_TTL_MS = 30000; // 30 seconds

interface SubmissionRecord {
  timestamp: number;
  txHash?: string;
}

function getSubmissionKey(matchId: number, actionType: string): string {
  return `${SUBMISSION_CACHE_KEY_PREFIX}${matchId}_${actionType}`;
}

function hasRecentSubmission(matchId: number, actionType: string): boolean {
  try {
    const key = getSubmissionKey(matchId, actionType);
    const cached = sessionStorage.getItem(key);
    if (!cached) return false;

    const record: SubmissionRecord = JSON.parse(cached);
    const isExpired = Date.now() - record.timestamp > SUBMISSION_CACHE_TTL_MS;
    if (isExpired) {
      sessionStorage.removeItem(key);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function recordSubmission(matchId: number, actionType: string, txHash?: string): void {
  try {
    const key = getSubmissionKey(matchId, actionType);
    const record: SubmissionRecord = { timestamp: Date.now(), txHash };
    sessionStorage.setItem(key, JSON.stringify(record));
  } catch {
    // Ignore storage errors
  }
}

function clearSubmission(matchId: number, actionType: string): void {
  try {
    const key = getSubmissionKey(matchId, actionType);
    sessionStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

export const useGameActionStore = create<GameActionState>((set, get) => ({
  pendingMove: null,
  pendingBids: {},
  pendingAnswer: null,
  pendingPrediction: null,
  submitting: false,
  submitError: null,
  lastSubmitSuccess: false,
  activeMatchId: null,

  setActiveMatch: (matchId) => {
    const current = get().activeMatchId;
    if (current !== matchId) {
      set({
        activeMatchId: matchId,
        pendingMove: null,
        pendingBids: {},
        pendingAnswer: null,
        pendingPrediction: null,
        submitError: null,
        lastSubmitSuccess: false,
      });
    }
  },

  setPendingMove: (move) => set({ pendingMove: move, submitError: null }),

  setPendingBid: (boxId, amount) => set((state) => ({
    pendingBids: { ...state.pendingBids, [boxId]: amount },
    submitError: null,
  })),

  clearPendingBids: () => set({ pendingBids: {}, submitError: null }),

  setPendingAnswer: (index) => set({ pendingAnswer: index, submitError: null }),

  setPendingPrediction: (prediction) => set({ pendingPrediction: prediction, submitError: null }),

  clearAll: () => set({
    pendingMove: null,
    pendingBids: {},
    pendingAnswer: null,
    pendingPrediction: null,
    submitError: null,
    lastSubmitSuccess: false,
  }),

  submitMove: async (matchId) => {
    const { pendingMove } = get();
    if (!pendingMove) {
      set({ submitError: 'No move selected' });
      return false;
    }

    if (!window.ethereum) {
      set({ submitError: 'Please connect your wallet to submit moves' });
      return false;
    }

    if (!GameContracts.strategyArena.address) {
      set({ submitError: 'Strategy Arena contract not configured' });
      return false;
    }

    // Pre-flight validation: check for double submission
    if (hasRecentSubmission(matchId, 'move')) {
      set({ submitError: 'Move already submitted recently. Please wait.' });
      return false;
    }

    set({ submitting: true, submitError: null, lastSubmitSuccess: false });

    try {
      const { walletClient, account } = await getWalletClient();
      const { keccak256, encodePacked } = await import('viem');

      // Generate salt and compute commit hash
      const salt = generateSalt();
      const moveHash = keccak256(encodePacked(['uint8', 'bytes32'], [pendingMove, salt]));

      // Store salt for reveal phase (in production, persist this)
      sessionStorage.setItem(`move_salt_${matchId}`, salt);

      // Submit commit
      const hash = await walletClient.writeContract({
        address: GameContracts.strategyArena.address,
        abi: GameContracts.strategyArena.abi,
        functionName: 'commitMove',
        args: [BigInt(matchId), moveHash],
        account,
      });

      console.log(`[Chain] Move committed for match ${matchId}, tx: ${hash}`);

      // Record successful submission
      recordSubmission(matchId, 'move', hash);

      set({ submitting: false, pendingMove: null, lastSubmitSuccess: true });
      return true;
    } catch (error) {
      console.error('[gameActionStore] submitMove failed:', error);
      // Clear submission record on failure to allow retry
      clearSubmission(matchId, 'move');
      set({
        submitting: false,
        submitError: error instanceof Error ? error.message : 'Submission failed',
        lastSubmitSuccess: false,
      });
      return false;
    }
  },

  submitBids: async (matchId) => {
    const { pendingBids } = get();
    const bidEntries = Object.entries(pendingBids).filter(([, amount]) => parseFloat(amount) > 0);

    if (bidEntries.length === 0) {
      set({ submitError: 'No bids placed' });
      return false;
    }

    if (!window.ethereum) {
      set({ submitError: 'Please connect your wallet to submit bids' });
      return false;
    }

    if (!GameContracts.auctionWars.address) {
      set({ submitError: 'Auction Wars contract not configured' });
      return false;
    }

    // Pre-flight validation: check for double submission
    if (hasRecentSubmission(matchId, 'bids')) {
      set({ submitError: 'Bids already submitted recently. Please wait.' });
      return false;
    }

    // Pre-flight validation: check bid amounts are valid numbers
    for (const [boxId, amount] of bidEntries) {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed < 0) {
        set({ submitError: `Invalid bid amount for box ${boxId}` });
        return false;
      }
    }

    set({ submitting: true, submitError: null, lastSubmitSuccess: false });

    try {
      const { walletClient, account } = await getWalletClient();
      const { parseEther } = await import('viem');

      const boxIds = bidEntries.map(([boxId]) => boxId);
      const amounts = bidEntries.map(([, amount]) => parseEther(amount));
      const totalValue = amounts.reduce((sum, a) => sum + a, BigInt(0));

      const hash = await walletClient.writeContract({
        address: GameContracts.auctionWars.address,
        abi: GameContracts.auctionWars.abi,
        functionName: 'submitBids',
        args: [BigInt(matchId), boxIds, amounts],
        value: totalValue,
        account,
      });

      console.log(`[Chain] Bids submitted for match ${matchId}, tx: ${hash}`);

      // Record successful submission
      recordSubmission(matchId, 'bids', hash);

      set({ submitting: false, pendingBids: {}, lastSubmitSuccess: true });
      return true;
    } catch (error) {
      console.error('[gameActionStore] submitBids failed:', error);
      clearSubmission(matchId, 'bids');
      set({
        submitting: false,
        submitError: error instanceof Error ? error.message : 'Submission failed',
        lastSubmitSuccess: false,
      });
      return false;
    }
  },

  submitAnswer: async (matchId) => {
    const { pendingAnswer } = get();
    if (pendingAnswer === null) {
      set({ submitError: 'No answer selected' });
      return false;
    }

    if (!window.ethereum) {
      set({ submitError: 'Please connect your wallet to submit answers' });
      return false;
    }

    if (!GameContracts.quizBowl.address) {
      set({ submitError: 'Quiz Bowl contract not configured' });
      return false;
    }

    // Pre-flight validation: check answer index is valid
    if (pendingAnswer < 0 || pendingAnswer > 3) {
      set({ submitError: 'Invalid answer selection' });
      return false;
    }

    // Note: Quiz answers are per-question, so we use question index in the key
    // This allows submitting answers for different questions

    set({ submitting: true, submitError: null, lastSubmitSuccess: false });

    try {
      const { walletClient, account } = await getWalletClient();

      // Get current question index from contract
      const client = await getClient();
      const matchState = await client.readContract({
        address: GameContracts.quizBowl.address,
        abi: GameContracts.quizBowl.abi,
        functionName: 'getMatchState',
        args: [BigInt(matchId)],
      }) as { currentQuestion: bigint };

      const questionIndex = Number(matchState.currentQuestion);

      // Check for double submission on same question
      if (hasRecentSubmission(matchId, `answer_${questionIndex}`)) {
        set({ submitError: 'Answer for this question already submitted. Please wait.' });
        set({ submitting: false });
        return false;
      }

      const hash = await walletClient.writeContract({
        address: GameContracts.quizBowl.address,
        abi: GameContracts.quizBowl.abi,
        functionName: 'submitAnswer',
        args: [BigInt(matchId), matchState.currentQuestion, pendingAnswer],
        account,
      });

      console.log(`[Chain] Answer submitted for match ${matchId}, tx: ${hash}`);

      // Record successful submission for this question
      recordSubmission(matchId, `answer_${questionIndex}`, hash);

      set({ submitting: false, lastSubmitSuccess: true });
      return true;
    } catch (error) {
      console.error('[gameActionStore] submitAnswer failed:', error);
      set({
        submitting: false,
        submitError: error instanceof Error ? error.message : 'Submission failed',
        lastSubmitSuccess: false,
      });
      return false;
    }
  },

  submitPrediction: async (matchId) => {
    const { pendingPrediction } = get();
    if (!pendingPrediction) {
      set({ submitError: 'No prediction selected' });
      return false;
    }

    if (!window.ethereum) {
      set({ submitError: 'Please connect your wallet to submit predictions' });
      return false;
    }

    if (!GameContracts.oracleDuel.address) {
      set({ submitError: 'Oracle Duel contract not configured' });
      return false;
    }

    // Pre-flight validation: check for double submission
    if (hasRecentSubmission(matchId, 'prediction')) {
      set({ submitError: 'Prediction already submitted recently. Please wait.' });
      return false;
    }

    set({ submitting: true, submitError: null, lastSubmitSuccess: false });

    try {
      const { walletClient, account } = await getWalletClient();

      const hash = await walletClient.writeContract({
        address: GameContracts.oracleDuel.address,
        abi: GameContracts.oracleDuel.abi,
        functionName: 'makePrediction',
        args: [BigInt(matchId), pendingPrediction === 'bull'],
        account,
      });

      console.log(`[Chain] Prediction submitted for match ${matchId}, tx: ${hash}`);

      // Record successful submission
      recordSubmission(matchId, 'prediction', hash);

      set({ submitting: false, lastSubmitSuccess: true });
      return true;
    } catch (error) {
      console.error('[gameActionStore] submitPrediction failed:', error);
      clearSubmission(matchId, 'prediction');
      set({
        submitting: false,
        submitError: error instanceof Error ? error.message : 'Submission failed',
        lastSubmitSuccess: false,
      });
      return false;
    }
  },
}));
