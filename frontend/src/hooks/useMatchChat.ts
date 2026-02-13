// Hook for live match chat via WebSocket

import { useEffect, useState, useCallback, useRef } from "react";
import {
  getWebSocketClient,
  type ChatMessageEvent,
  type ChatErrorEvent,
} from "@/lib/websocket";

export interface ChatMessage {
  id: string;
  matchId: number;
  sender: string;
  senderDisplay: string;
  text: string;
  timestamp: number;
}

interface UseMatchChatReturn {
  messages: ChatMessage[];
  sendMessage: (text: string, sender: string) => void;
  error: string | null;
  clearError: () => void;
}

const MAX_MESSAGES = 100;

export function useMatchChat(matchId: number | null): UseMatchChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (matchId === null) return;

    const client = getWebSocketClient();

    const unsubMessage = client.subscribe<ChatMessageEvent>(
      "chat:message",
      (data) => {
        if (data.matchId === matchId) {
          setMessages((prev) => {
            const updated = [...prev, data];
            return updated.length > MAX_MESSAGES
              ? updated.slice(-MAX_MESSAGES)
              : updated;
          });
        }
      }
    );

    const unsubError = client.subscribe<ChatErrorEvent>(
      "chat:error",
      (data) => {
        setError(data.message);
        if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = setTimeout(() => setError(null), 3000);
      }
    );

    return () => {
      unsubMessage();
      unsubError();
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, [matchId]);

  const sendMessage = useCallback(
    (text: string, sender: string) => {
      if (matchId === null) return;
      const client = getWebSocketClient();
      client.sendChatMessage(matchId, text, sender);
    },
    [matchId]
  );

  const clearError = useCallback(() => setError(null), []);

  return { messages, sendMessage, error, clearError };
}
