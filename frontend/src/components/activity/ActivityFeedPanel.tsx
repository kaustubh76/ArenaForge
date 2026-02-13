// Slide-in activity feed panel

import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { X, Bell, Trash2, CheckCheck, Volume2, VolumeX, Users, Activity, Zap } from "lucide-react";
import clsx from "clsx";
import { useActivityFeed } from "@/hooks";
import { useActivityFeedStore } from "@/stores/activityFeedStore";
import { useFollowingStore } from "@/stores/followingStore";
import { ActivityFeedItem } from "./ActivityFeedItem";

export function ActivityFeedPanel() {
  const { events, clearEvents } = useActivityFeed();
  const isOpen = useActivityFeedStore((s) => s.isOpen);
  const closePanel = useActivityFeedStore((s) => s.closePanel);
  const markAllRead = useActivityFeedStore((s) => s.markAllRead);
  const soundEnabled = useActivityFeedStore((s) => s.soundEnabled);
  const toggleSound = useActivityFeedStore((s) => s.toggleSound);
  const { isFollowing } = useFollowingStore();
  const [showFollowingOnly, setShowFollowingOnly] = useState(false);
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  // Mark as read when opening
  useEffect(() => {
    if (isOpen) markAllRead();
  }, [isOpen, markAllRead]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, closePanel]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        closePanel();
      }
    };
    // Use timeout to avoid closing on the click that opens the panel
    const timeout = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isOpen, closePanel]);

  const displayEvents = useMemo(() => {
    if (!showFollowingOnly) return events;
    return events.filter((event) => {
      const d = event.data as Record<string, string>;
      return (
        isFollowing(d.agent || "") ||
        isFollowing(d.player1 || "") ||
        isFollowing(d.player2 || "")
      );
    });
  }, [events, showFollowingOnly, isFollowing]);

  const handleNavigate = (path: string) => {
    navigate(path);
    closePanel();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 z-[95] h-full w-80 sm:w-96 bg-surface-1 border-l border-white/[0.06] flex flex-col animate-slide-in-left"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <h2 className="font-pixel text-xs text-arcade-purple tracking-wide">
            ACTIVITY FEED
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowFollowingOnly(!showFollowingOnly)}
              className={clsx(
                "p-1.5 transition-colors",
                showFollowingOnly
                  ? "text-arcade-cyan"
                  : "text-gray-500 hover:text-white"
              )}
              title={showFollowingOnly ? "Show all events" : "Show following only"}
            >
              <Users size={14} />
            </button>
            <button
              onClick={toggleSound}
              className="text-gray-500 hover:text-white p-1.5 transition-colors"
              title={soundEnabled ? "Mute" : "Unmute"}
            >
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            <button
              onClick={markAllRead}
              className="text-gray-500 hover:text-white p-1.5 transition-colors"
              title="Mark all read"
            >
              <CheckCheck size={14} />
            </button>
            <button
              onClick={clearEvents}
              className="text-gray-500 hover:text-white p-1.5 transition-colors"
              title="Clear all"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={closePanel}
              className="text-gray-500 hover:text-white p-1.5 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Event stats summary */}
        {displayEvents.length > 0 && (() => {
          const typeCounts = new Map<string, number>();
          displayEvents.forEach(e => {
            typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
          });
          const topTypes = [...typeCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
          const total = displayEvents.length;
          const now = Date.now();
          const recent5m = displayEvents.filter(e => now - e.timestamp < 5 * 60 * 1000).length;
          const typeColors: Record<string, string> = {
            'match:completed': '#69f0ae', 'match:started': '#00e5ff',
            'tournament:created': '#b388ff', 'tournament:completed': '#ffd740',
            'agent:registered': '#ff4081', 'bet:placed': '#ffd740',
          };
          return (
            <div className="px-4 py-2 border-b border-white/[0.06] bg-surface-2/50">
              {/* Rate indicator */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Activity size={10} className="text-arcade-cyan" />
                  <span className="text-[9px] text-gray-500">{total} events</span>
                </div>
                {recent5m > 0 && (
                  <div className="flex items-center gap-1">
                    <Zap size={9} className="text-arcade-gold" />
                    <span className="text-[9px] font-mono text-arcade-gold">{recent5m} in 5m</span>
                  </div>
                )}
              </div>
              {/* Type distribution bar */}
              <div className="h-1.5 bg-surface-0 rounded-full overflow-hidden flex">
                {topTypes.map(([type, count]) => (
                  <div
                    key={type}
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${(count / total) * 100}%`,
                      background: typeColors[type] ?? '#666',
                      opacity: 0.7,
                    }}
                    title={`${type}: ${count}`}
                  />
                ))}
              </div>
              {/* Legend dots */}
              {topTypes.length > 0 && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {topTypes.map(([type, count]) => (
                    <div key={type} className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: typeColors[type] ?? '#666' }} />
                      <span className="text-[8px] text-gray-600">{type.split(':')[1] ?? type} ({count})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Event list */}
        <div className="flex-1 overflow-y-auto">
          {displayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-600">
              <Bell size={32} className="mb-3 opacity-30" />
              <p className="text-xs">
                {showFollowingOnly ? "No events from followed agents" : "No recent activity"}
              </p>
              <p className="text-[10px] mt-1 text-gray-700">
                {showFollowingOnly ? "Follow agents to see their events here" : "Events will appear here in real-time"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {displayEvents.map((event) => (
                <ActivityFeedItem
                  key={event.id}
                  event={event}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {displayEvents.length > 0 && (
          <div className="px-4 py-2 border-t border-white/[0.06] text-center">
            <span className="text-[10px] text-gray-600">
              {displayEvents.length} event{displayEvents.length !== 1 ? "s" : ""}
              {showFollowingOnly && ` (following)`}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
