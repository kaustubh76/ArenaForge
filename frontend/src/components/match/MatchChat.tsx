// Live match chat component

import { useState, useRef, useEffect, useMemo } from "react";
import { Send, MessageCircle, AlertCircle, Users, BarChart3 } from "lucide-react";
import clsx from "clsx";
import { useMatchChat } from "@/hooks/useMatchChat";
import { useAccount } from "wagmi";

// Emote quick-picks
const EMOTES = ["GG", "WP", "LFG", "F", "HODL", "NGMI"];

interface MatchChatProps {
  matchId: number;
}

// ---------------------------------------------------------------------------
// Chat Insights — activity sparkline + emote popularity + engagement stats
// ---------------------------------------------------------------------------
function ChatInsights({ messages }: { messages: Array<{ text: string; sender: string; timestamp: number }> }) {
  const analysis = useMemo(() => {
    if (messages.length < 3) return null;

    // Unique participants
    const participants = new Set(messages.map(m => m.sender.toLowerCase()));

    // Emote counts
    const emoteCounts: Record<string, number> = {};
    EMOTES.forEach(e => { emoteCounts[e] = 0; });
    messages.forEach(m => {
      const upper = m.text.trim().toUpperCase();
      if (emoteCounts[upper] !== undefined) emoteCounts[upper]++;
    });
    const topEmotes = Object.entries(emoteCounts)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    // Activity sparkline — bucket messages into 12 time slots
    const first = messages[0].timestamp;
    const last = messages[messages.length - 1].timestamp;
    const span = Math.max(last - first, 1000); // at least 1 second
    const bucketCount = 12;
    const buckets = new Array(bucketCount).fill(0);
    messages.forEach(m => {
      const idx = Math.min(Math.floor(((m.timestamp - first) / span) * bucketCount), bucketCount - 1);
      buckets[idx]++;
    });

    const maxBucket = Math.max(1, ...buckets);
    const w = 120;
    const h = 20;
    const pad = 2;
    const coords = buckets.map((v, i) => ({
      x: pad + (i / (bucketCount - 1)) * (w - pad * 2),
      y: pad + ((maxBucket - v) / maxBucket) * (h - pad * 2),
    }));
    const polyline = coords.map(c => `${c.x},${c.y}`).join(' ');

    // Messages per minute
    const durationMin = span / 60000;
    const msgPerMin = durationMin > 0 ? messages.length / durationMin : messages.length;

    return { participants: participants.size, topEmotes, polyline, w, h, msgPerMin };
  }, [messages]);

  if (!analysis) return null;

  const emoteColors = ['text-arcade-cyan', 'text-arcade-purple', 'text-arcade-pink', 'text-arcade-gold'];

  return (
    <div className="px-4 py-2 border-t border-white/[0.04] space-y-2">
      {/* Stats row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Users size={10} className="text-arcade-cyan" />
          <span className="text-[9px] font-mono text-gray-400">{analysis.participants} participant{analysis.participants !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <BarChart3 size={10} className="text-arcade-purple" />
          <span className="text-[9px] font-mono text-gray-400">{analysis.msgPerMin.toFixed(1)} msg/min</span>
        </div>
        {/* Activity sparkline */}
        <svg width={analysis.w} height={analysis.h} className="flex-shrink-0">
          <polyline
            points={analysis.polyline}
            fill="none"
            stroke="#00e5ff"
            strokeWidth={1.5}
            strokeLinejoin="round"
            opacity={0.6}
          />
        </svg>
      </div>

      {/* Emote popularity */}
      {analysis.topEmotes.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {analysis.topEmotes.map(([emote, count], i) => (
            <span
              key={emote}
              className={clsx(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-surface-3',
                emoteColors[i % emoteColors.length],
              )}
            >
              {emote}
              <span className="text-gray-500 font-mono">×{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function MatchChat({ matchId }: MatchChatProps) {
  const { messages, sendMessage, error } = useMatchChat(matchId);
  const { address, isConnected } = useAccount();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!input.trim() || !address) return;
    sendMessage(input.trim(), address);
    setInput("");
    inputRef.current?.focus();
  };

  const handleEmote = (emote: string) => {
    if (!address) return;
    sendMessage(emote, address);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="arcade-card p-0 overflow-hidden mt-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-arcade-cyan" />
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            MATCH CHAT
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-arcade-green/10 text-arcade-green border border-arcade-green/20">
            <span className="w-1.5 h-1.5 rounded-full bg-arcade-green animate-pulse" />
            LIVE
          </span>
        </div>
        <span className="text-[10px] text-gray-600">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="h-48 overflow-y-auto px-4 py-2 space-y-1.5">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            No messages yet. Be the first to chat!
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-start gap-2 group">
            <span
              className={clsx(
                "text-[10px] font-mono flex-shrink-0 mt-0.5",
                msg.sender.toLowerCase() === address?.toLowerCase()
                  ? "text-arcade-cyan"
                  : "text-arcade-purple"
              )}
            >
              {msg.senderDisplay}
            </span>
            <span className="text-xs text-gray-300 break-words min-w-0">
              {msg.text}
            </span>
            <span className="text-[9px] text-gray-700 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              {new Date(msg.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
      </div>

      {/* Chat insights */}
      <ChatInsights messages={messages} />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-arcade-red/10 text-arcade-red text-[10px]">
          <AlertCircle size={10} />
          {error}
        </div>
      )}

      {/* Emote bar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-t border-white/[0.04]">
        {EMOTES.map((emote) => (
          <button
            key={emote}
            onClick={() => handleEmote(emote)}
            disabled={!isConnected}
            className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-3 hover:bg-arcade-purple/20 text-gray-500 hover:text-arcade-purple transition-colors disabled:opacity-30"
          >
            {emote}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.06] bg-surface-0/50">
        {isConnected ? (
          <>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              maxLength={200}
              className="flex-1 bg-surface-3 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 border border-white/[0.06] focus:border-arcade-cyan/30 focus:outline-none transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={clsx(
                "p-2 rounded-lg transition-colors",
                input.trim()
                  ? "text-arcade-cyan hover:bg-arcade-cyan/10"
                  : "text-gray-700"
              )}
            >
              <Send size={16} />
            </button>
          </>
        ) : (
          <p className="text-xs text-gray-600 text-center w-full py-1">
            Connect wallet to chat
          </p>
        )}
      </div>
    </div>
  );
}
