// Socket.IO WebSocket server setup

import { Server as HttpServer, createServer } from "http";
import { Server, Socket } from "socket.io";
import type { EventBroadcaster } from "../../events";
import { getEventBroadcaster, getRoomName, type BroadcastEventName } from "../../events";
import {
  setupSocketHandlers,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type InterServerEvents,
  type SocketData,
} from "./handlers";
import { getRoomStats } from "./rooms";

export interface WebSocketServerConfig {
  port?: number;
  corsOrigin?: string | string[];
  pingInterval?: number;
  pingTimeout?: number;
}

const DEFAULT_CONFIG: Required<WebSocketServerConfig> = {
  port: 3001,
  corsOrigin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
  pingInterval: 25000,
  pingTimeout: 20000,
};

export class WebSocketServer {
  private httpServer: HttpServer;
  private io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;
  private broadcaster: EventBroadcaster;
  private config: Required<WebSocketServerConfig>;
  private unsubscribe: (() => void) | null = null;

  constructor(config: WebSocketServerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.broadcaster = getEventBroadcaster();

    // Create HTTP server
    this.httpServer = createServer();

    // Create Socket.IO server
    this.io = new Server(this.httpServer, {
      cors: {
        origin: this.config.corsOrigin,
        methods: ["GET", "POST"],
        credentials: true,
      },
      pingInterval: this.config.pingInterval,
      pingTimeout: this.config.pingTimeout,
      transports: ["websocket", "polling"],
    });

    this.setupConnectionHandler();
    this.setupBroadcasterBridge();
  }

  /**
   * Set up the connection handler for new sockets.
   */
  private setupConnectionHandler(): void {
    this.io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
      setupSocketHandlers(this.io, socket);
    });
  }

  /**
   * Bridge EventBroadcaster events to Socket.IO rooms.
   */
  private setupBroadcasterBridge(): void {
    this.unsubscribe = this.broadcaster.onAny((event, payload, rooms) => {
      // Emit to all relevant rooms
      for (const room of rooms) {
        const roomName = getRoomName(room);
        this.io.to(roomName).emit(event as keyof ServerToClientEvents, payload);
      }
    });
  }

  /**
   * Start the WebSocket server.
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        console.log(
          `[WebSocket] Server listening on port ${this.config.port}`
        );
        resolve();
      });
    });
  }

  /**
   * Stop the WebSocket server.
   */
  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Disconnect all clients
    const sockets = await this.io.fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }

    return new Promise((resolve, reject) => {
      this.io.close((err?: Error) => {
        if (err) {
          reject(err);
        } else {
          console.log("[WebSocket] Server stopped");
          resolve();
        }
      });
    });
  }

  /**
   * Get the Socket.IO server instance.
   */
  getIO(): Server {
    return this.io;
  }

  /**
   * Get connection statistics.
   */
  async getStats(): Promise<{
    connectedClients: number;
    roomStats: ReturnType<typeof getRoomStats>;
  }> {
    const sockets = await this.io.fetchSockets();
    return {
      connectedClients: sockets.length,
      roomStats: getRoomStats(),
    };
  }

  /**
   * Emit an event directly (bypassing EventBroadcaster).
   */
  emit<K extends keyof ServerToClientEvents>(
    event: K,
    data: Parameters<ServerToClientEvents[K]>[0]
  ): void {
    (this.io as Server).emit(event, data);
  }

  /**
   * Emit to a specific room.
   */
  emitToRoom<K extends keyof ServerToClientEvents>(
    roomName: string,
    event: K,
    data: Parameters<ServerToClientEvents[K]>[0]
  ): void {
    // Type assertion needed due to Socket.IO's complex generic types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.io.to(roomName) as any).emit(event, data);
  }
}

// Singleton instance
let wsServer: WebSocketServer | null = null;

export function getWebSocketServer(
  config?: WebSocketServerConfig
): WebSocketServer {
  if (!wsServer) {
    wsServer = new WebSocketServer(config);
  }
  return wsServer;
}

export async function stopWebSocketServer(): Promise<void> {
  if (wsServer) {
    await wsServer.stop();
    wsServer = null;
  }
}
