// Room management utilities for Socket.IO

import type { Server, Socket } from "socket.io";
import type { Room, RoomType } from "../../events";
import { getRoomName } from "../../events";

export interface RoomSubscription {
  type: RoomType;
  id?: number | string;
  joinedAt: number;
}

// Track subscriptions per socket
const socketSubscriptions = new Map<string, Set<string>>();

/**
 * Join a socket to a room.
 */
export function joinRoom(socket: Socket, room: Room): void {
  const roomName = getRoomName(room);
  socket.join(roomName);

  // Track subscription
  if (!socketSubscriptions.has(socket.id)) {
    socketSubscriptions.set(socket.id, new Set());
  }
  socketSubscriptions.get(socket.id)!.add(roomName);

  console.log(`[WebSocket] Socket ${socket.id} joined room: ${roomName}`);
}

/**
 * Leave a socket from a room.
 */
export function leaveRoom(socket: Socket, room: Room): void {
  const roomName = getRoomName(room);
  socket.leave(roomName);

  // Remove from tracking
  socketSubscriptions.get(socket.id)?.delete(roomName);

  console.log(`[WebSocket] Socket ${socket.id} left room: ${roomName}`);
}

/**
 * Get all rooms a socket is subscribed to.
 */
export function getSocketRooms(socket: Socket): string[] {
  return Array.from(socketSubscriptions.get(socket.id) ?? []);
}

/**
 * Clean up socket subscriptions on disconnect.
 */
export function cleanupSocket(socket: Socket): void {
  socketSubscriptions.delete(socket.id);
  console.log(`[WebSocket] Cleaned up subscriptions for socket ${socket.id}`);
}

/**
 * Get the number of clients in a room.
 */
export async function getRoomSize(io: Server, room: Room): Promise<number> {
  const roomName = getRoomName(room);
  const sockets = await io.in(roomName).fetchSockets();
  return sockets.length;
}

/**
 * Broadcast to a room.
 */
export function broadcastToRoom<T>(
  io: Server,
  room: Room,
  event: string,
  data: T
): void {
  const roomName = getRoomName(room);
  io.to(roomName).emit(event, data);
}

/**
 * Broadcast to multiple rooms.
 */
export function broadcastToRooms<T>(
  io: Server,
  rooms: Room[],
  event: string,
  data: T
): void {
  const roomNames = rooms.map(getRoomName);

  // Emit to all rooms at once
  if (roomNames.length > 0) {
    io.to(roomNames).emit(event, data);
  }
}

/**
 * Get statistics about room subscriptions.
 */
export function getRoomStats(): {
  totalSockets: number;
  roomCounts: Record<string, number>;
} {
  const roomCounts: Record<string, number> = {};

  for (const rooms of socketSubscriptions.values()) {
    for (const room of rooms) {
      roomCounts[room] = (roomCounts[room] ?? 0) + 1;
    }
  }

  return {
    totalSockets: socketSubscriptions.size,
    roomCounts,
  };
}
