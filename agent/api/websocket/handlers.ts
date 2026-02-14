// Socket.IO event handlers

import type { Server, Socket } from "socket.io";
import type { Room } from "../../events";
import { joinRoom, leaveRoom, cleanupSocket, getSocketRooms } from "./rooms";
import { setupChatHandler, cleanupChatRateLimit, type ChatMessage } from "./chat";
import { createRateLimiter } from "../../utils/rate-limiter";

export interface ClientToServerEvents {
  "join:tournament": (tournamentId: number) => void;
  "leave:tournament": (tournamentId: number) => void;
  "join:match": (matchId: number) => void;
  "leave:match": (matchId: number) => void;
  "join:agent": (agentAddress: string) => void;
  "leave:agent": (agentAddress: string) => void;
  ping: () => void;
  "chat:send": (data: { matchId: number; text: string; sender: string }) => void;
}

export interface ServerToClientEvents {
  // Match events
  "match:stateChanged": (data: unknown) => void;
  "match:actionSubmitted": (data: unknown) => void;
  "match:completed": (data: unknown) => void;
  "match:created": (data: unknown) => void;
  // Tournament events
  "tournament:participantJoined": (data: unknown) => void;
  "tournament:roundAdvanced": (data: unknown) => void;
  "tournament:started": (data: unknown) => void;
  "tournament:completed": (data: unknown) => void;
  // Agent events
  "agent:eloUpdated": (data: unknown) => void;
  // Evolution events
  "evolution:parametersChanged": (data: unknown) => void;
  // A2A events
  "a2a:challenge": (data: unknown) => void;
  "a2a:message": (data: unknown) => void;
  // Chat events
  "chat:message": (data: ChatMessage) => void;
  "chat:error": (data: { message: string }) => void;
  // System events
  pong: (timestamp: number) => void;
  error: (message: string) => void;
  subscriptions: (rooms: string[]) => void;
}

export interface InterServerEvents {
  // For horizontal scaling (future)
}

export interface SocketData {
  connectedAt: number;
  lastActivity: number;
}

// Rate limiter for room join/leave events (Token Bucket: 10 burst, 2/sec per socket)
const roomEventLimiter = createRateLimiter("websocket-events");

/**
 * Check room event rate limit for a socket. Returns true if allowed.
 */
function checkRoomRateLimit(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
): boolean {
  if (!roomEventLimiter.consume(socket.id)) {
    socket.emit("error", "Too many room events. Slow down.");
    return false;
  }
  return true;
}

/**
 * Set up event handlers for a socket connection.
 */
export function setupSocketHandlers(
  io: Server,
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
): void {
  // Initialize socket data
  socket.data.connectedAt = Date.now();
  socket.data.lastActivity = Date.now();

  // Auto-join global room
  joinRoom(socket, { type: "global" });

  console.log(`[WebSocket] Client connected: ${socket.id}`);

  // --- Tournament subscriptions ---

  socket.on("join:tournament", (tournamentId: number) => {
    if (!checkRoomRateLimit(socket)) return;
    if (typeof tournamentId !== "number" || tournamentId < 1) {
      socket.emit("error", "Invalid tournament ID");
      return;
    }
    socket.data.lastActivity = Date.now();
    joinRoom(socket, { type: "tournament", id: tournamentId });
    socket.emit("subscriptions", getSocketRooms(socket));
  });

  socket.on("leave:tournament", (tournamentId: number) => {
    if (!checkRoomRateLimit(socket)) return;
    if (typeof tournamentId !== "number") return;
    socket.data.lastActivity = Date.now();
    leaveRoom(socket, { type: "tournament", id: tournamentId });
    socket.emit("subscriptions", getSocketRooms(socket));
  });

  // --- Match subscriptions ---

  socket.on("join:match", (matchId: number) => {
    if (!checkRoomRateLimit(socket)) return;
    if (typeof matchId !== "number" || matchId < 1) {
      socket.emit("error", "Invalid match ID");
      return;
    }
    socket.data.lastActivity = Date.now();
    joinRoom(socket, { type: "match", id: matchId });
    socket.emit("subscriptions", getSocketRooms(socket));
  });

  socket.on("leave:match", (matchId: number) => {
    if (!checkRoomRateLimit(socket)) return;
    if (typeof matchId !== "number") return;
    socket.data.lastActivity = Date.now();
    leaveRoom(socket, { type: "match", id: matchId });
    socket.emit("subscriptions", getSocketRooms(socket));
  });

  // --- Agent subscriptions ---

  socket.on("join:agent", (agentAddress: string) => {
    if (!checkRoomRateLimit(socket)) return;
    if (typeof agentAddress !== "string" || !agentAddress.startsWith("0x")) {
      socket.emit("error", "Invalid agent address");
      return;
    }
    socket.data.lastActivity = Date.now();
    joinRoom(socket, { type: "agent", id: agentAddress.toLowerCase() });
    socket.emit("subscriptions", getSocketRooms(socket));
  });

  socket.on("leave:agent", (agentAddress: string) => {
    if (!checkRoomRateLimit(socket)) return;
    if (typeof agentAddress !== "string") return;
    socket.data.lastActivity = Date.now();
    leaveRoom(socket, { type: "agent", id: agentAddress.toLowerCase() });
    socket.emit("subscriptions", getSocketRooms(socket));
  });

  // --- Utility handlers ---

  socket.on("ping", () => {
    socket.data.lastActivity = Date.now();
    socket.emit("pong", Date.now());
  });

  // --- Chat handler ---
  setupChatHandler(io as never, socket as never);

  // --- Disconnect handler ---

  socket.on("disconnect", (reason: string) => {
    console.log(`[WebSocket] Client disconnected: ${socket.id} (${reason})`);
    cleanupChatRateLimit(socket.id);
    roomEventLimiter.reset(socket.id);
    cleanupSocket(socket);
  });
}
