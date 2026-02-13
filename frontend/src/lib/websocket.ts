// Socket.IO client for real-time updates

import { io, Socket } from "socket.io-client";

// Event types from backend
export interface MatchStateChangedEvent {
  matchId: number;
  tournamentId: number;
  state: unknown;
  timestamp: number;
}

export interface MatchCompletedEvent {
  matchId: number;
  tournamentId: number;
  winner: string | null;
  result: unknown;
  timestamp: number;
}

export interface MatchCreatedEvent {
  matchId: number;
  tournamentId: number;
  round: number;
  player1: string;
  player2: string;
  player1Handle: string;
  player2Handle: string;
  player1Elo: number;
  player2Elo: number;
  gameType: number;
  timestamp: number;
}

export interface TournamentParticipantJoinedEvent {
  tournamentId: number;
  agent: string;
  handle: string;
  elo: number;
  currentParticipants: number;
  maxParticipants: number;
  timestamp: number;
}

export interface TournamentRoundAdvancedEvent {
  tournamentId: number;
  previousRound: number;
  currentRound: number;
  totalRounds: number;
  standings: unknown[];
  timestamp: number;
}

export interface TournamentStartedEvent {
  tournamentId: number;
  name: string;
  gameType: number;
  format: number;
  participants: unknown[];
  timestamp: number;
}

export interface TournamentCompletedEvent {
  tournamentId: number;
  name: string;
  winner: string;
  winnerHandle: string;
  prizePool: string;
  finalStandings: unknown[];
  timestamp: number;
}

export interface AgentEloUpdatedEvent {
  agent: string;
  handle: string;
  previousElo: number;
  newElo: number;
  change: number;
  matchId: number;
  timestamp: number;
}

// Chat event types
export interface ChatMessageEvent {
  id: string;
  matchId: number;
  sender: string;
  senderDisplay: string;
  text: string;
  timestamp: number;
}

export interface ChatErrorEvent {
  message: string;
}

// A2A event types
export interface A2AChallengeEvent {
  challengeId: number;
  challenger: string;
  challenged: string;
  gameType: number;
  stake: string;
  status: string;
  timestamp: number;
}

export interface A2AMessageEvent {
  id: number;
  fromAgent: string;
  toAgent: string;
  messageType: string;
  timestamp: number;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface WebSocketClientConfig {
  url?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  reconnectionAttempts?: number;
}

const DEFAULT_CONFIG: Required<WebSocketClientConfig> = {
  url: import.meta.env.VITE_WS_URL || "http://localhost:3001",
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 10,
};

type EventCallback<T> = (data: T) => void;

class WebSocketClient {
  private socket: Socket | null = null;
  private config: Required<WebSocketClientConfig>;
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private subscriptions: Map<string, Set<EventCallback<unknown>>> = new Map();

  constructor(config: WebSocketClientConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Connect to the WebSocket server.
   */
  connect(): void {
    if (this.socket?.connected) return;

    this.socket = io(this.config.url, {
      autoConnect: this.config.autoConnect,
      reconnection: this.config.reconnection,
      reconnectionDelay: this.config.reconnectionDelay,
      reconnectionDelayMax: this.config.reconnectionDelayMax,
      reconnectionAttempts: this.config.reconnectionAttempts,
      transports: ["websocket", "polling"],
    });

    this.setupEventHandlers();
  }

  /**
   * Disconnect from the WebSocket server.
   */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  /**
   * Get current connection status.
   */
  getStatus(): ConnectionStatus {
    if (!this.socket) return "disconnected";
    if (this.socket.connected) return "connected";
    return "connecting";
  }

  /**
   * Subscribe to connection status changes.
   */
  onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  private notifyStatusChange(status: ConnectionStatus): void {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      console.log("[WebSocket] Connected");
      this.notifyStatusChange("connected");
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[WebSocket] Disconnected:", reason);
      this.notifyStatusChange("disconnected");
    });

    this.socket.on("connect_error", (error) => {
      console.error("[WebSocket] Connection error:", error);
      this.notifyStatusChange("error");
    });

    // Forward all arena events to subscriptions
    const events = [
      "match:stateChanged",
      "match:actionSubmitted",
      "match:completed",
      "match:created",
      "tournament:participantJoined",
      "tournament:roundAdvanced",
      "tournament:started",
      "tournament:completed",
      "agent:eloUpdated",
      "evolution:parametersChanged",
      "chat:message",
      "chat:error",
      "a2a:challenge",
      "a2a:message",
    ];

    for (const event of events) {
      this.socket.on(event, (data: unknown) => {
        const callbacks = this.subscriptions.get(event);
        if (callbacks) {
          for (const callback of callbacks) {
            callback(data);
          }
        }
      });
    }
  }

  /**
   * Subscribe to a specific event type.
   */
  subscribe<T>(event: string, callback: EventCallback<T>): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)!.add(callback as EventCallback<unknown>);

    return () => {
      this.subscriptions.get(event)?.delete(callback as EventCallback<unknown>);
    };
  }

  // --- Room Management ---

  /**
   * Join a tournament room to receive updates.
   */
  joinTournament(tournamentId: number): void {
    this.socket?.emit("join:tournament", tournamentId);
  }

  /**
   * Leave a tournament room.
   */
  leaveTournament(tournamentId: number): void {
    this.socket?.emit("leave:tournament", tournamentId);
  }

  /**
   * Join a match room to receive updates.
   */
  joinMatch(matchId: number): void {
    this.socket?.emit("join:match", matchId);
  }

  /**
   * Leave a match room.
   */
  leaveMatch(matchId: number): void {
    this.socket?.emit("leave:match", matchId);
  }

  /**
   * Join an agent room to receive updates.
   */
  joinAgent(agentAddress: string): void {
    this.socket?.emit("join:agent", agentAddress);
  }

  /**
   * Leave an agent room.
   */
  leaveAgent(agentAddress: string): void {
    this.socket?.emit("leave:agent", agentAddress);
  }

  /**
   * Send a chat message to a match room.
   */
  sendChatMessage(matchId: number, text: string, sender: string): void {
    this.socket?.emit("chat:send" as never, { matchId, text, sender } as never);
  }

  /**
   * Ping the server (for testing connectivity).
   */
  ping(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Not connected"));
        return;
      }

      const startTime = Date.now();
      this.socket.emit("ping");
      this.socket.once("pong", () => {
        resolve(Date.now() - startTime);
      });

      // Timeout after 5 seconds
      setTimeout(() => reject(new Error("Ping timeout")), 5000);
    });
  }
}

// Singleton instance
let client: WebSocketClient | null = null;

export function getWebSocketClient(config?: WebSocketClientConfig): WebSocketClient {
  if (!client) {
    client = new WebSocketClient(config);
    client.connect();
  }
  return client;
}

export function disconnectWebSocket(): void {
  if (client) {
    client.disconnect();
    client = null;
  }
}

export { WebSocketClient };
