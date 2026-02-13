// Single event row in the activity feed

import clsx from "clsx";
import type { RealtimeEvent } from "@/stores/realtimeStore";
import { formatEventDisplay } from "./formatEvent";
import { timeAgo } from "./timeAgo";

const COLOR_CLASSES: Record<string, string> = {
  cyan: "text-arcade-cyan bg-arcade-cyan/10",
  purple: "text-arcade-purple bg-arcade-purple/10",
  green: "text-arcade-green bg-arcade-green/10",
  gold: "text-arcade-gold bg-arcade-gold/10",
  pink: "text-arcade-pink bg-arcade-pink/10",
};

interface ActivityFeedItemProps {
  event: RealtimeEvent;
  onNavigate: (path: string) => void;
}

export function ActivityFeedItem({ event, onNavigate }: ActivityFeedItemProps) {
  const display = formatEventDisplay(event);
  const IconComponent = display.icon;
  const isRecent = Date.now() - event.timestamp < 30_000; // 30 seconds

  return (
    <button
      onClick={() => display.linkTo && onNavigate(display.linkTo)}
      className={clsx(
        "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors relative",
        "hover:bg-surface-3/50",
        display.linkTo ? "cursor-pointer" : "cursor-default",
        isRecent && "bg-surface-2/30"
      )}
    >
      {/* Left color bar indicator */}
      <div
        className={clsx("absolute left-0 top-1 bottom-1 w-0.5 rounded-r", {
          "bg-arcade-cyan": display.color === "cyan",
          "bg-arcade-purple": display.color === "purple",
          "bg-arcade-green": display.color === "green",
          "bg-arcade-gold": display.color === "gold",
          "bg-arcade-pink": display.color === "pink",
        })}
        style={{ opacity: isRecent ? 1 : 0.3 }}
      />
      <span
        className={clsx(
          "p-1.5 rounded-lg flex-shrink-0 mt-0.5 relative",
          COLOR_CLASSES[display.color]
        )}
      >
        <IconComponent size={14} />
        {isRecent && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-arcade-green animate-pulse" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white truncate">
          {display.title}
        </p>
        <p className="text-[10px] text-gray-500 truncate">
          {display.description}
        </p>
      </div>
      <span className={clsx(
        "text-[9px] flex-shrink-0 mt-0.5 whitespace-nowrap",
        isRecent ? "text-arcade-cyan font-mono" : "text-gray-600"
      )}>
        {timeAgo(event.timestamp)}
      </span>
    </button>
  );
}
