// WebSocket module exports

export {
  WebSocketServer,
  getWebSocketServer,
  stopWebSocketServer,
  type WebSocketServerConfig,
} from "./server";

export {
  setupSocketHandlers,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type InterServerEvents,
  type SocketData,
} from "./handlers";

export {
  joinRoom,
  leaveRoom,
  cleanupSocket,
  getSocketRooms,
  getRoomSize,
  broadcastToRoom,
  broadcastToRooms,
  getRoomStats,
} from "./rooms";

export {
  setupChatHandler,
  clearChatHistory,
  getChatHistory,
  cleanupChatRateLimit,
  type ChatMessage,
} from "./chat";
