import { type Abi } from "viem";
import { publicClient } from "./rpc";

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

export class MonadEventListener {
  private coreAddress: `0x${string}`;
  private registryAddress: `0x${string}`;
  private strategyAddress: `0x${string}`;
  private unwatchers: (() => void)[] = [];

  constructor() {
    this.coreAddress = process.env.ARENA_CORE_ADDRESS as `0x${string}`;
    this.registryAddress = process.env.MATCH_REGISTRY_ADDRESS as `0x${string}`;
    this.strategyAddress = process.env.STRATEGY_ARENA_ADDRESS as `0x${string}`;
  }

  watchRegistrations(callback: (agent: string, handle: string) => void): void {
    const unwatch = publicClient.watchContractEvent({
      address: this.coreAddress,
      abi: ArenaCoreEvents,
      eventName: "AgentRegistered",
      onLogs: (logs) => {
        for (const log of logs) {
          const args = (log as any).args as { agent: string; moltbookHandle: string };
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
        for (const log of logs) {
          const args = (log as any).args as { tournamentId: bigint; agent: string };
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
        for (const log of logs) {
          const args = (log as any).args as { matchId: bigint; winner: string };
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
        for (const log of logs) {
          const args = (log as any).args as { matchId: bigint; round: bigint; player: string };
          callback(Number(args.matchId), Number(args.round), args.player);
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
