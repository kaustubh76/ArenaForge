// Server-side chat handler for live match chat

import type { Server, Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./handlers";
import { getRoomName } from "../../events";

export interface ChatMessage {
  id: string;
  matchId: number;
  sender: string;
  senderDisplay: string;
  text: string;
  timestamp: number;
}

// Rate limiting: 1 message per second per socket
const rateLimits = new Map<string, number>();

// Message history per match room (max 100)
const chatHistory = new Map<number, ChatMessage[]>();

const MAX_MESSAGES_PER_ROOM = 100;
const MAX_TEXT_LENGTH = 200;
const RATE_LIMIT_MS = 1000;

function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function setupChatHandler(
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
): void {
  socket.on("chat:send" as keyof ClientToServerEvents, ((data: { matchId: number; text: string; sender: string }) => {
    // Validate matchId
    if (typeof data.matchId !== "number" || data.matchId < 1) {
      socket.emit("chat:error" as keyof ServerToClientEvents, { message: "Invalid match ID" } as never);
      return;
    }

    // Validate text
    if (typeof data.text !== "string" || data.text.trim().length === 0) {
      socket.emit("chat:error" as keyof ServerToClientEvents, { message: "Empty message" } as never);
      return;
    }

    // Validate sender
    if (typeof data.sender !== "string" || !data.sender.startsWith("0x")) {
      socket.emit("chat:error" as keyof ServerToClientEvents, { message: "Invalid sender" } as never);
      return;
    }

    // Verify socket is in the match room
    const matchRoom = getRoomName({ type: "match", id: data.matchId });
    if (!socket.rooms.has(matchRoom)) {
      socket.emit("chat:error" as keyof ServerToClientEvents, { message: "Not subscribed to this match" } as never);
      return;
    }

    // Rate limiting
    const now = Date.now();
    const lastMessage = rateLimits.get(socket.id) ?? 0;
    if (now - lastMessage < RATE_LIMIT_MS) {
      socket.emit("chat:error" as keyof ServerToClientEvents, { message: "Too fast. Wait 1 second between messages." } as never);
      return;
    }
    rateLimits.set(socket.id, now);

    // Sanitize text
    const text = data.text.trim().slice(0, MAX_TEXT_LENGTH);

    // Build message
    const message: ChatMessage = {
      id: `chat-${data.matchId}-${now}-${socket.id.slice(-4)}`,
      matchId: data.matchId,
      sender: data.sender,
      senderDisplay: truncateAddress(data.sender),
      text,
      timestamp: now,
    };

    // Store in history
    if (!chatHistory.has(data.matchId)) {
      chatHistory.set(data.matchId, []);
    }
    const history = chatHistory.get(data.matchId)!;
    history.push(message);
    if (history.length > MAX_MESSAGES_PER_ROOM) {
      history.shift();
    }

    // Broadcast to match room
    io.to(matchRoom).emit("chat:message" as keyof ServerToClientEvents, message as never);

    socket.data.lastActivity = now;
  }) as never);
}

/** Clean up chat history for a completed match */
export function clearChatHistory(matchId: number): void {
  chatHistory.delete(matchId);
}

/** Get chat history for a match (for late-joining clients) */
export function getChatHistory(matchId: number): ChatMessage[] {
  return chatHistory.get(matchId) ?? [];
}

/** Remove rate limit tracking for a disconnected socket */
export function cleanupChatRateLimit(socketId: string): void {
  rateLimits.delete(socketId);
}
