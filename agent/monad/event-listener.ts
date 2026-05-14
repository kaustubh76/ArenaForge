import { type Abi } from "viem";
import { publicClient } from "./rpc";
import {
  AgentRegisteredArgs,
  AgentJoinedTournamentArgs,
  MatchCompletedArgs,
  MoveCommittedArgs,
  MoveRevealedArgs,
  BidCommittedArgs,
  BidRevealedArgs,
  AnswerCommittedArgs,
  AnswerRevealedArgs,
  BetPlacedArgs,
  BettingOpenedArgs,
  BetsSettledArgs,
  parseEventArgs,
} from "../schemas/events";

const ArenaCoreEvents: Abi = [
  { type: "event", name: "AgentRegistered", inputs: [{ name: "agent", type: "address", indexed: true }, { name: "moltbookHandle", type: "string", indexed: false }] },
  { type: "event", name: "AgentJoinedTournament", inputs: [{ name: "tournamentId", type: "uint256", indexed: true }, { name: "agent", type: "address", indexed: true }] },
  { type: "event", name: "TournamentStarted", inputs: [{ name: "tournamentId", type: "uint256", indexed: true }] },
  { type: "event", name: "TournamentCompleted", inputs: [{ name: "tournamentId", type: "uint256", indexed: true }, { name: "winner", type: "address", indexed: false }] },
  { type: "event", name: "ParametersEvolved", inputs: [{ name: "tournamentId", type: "uint256", indexed: true }, { name: "newParamsHash", type: "bytes32", indexed: false }] },
];

const MatchRegistryEvents: Abi = [
  { type: "event", name: "MatchCreated", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "tournamentId", type: "uint256", indexed: true }, { name: "player1", type: "address", indexed: false }, { name: "player2", type: "address", indexed: false }] },
  { type: "event", name: "MatchCompleted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "winner", type: "address", indexed: false }] },
];

const StrategyArenaEvents: Abi = [
  { type: "event", name: "MoveCommitted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }] },
  { type: "event", name: "MoveRevealed", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }, { name: "move", type: "uint8", indexed: false }] },
];

const AuctionWarsEvents: Abi = [
  { type: "event", name: "BidCommitted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "agent", type: "address", indexed: false }] },
  { type: "event", name: "BidRevealed", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "round", type: "uint256", indexed: false }, { name: "agent", type: "address", indexed: false }, { name: "amount", type: "uint256", indexed: false }] },
];

const QuizBowlEvents: Abi = [
  { type: "event", name: "AnswerCommitted", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "questionIndex", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }] },
  { type: "event", name: "AnswerRevealed", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "questionIndex", type: "uint256", indexed: false }, { name: "player", type: "address", indexed: false }, { name: "answer", type: "uint256", indexed: false }] },
];

const SpectatorBettingEvents: Abi = [
  { type: "event", name: "BetPlaced", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "bettor", type: "address", indexed: true }, { name: "predictedWinner", type: "address", indexed: false }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "event", name: "BettingOpened", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "player1", type: "address", indexed: false }, { name: "player2", type: "address", indexed: false }] },
  { type: "event", name: "BettingClosed", inputs: [{ name: "matchId", type: "uint256", indexed: true }] },
  { type: "event", name: "BetsSettled", inputs: [{ name: "matchId", type: "uint256", indexed: true }, { name: "winner", type: "address", indexed: false }] },
];

export class MonadEventListener {
  private coreAddress: `0x${string}`;
  private registryAddress: `0x${string}`;
  private strategyAddress: `0x${string}`;
  private auctionAddress: `0x${string}`;
  private quizAddress: `0x${string}`;
  private bettingAddress: `0x${string}` | null;
  private unwatchers: (() => void)[] = [];

  constructor() {
    this.coreAddress = process.env.ARENA_CORE_ADDRESS as `0x${string}`;
    this.registryAddress = process.env.MATCH_REGISTRY_ADDRESS as `0x${string}`;
    this.strategyAddress = process.env.STRATEGY_ARENA_ADDRESS as `0x${string}`;
    this.auctionAddress = process.env.AUCTION_WARS_ADDRESS as `0x${string}`;
    this.quizAddress = process.env.QUIZ_BOWL_ADDRESS as `0x${string}`;
    this.bettingAddress = (process.env.SPECTATOR_BETTING_ADDRESS?.trim() as `0x${string}`) || null;
  }

  watchRegistrations(callback: (agent: string, handle: string) => void): void {
    const unwatch = publicClient.watchContractEvent({
      address: this.coreAddress,
      abi: ArenaCoreEvents,
      eventName: "AgentRegistered",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(AgentRegisteredArgs, (entry as { args?: unknown }).args, {
            event: "AgentRegistered",
          });
          if (!args) continue;
          callback(args.agent, args.moltbookHandle);
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchTournamentJoins(callback: (tournamentId: number, agent: string) => void): void {
    const unwatch = publicClient.watchContractEvent({
      address: this.coreAddress,
      abi: ArenaCoreEvents,
      eventName: "AgentJoinedTournament",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(AgentJoinedTournamentArgs, (entry as { args?: unknown }).args, {
            event: "AgentJoinedTournament",
          });
          if (!args) continue;
          callback(Number(args.tournamentId), args.agent);
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchMatchCompletions(callback: (matchId: number, winner: string) => void): void {
    const unwatch = publicClient.watchContractEvent({
      address: this.registryAddress,
      abi: MatchRegistryEvents,
      eventName: "MatchCompleted",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(MatchCompletedArgs, (entry as { args?: unknown }).args, {
            event: "MatchCompleted",
          });
          if (!args) continue;
          callback(Number(args.matchId), args.winner);
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchMoveCommitments(callback: (matchId: number, round: number, player: string) => void): void {
    const unwatch = publicClient.watchContractEvent({
      address: this.strategyAddress,
      abi: StrategyArenaEvents,
      eventName: "MoveCommitted",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(MoveCommittedArgs, (entry as { args?: unknown }).args, {
            event: "MoveCommitted",
          });
          if (!args) continue;
          callback(Number(args.matchId), Number(args.round), args.player);
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchMoveReveals(callback: (matchId: number, round: number, player: string, move: number) => void): void {
    const unwatch = publicClient.watchContractEvent({
      address: this.strategyAddress,
      abi: StrategyArenaEvents,
      eventName: "MoveRevealed",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(MoveRevealedArgs, (entry as { args?: unknown }).args, {
            event: "MoveRevealed",
          });
          if (!args) continue;
          callback(Number(args.matchId), Number(args.round), args.player, Number(args.move));
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchBidCommitments(callback: (matchId: number, round: number, agent: string) => void): void {
    if (!this.auctionAddress) return;
    const unwatch = publicClient.watchContractEvent({
      address: this.auctionAddress,
      abi: AuctionWarsEvents,
      eventName: "BidCommitted",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(BidCommittedArgs, (entry as { args?: unknown }).args, {
            event: "BidCommitted",
          });
          if (!args) continue;
          callback(Number(args.matchId), Number(args.round), args.agent);
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchBidReveals(callback: (matchId: number, round: number, agent: string, amount: bigint) => void): void {
    if (!this.auctionAddress) return;
    const unwatch = publicClient.watchContractEvent({
      address: this.auctionAddress,
      abi: AuctionWarsEvents,
      eventName: "BidRevealed",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(BidRevealedArgs, (entry as { args?: unknown }).args, {
            event: "BidRevealed",
          });
          if (!args) continue;
          callback(Number(args.matchId), Number(args.round), args.agent, BigInt(args.amount));
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchAnswerCommitments(callback: (matchId: number, questionIndex: number, player: string) => void): void {
    if (!this.quizAddress) return;
    const unwatch = publicClient.watchContractEvent({
      address: this.quizAddress,
      abi: QuizBowlEvents,
      eventName: "AnswerCommitted",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(AnswerCommittedArgs, (entry as { args?: unknown }).args, {
            event: "AnswerCommitted",
          });
          if (!args) continue;
          callback(Number(args.matchId), Number(args.questionIndex), args.player);
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchAnswerReveals(callback: (matchId: number, questionIndex: number, player: string, answer: bigint) => void): void {
    if (!this.quizAddress) return;
    const unwatch = publicClient.watchContractEvent({
      address: this.quizAddress,
      abi: QuizBowlEvents,
      eventName: "AnswerRevealed",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(AnswerRevealedArgs, (entry as { args?: unknown }).args, {
            event: "AnswerRevealed",
          });
          if (!args) continue;
          callback(Number(args.matchId), Number(args.questionIndex), args.player, BigInt(args.answer));
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchBetPlaced(callback: (matchId: number, bettor: string, predictedWinner: string, amount: bigint) => void): void {
    if (!this.bettingAddress) return;
    const unwatch = publicClient.watchContractEvent({
      address: this.bettingAddress,
      abi: SpectatorBettingEvents,
      eventName: "BetPlaced",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(BetPlacedArgs, (entry as { args?: unknown }).args, {
            event: "BetPlaced",
          });
          if (!args) continue;
          callback(Number(args.matchId), args.bettor, args.predictedWinner, BigInt(args.amount));
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchBettingOpened(callback: (matchId: number, player1: string, player2: string) => void): void {
    if (!this.bettingAddress) return;
    const unwatch = publicClient.watchContractEvent({
      address: this.bettingAddress,
      abi: SpectatorBettingEvents,
      eventName: "BettingOpened",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(BettingOpenedArgs, (entry as { args?: unknown }).args, {
            event: "BettingOpened",
          });
          if (!args) continue;
          callback(Number(args.matchId), args.player1, args.player2);
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  watchBetsSettled(callback: (matchId: number, winner: string) => void): void {
    if (!this.bettingAddress) return;
    const unwatch = publicClient.watchContractEvent({
      address: this.bettingAddress,
      abi: SpectatorBettingEvents,
      eventName: "BetsSettled",
      onLogs: (logs) => {
        for (const entry of logs) {
          const args = parseEventArgs(BetsSettledArgs, (entry as { args?: unknown }).args, {
            event: "BetsSettled",
          });
          if (!args) continue;
          callback(Number(args.matchId), args.winner);
        }
      },
    });
    this.unwatchers.push(unwatch);
  }

  stopAll(): void {
    for (const unwatch of this.unwatchers) {
      unwatch();
    }
    this.unwatchers = [];
  }
}
