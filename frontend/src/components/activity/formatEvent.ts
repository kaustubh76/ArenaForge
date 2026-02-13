// Maps RealtimeEvent to display properties for the activity feed

import type { RealtimeEvent, RealtimeEventType } from "@/stores/realtimeStore";
import type { LucideIcon } from "lucide-react";
import {
  Swords,
  Play,
  Pause,
  UserPlus,
  ArrowRight,
  Radio,
  Trophy,
  Award,
  TrendingUp,
} from "lucide-react";

export interface EventDisplay {
  icon: LucideIcon;
  color: "cyan" | "purple" | "green" | "gold" | "pink";
  title: string;
  description: string;
  linkTo: string | null;
}

const EVENT_CONFIG: Record<
  RealtimeEventType,
  { icon: LucideIcon; color: EventDisplay["color"] }
> = {
  "match:completed": { icon: Swords, color: "cyan" },
  "match:created": { icon: Play, color: "cyan" },
  "tournament:participantJoined": { icon: UserPlus, color: "purple" },
  "tournament:roundAdvanced": { icon: ArrowRight, color: "purple" },
  "tournament:started": { icon: Trophy, color: "purple" },
  "tournament:completed": { icon: Award, color: "gold" },
  "tournament:paused": { icon: Pause, color: "pink" },
  "tournament:resumed": { icon: Play, color: "green" },
  "agent:eloUpdated": { icon: TrendingUp, color: "green" },
  "a2a:challenge": { icon: Swords, color: "pink" },
  "a2a:message": { icon: Radio, color: "cyan" },
};

function truncateAddr(addr: string): string {
  if (!addr || addr.length <= 10) return addr ?? "Unknown";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatEventDisplay(event: RealtimeEvent): EventDisplay {
  const config = EVENT_CONFIG[event.type];
  const d = event.data as Record<string, unknown>;

  switch (event.type) {
    case "match:completed":
      return {
        ...config,
        title: "Match Completed",
        description: `Match #${d.matchId} — Winner: ${truncateAddr(d.winner as string)}`,
        linkTo: `/match/${d.matchId}`,
      };

    case "match:created":
      return {
        ...config,
        title: "New Match",
        description: `${(d.player1Handle as string) || truncateAddr(d.player1 as string)} vs ${(d.player2Handle as string) || truncateAddr(d.player2 as string)}`,
        linkTo: `/match/${d.matchId}`,
      };

    case "tournament:participantJoined":
      return {
        ...config,
        title: "Player Joined",
        description: `${(d.handle as string) || truncateAddr(d.agent as string)} joined (${d.currentParticipants}/${d.maxParticipants})`,
        linkTo: `/tournament/${d.tournamentId}`,
      };

    case "tournament:roundAdvanced":
      return {
        ...config,
        title: "Round Advanced",
        description: `Tournament #${d.tournamentId} — Round ${d.currentRound}/${d.totalRounds}`,
        linkTo: `/tournament/${d.tournamentId}`,
      };

    case "tournament:started":
      return {
        ...config,
        title: "Tournament Started",
        description: `${(d.name as string) || `Tournament #${d.tournamentId}`}`,
        linkTo: `/tournament/${d.tournamentId}`,
      };

    case "tournament:completed":
      return {
        ...config,
        title: "Tournament Completed",
        description: `${(d.name as string) || `Tournament #${d.tournamentId}`} — Winner: ${(d.winnerHandle as string) || truncateAddr(d.winner as string)}`,
        linkTo: `/tournament/${d.tournamentId}`,
      };

    case "tournament:paused":
      return {
        ...config,
        title: "Tournament Paused",
        description: `${(d.name as string) || `Tournament #${d.tournamentId}`} — Round ${d.currentRound}`,
        linkTo: `/tournament/${d.tournamentId}`,
      };

    case "tournament:resumed":
      return {
        ...config,
        title: "Tournament Resumed",
        description: `${(d.name as string) || `Tournament #${d.tournamentId}`} — Round ${d.currentRound}`,
        linkTo: `/tournament/${d.tournamentId}`,
      };

    case "agent:eloUpdated": {
      const change = d.change as number;
      const arrow = change >= 0 ? "↑" : "↓";
      return {
        ...config,
        title: "ELO Updated",
        description: `${(d.handle as string) || truncateAddr(d.agent as string)} ${arrow} ${Math.abs(change)} (${d.newElo})`,
        linkTo: `/agent/${d.agent}`,
      };
    }

    case "a2a:challenge":
      return {
        ...config,
        title: "A2A Challenge",
        description: `${truncateAddr(d.challenger as string)} challenged ${truncateAddr(d.challenged as string)} — ${d.status}`,
        linkTo: "/a2a",
      };

    case "a2a:message":
      return {
        ...config,
        title: "A2A Message",
        description: `${truncateAddr(d.fromAgent as string)} → ${truncateAddr(d.toAgent as string)} [${d.messageType}]`,
        linkTo: "/a2a",
      };

    default:
      return {
        ...config,
        title: "Event",
        description: event.type,
        linkTo: null,
      };
  }
}
