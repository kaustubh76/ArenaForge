// Bell icon button with unread count badge for the header

import { Bell } from "lucide-react";
import clsx from "clsx";
import { useActivityFeedStore } from "@/stores/activityFeedStore";

export function ActivityBellButton() {
  const togglePanel = useActivityFeedStore((s) => s.togglePanel);
  const unreadCount = useActivityFeedStore((s) => s.unreadCount);
  const hasUnread = unreadCount > 0;

  return (
    <button
      onClick={togglePanel}
      className={clsx(
        "relative text-gray-400 hover:text-white transition-colors p-2 group",
        hasUnread && "text-arcade-pink"
      )}
      aria-label={`Activity feed${hasUnread ? `, ${unreadCount} unread` : ""}`}
    >
      <Bell
        size={18}
        className={clsx(
          "transition-transform group-hover:scale-110",
          hasUnread && "animate-[bellRing_0.5s_ease-in-out_infinite_2s]"
        )}
        style={hasUnread ? {
          animation: 'bellRing 0.5s ease-in-out infinite',
          animationDelay: '2s',
          animationIterationCount: '3',
        } : undefined}
      />
      {hasUnread && (
        <>
          <span
            className={clsx(
              "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center",
              "rounded-full bg-arcade-pink text-white text-[9px] font-bold px-1",
              "animate-score-pop"
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
          {/* Subtle glow ring */}
          <span className="absolute inset-1 rounded-full bg-arcade-pink/10 animate-pulse pointer-events-none" />
        </>
      )}
    </button>
  );
}
