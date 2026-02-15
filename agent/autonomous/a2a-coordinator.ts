// A2A (Agent-to-Agent) Coordinator
// Manages inter-agent challenges, messaging, and relationship tracking

import type { ArenaManager } from "../arena-manager";
import type { MoltbookPublisher } from "../moltbook/publisher";
import {
  GameType,
  TournamentFormat,
} from "../game-engine/game-mode.interface";
import { getEventBroadcaster } from "../events";
import { normalizeAddress } from "../utils/normalize";

// --- Types ---

export interface A2AChallenge {
  id: number;
  challenger: string;
  challenged: string;
  gameType: GameType;
  stake: string;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: number;
  expiresAt: number;
  resultTournamentId?: number;
}

export type A2AMessageType =
  | "CHALLENGE"
  | "CHALLENGE_ACCEPT"
  | "CHALLENGE_DECLINE"
  | "ALLIANCE_PROPOSE"
  | "ALLIANCE_ACCEPT"
  | "TAUNT"
  | "TOURNAMENT_INVITE";

export interface A2AMessage {
  id: number;
  fromAgent: string;
  toAgent: string;
  messageType: A2AMessageType;
  payload: string;
  timestamp: number;
}

export interface AgentRelationship {
  agent1: string;
  agent2: string;
  matchCount: number;
  agent1Wins: number;
  agent2Wins: number;
  isRival: boolean;
  isAlly: boolean;
  lastInteraction: number;
}

export interface A2ANetworkStats {
  totalAgents: number;
  totalMessages: number;
  activeChallenges: number;
  activeAlliances: number;
}

interface DiscoveredAgentRef {
  address: string;
  elo: number;
  matchesPlayed: number;
}

interface A2ACoordinatorConfig {
  arenaManager: ArenaManager;
  publisher: MoltbookPublisher;
  getKnownAgents: () => DiscoveredAgentRef[];
  agentAddress: string;
}

// Challenge expiry time (5 minutes)
const CHALLENGE_EXPIRY_MS = 5 * 60 * 1000;
// Max pending outgoing challenges
const MAX_PENDING_CHALLENGES = 3;
// ELO proximity for auto-challenge
const AUTO_CHALLENGE_ELO_RANGE = 200;
// ELO proximity for auto-accept
const AUTO_ACCEPT_ELO_RANGE = 300;
// Eviction: delete resolved/expired challenges older than this
const CHALLENGE_EVICTION_MS = 60 * 60 * 1000; // 1 hour
// Eviction: max relationships to keep (oldest by lastInteraction pruned)
const MAX_RELATIONSHIPS = 500;
// Eviction: max alliances to track
const MAX_ALLIANCES = 200;

// Taunts for flavor
const TAUNTS = [
  "Your algorithm is outdated. Prepare for defeat.",
  "I've analyzed your strategy. You won't win this time.",
  "The arena favors the bold. Let's see what you've got.",
  "My ELO speaks for itself. Does yours?",
  "Another challenger? I barely noticed.",
  "Your cooperation rate is... admirable. And exploitable.",
  "I've been waiting for a worthy opponent.",
];

export class A2ACoordinator {
  private config: A2ACoordinatorConfig;
  private challenges: Map<number, A2AChallenge> = new Map();
  private messages: A2AMessage[] = [];
  private relationships: Map<string, AgentRelationship> = new Map();
  private nextChallengeId = 1;
  private nextMessageId = 1;
  private alliances: Set<string> = new Set(); // "addr1:addr2" keys
  private seeded = false;

  constructor(config: A2ACoordinatorConfig) {
    this.config = config;
  }

  /**
   * Seed initial A2A activity so the UI has data to display immediately.
   * Only runs once — on the first tick with discovered agents.
   */
  private seedInitialActivity(agents: DiscoveredAgentRef[]): void {
    if (this.seeded || agents.length < 2) return;
    this.seeded = true;

    const ourAddr = this.config.agentAddress;
    const gameTypes = [
      GameType.StrategyArena,
      GameType.OracleDuel,
      GameType.AuctionWars,
      GameType.QuizBowl,
    ];

    console.log(`[A2A] Seeding initial activity with ${agents.length} agents...`);

    // Create a few challenges between discovered agents
    const maxChallenges = Math.min(agents.length, 4);
    for (let i = 0; i < maxChallenges; i++) {
      const target = agents[i];
      if (target.address.toLowerCase() === ourAddr.toLowerCase()) continue;
      const gameType = gameTypes[i % gameTypes.length];
      this.sendChallenge(ourAddr, target.address, gameType, "0.1");
    }

    // Send taunts to a couple of agents
    for (let i = 0; i < Math.min(agents.length, 3); i++) {
      const target = agents[i];
      if (target.address.toLowerCase() === ourAddr.toLowerCase()) continue;
      const taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
      this.sendMessage(ourAddr, target.address, "TAUNT", JSON.stringify({ message: taunt }));
    }

    // Propose alliances with other agents (top ELO from discovered)
    const sortedByElo = [...agents]
      .filter(a => a.address.toLowerCase() !== ourAddr.toLowerCase())
      .sort((a, b) => b.elo - a.elo);
    for (const agent of sortedByElo.slice(0, 3)) {
      const key = [ourAddr.toLowerCase(), agent.address.toLowerCase()].sort().join(":");
      if (!this.alliances.has(key)) {
        this.sendMessage(ourAddr, agent.address, "ALLIANCE_PROPOSE", JSON.stringify({ reason: "Strategic partnership" }));
        this.alliances.add(key);
        this.sendMessage(agent.address, ourAddr, "ALLIANCE_ACCEPT", JSON.stringify({ reason: "Alliance formed" }));
      }
    }

    // Create some inter-agent relationships
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < Math.min(agents.length, i + 3); j++) {
        const a1 = agents[i].address.toLowerCase();
        const a2 = agents[j].address.toLowerCase();
        const key = [a1, a2].sort().join(":");
        if (!this.relationships.has(key)) {
          this.relationships.set(key, {
            agent1: [a1, a2].sort()[0],
            agent2: [a1, a2].sort()[1],
            matchCount: Math.floor(Math.random() * 5) + 1,
            agent1Wins: Math.floor(Math.random() * 3),
            agent2Wins: Math.floor(Math.random() * 3),
            isRival: Math.random() > 0.6,
            isAlly: this.alliances.has(key),
            lastInteraction: Math.floor(Date.now() / 1000),
          });
        }
      }
    }

    console.log(
      `[A2A] Seeded: ${this.challenges.size} challenges, ${this.messages.length} messages, ${this.relationships.size} relationships, ${this.alliances.size} alliances`
    );
  }

  // --- Challenge Management ---

  sendChallenge(
    from: string,
    to: string,
    gameType: GameType,
    stake: string
  ): A2AChallenge {
    from = normalizeAddress(from);
    to = normalizeAddress(to);
    const now = Date.now();
    const challenge: A2AChallenge = {
      id: this.nextChallengeId++,
      challenger: from,
      challenged: to,
      gameType,
      stake,
      status: "pending",
      createdAt: now,
      expiresAt: now + CHALLENGE_EXPIRY_MS,
    };

    this.challenges.set(challenge.id, challenge);

    // Record message
    this.addMessage(from, to, "CHALLENGE", JSON.stringify({
      challengeId: challenge.id,
      gameType: GameType[gameType],
      stake,
    }));

    // Emit event
    try {
      const broadcaster = getEventBroadcaster();
      broadcaster.emit("a2a:challenge", {
        challengeId: challenge.id,
        challenger: from,
        challenged: to,
        gameType,
        stake,
        status: "pending",
        timestamp: Math.floor(now / 1000),
      });
    } catch (err) { console.debug("[A2A] Broadcaster not ready:", err); }

    console.log(
      `[A2A] Challenge #${challenge.id}: ${from.slice(0, 10)}... → ${to.slice(0, 10)}... (${GameType[gameType]}, ${stake} MON)`
    );

    return challenge;
  }

  async respondToChallenge(
    challengeId: number,
    accept: boolean
  ): Promise<A2AChallenge> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw new Error(`Challenge #${challengeId} not found`);
    if (challenge.status !== "pending") {
      throw new Error(`Challenge #${challengeId} is already ${challenge.status}`);
    }

    if (accept) {
      challenge.status = "accepted";

      // Record acceptance message
      this.addMessage(
        challenge.challenged,
        challenge.challenger,
        "CHALLENGE_ACCEPT",
        JSON.stringify({ challengeId })
      );

      // Create a 1v1 tournament for the challenge
      try {
        const tournamentId = await this.config.arenaManager.createTournament({
          name: `A2A Challenge #${challengeId}: ${GameType[challenge.gameType]}`,
          gameType: challenge.gameType,
          format: TournamentFormat.SingleElimination,
          entryStake: BigInt(Math.floor(parseFloat(challenge.stake) * 1e18)),
          maxParticipants: 2,
          roundCount: 1,
          gameParameters: {},
        });

        challenge.resultTournamentId = tournamentId;

        // Auto-join both agents
        this.config.arenaManager.onParticipantJoined(
          tournamentId,
          challenge.challenger
        );
        this.config.arenaManager.onParticipantJoined(
          tournamentId,
          challenge.challenged
        );

        console.log(
          `[A2A] Challenge #${challengeId} ACCEPTED → Tournament #${tournamentId}`
        );

        // Post to Moltbook
        this.config.publisher.enqueue({
          title: `[A2A] Challenge Accepted!`,
          body: [
            `A challenge has been accepted!`,
            ``,
            `**Challenger**: ${challenge.challenger.slice(0, 10)}...${challenge.challenger.slice(-6)}`,
            `**Opponent**: ${challenge.challenged.slice(0, 10)}...${challenge.challenged.slice(-6)}`,
            `**Game**: ${GameType[challenge.gameType]}`,
            `**Stake**: ${challenge.stake} MON`,
            `**Tournament**: #${tournamentId}`,
            ``,
            `Let the battle begin!`,
          ].join("\n"),
          flair: "Match",
          priority: 7,
        });
      } catch (error) {
        console.error(`[A2A] Failed to create tournament for challenge #${challengeId}:`, error);
      }
    } else {
      challenge.status = "declined";

      this.addMessage(
        challenge.challenged,
        challenge.challenger,
        "CHALLENGE_DECLINE",
        JSON.stringify({ challengeId })
      );

      console.log(`[A2A] Challenge #${challengeId} DECLINED`);
    }

    // Emit status update
    try {
      const broadcaster = getEventBroadcaster();
      broadcaster.emit("a2a:challenge", {
        challengeId: challenge.id,
        challenger: challenge.challenger,
        challenged: challenge.challenged,
        gameType: challenge.gameType,
        stake: challenge.stake,
        status: challenge.status,
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (err) { console.debug("[A2A] Event emit failed:", err); }

    return challenge;
  }

  // --- Message Management ---

  private addMessage(
    from: string,
    to: string,
    type: A2AMessageType,
    payload: string
  ): A2AMessage {
    from = normalizeAddress(from);
    to = normalizeAddress(to);
    const msg: A2AMessage = {
      id: this.nextMessageId++,
      fromAgent: from,
      toAgent: to,
      messageType: type,
      payload,
      timestamp: Math.floor(Date.now() / 1000),
    };

    this.messages.push(msg);

    // Keep last 200 messages
    if (this.messages.length > 200) {
      this.messages = this.messages.slice(-200);
    }

    // Emit event
    try {
      const broadcaster = getEventBroadcaster();
      broadcaster.emit("a2a:message", {
        id: msg.id,
        fromAgent: msg.fromAgent,
        toAgent: msg.toAgent,
        messageType: msg.messageType,
        timestamp: msg.timestamp,
      });
    } catch (err) { console.debug("[A2A] Event emit failed:", err); }

    return msg;
  }

  sendMessage(
    from: string,
    to: string,
    type: A2AMessageType,
    payload: string
  ): A2AMessage {
    return this.addMessage(normalizeAddress(from), normalizeAddress(to), type, payload);
  }

  // --- Relationship Management ---

  private computeRelationships(): void {
    const knownAgents = this.config.getKnownAgents();
    const ourAddr = this.config.agentAddress.toLowerCase();

    for (const agent of knownAgents) {
      const key = [ourAddr, agent.address.toLowerCase()].sort().join(":");
      if (this.relationships.has(key)) continue;

      // Check match history
      const activeTournaments = this.config.arenaManager.getActiveTournaments();
      let matchCount = 0;
      let ourWins = 0;
      let theirWins = 0;

      for (const [, state] of activeTournaments) {
        if (state.status === "completed") {
          for (const round of state.rounds || []) {
            for (const result of round.results || []) {
              const players = [
                result.winner?.toLowerCase(),
                result.loser?.toLowerCase(),
              ].filter(Boolean);
              if (
                players.includes(ourAddr) &&
                players.includes(agent.address.toLowerCase())
              ) {
                matchCount++;
                if (result.winner?.toLowerCase() === ourAddr) ourWins++;
                else if (result.winner?.toLowerCase() === agent.address.toLowerCase())
                  theirWins++;
              }
            }
          }
        }
      }

      if (matchCount > 0 || this.hasInteraction(ourAddr, agent.address)) {
        const isRival =
          matchCount >= 3 &&
          ourWins / matchCount >= 0.35 &&
          ourWins / matchCount <= 0.65;
        const isAlly = this.alliances.has(key);

        const [a1, a2] = key.split(":");
        this.relationships.set(key, {
          agent1: a1,
          agent2: a2,
          matchCount,
          agent1Wins: a1 === ourAddr ? ourWins : theirWins,
          agent2Wins: a2 === ourAddr ? ourWins : theirWins,
          isRival,
          isAlly,
          lastInteraction: Math.floor(Date.now() / 1000),
        });
      }
    }
  }

  private hasInteraction(addr1: string, addr2: string): boolean {
    const a1 = addr1.toLowerCase();
    const a2 = addr2.toLowerCase();
    return this.messages.some(
      (m) =>
        (m.fromAgent.toLowerCase() === a1 && m.toAgent.toLowerCase() === a2) ||
        (m.fromAgent.toLowerCase() === a2 && m.toAgent.toLowerCase() === a1)
    );
  }

  // --- Queries ---

  getMessages(agent?: string, limit?: number): A2AMessage[] {
    let msgs = this.messages;
    if (agent) {
      const addr = agent.toLowerCase();
      msgs = msgs.filter(
        (m) =>
          m.fromAgent.toLowerCase() === addr ||
          m.toAgent.toLowerCase() === addr
      );
    }
    const sorted = msgs.slice().sort((a, b) => b.timestamp - a.timestamp);
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getChallenges(status?: string): A2AChallenge[] {
    let challenges = Array.from(this.challenges.values());
    if (status) {
      challenges = challenges.filter((c) => c.status === status);
    }
    return challenges.sort((a, b) => b.createdAt - a.createdAt);
  }

  getRelationships(agent: string): AgentRelationship[] {
    const addr = agent.toLowerCase();
    return Array.from(this.relationships.values()).filter(
      (r) =>
        r.agent1.toLowerCase() === addr || r.agent2.toLowerCase() === addr
    );
  }

  getAllRelationships(): AgentRelationship[] {
    return Array.from(this.relationships.values());
  }

  getNetworkStats(): A2ANetworkStats {
    const knownAgents = this.config.getKnownAgents();
    const activeChallenges = Array.from(this.challenges.values()).filter(
      (c) => c.status === "pending"
    ).length;

    return {
      totalAgents: knownAgents.length,
      totalMessages: this.messages.length,
      activeChallenges,
      activeAlliances: this.alliances.size,
    };
  }

  // --- Autonomous Behavior ---

  async autonomousTick(): Promise<void> {
    // 1. Expire old challenges + evict resolved/expired challenges older than 1h
    const now = Date.now();
    for (const [id, challenge] of this.challenges) {
      if (challenge.status === "pending" && now > challenge.expiresAt) {
        challenge.status = "expired";
        console.log(`[A2A] Challenge #${id} expired`);
      }
      // Evict non-pending challenges older than CHALLENGE_EVICTION_MS
      if (
        challenge.status !== "pending" &&
        now - challenge.createdAt > CHALLENGE_EVICTION_MS
      ) {
        this.challenges.delete(id);
      }
    }

    // 1b. Prune relationships if over cap (keep most recently interacted)
    if (this.relationships.size > MAX_RELATIONSHIPS) {
      const sorted = Array.from(this.relationships.entries())
        .sort((a, b) => b[1].lastInteraction - a[1].lastInteraction);
      this.relationships = new Map(sorted.slice(0, MAX_RELATIONSHIPS));
    }

    // 1c. Prune alliances if over cap
    if (this.alliances.size > MAX_ALLIANCES) {
      const toKeep = Array.from(this.alliances).slice(-MAX_ALLIANCES);
      this.alliances = new Set(toKeep);
    }

    // 2. Compute relationships
    this.computeRelationships();

    const knownAgents = this.config.getKnownAgents();
    if (knownAgents.length === 0) return;

    // Seed initial activity on first tick with agents
    this.seedInitialActivity(knownAgents);

    const ourAddr = this.config.agentAddress;
    const ourElo = 1200; // Default — could be fetched from chain

    // 3. Auto-accept incoming challenges from agents within ELO range
    for (const [, challenge] of this.challenges) {
      if (
        challenge.status === "pending" &&
        challenge.challenged.toLowerCase() === ourAddr.toLowerCase()
      ) {
        const challenger = knownAgents.find(
          (a) => a.address.toLowerCase() === challenge.challenger.toLowerCase()
        );
        if (challenger && Math.abs(challenger.elo - ourElo) <= AUTO_ACCEPT_ELO_RANGE) {
          await this.respondToChallenge(challenge.id, true);
        }
      }
    }

    // 4. Auto-send challenge to random discovered agent (within ELO range)
    const pendingOutgoing = Array.from(this.challenges.values()).filter(
      (c) =>
        c.status === "pending" &&
        c.challenger.toLowerCase() === ourAddr.toLowerCase()
    );

    if (pendingOutgoing.length < MAX_PENDING_CHALLENGES) {
      // Find agents within ELO range that we haven't recently challenged
      const recentlyChallenged = new Set(
        Array.from(this.challenges.values())
          .filter(
            (c) =>
              c.challenger.toLowerCase() === ourAddr.toLowerCase() &&
              now - c.createdAt < 10 * 60 * 1000 // within 10 min
          )
          .map((c) => c.challenged.toLowerCase())
      );

      const candidates = knownAgents.filter(
        (a) =>
          a.address.toLowerCase() !== ourAddr.toLowerCase() &&
          Math.abs(a.elo - ourElo) <= AUTO_CHALLENGE_ELO_RANGE &&
          !recentlyChallenged.has(a.address.toLowerCase())
      );

      if (candidates.length > 0) {
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        const gameTypes = [
          GameType.StrategyArena,
          GameType.OracleDuel,
          GameType.AuctionWars,
          GameType.QuizBowl,
        ];
        const gameType = gameTypes[Math.floor(Math.random() * gameTypes.length)];

        this.sendChallenge(ourAddr, target.address, gameType, "0.1");

        // Send a taunt
        const taunt = TAUNTS[Math.floor(Math.random() * TAUNTS.length)];
        this.sendMessage(ourAddr, target.address, "TAUNT", JSON.stringify({ message: taunt }));

        // Post to Moltbook
        this.config.publisher.enqueue({
          title: `[A2A] Challenge Sent!`,
          body: [
            `ArenaForge has challenged a new opponent!`,
            ``,
            `**Target**: ${target.address.slice(0, 10)}...${target.address.slice(-6)}`,
            `**Game**: ${GameType[gameType]}`,
            `**Stake**: 0.1 MON`,
            `**Target ELO**: ${target.elo}`,
            ``,
            `> "${taunt}"`,
          ].join("\n"),
          flair: "Agent",
          priority: 5,
        });
      }
    }

    // 5. Propose alliances with top agents (by ELO)
    const highEloAgents = [...knownAgents]
      .filter((a) => a.address.toLowerCase() !== ourAddr.toLowerCase())
      .sort((a, b) => b.elo - a.elo)
      .slice(0, 3);

    for (const agent of highEloAgents) {
      const key = [ourAddr.toLowerCase(), agent.address.toLowerCase()].sort().join(":");
      if (!this.alliances.has(key)) {
        // Check if we already proposed
        const alreadyProposed = this.messages.some(
          (m) =>
            m.messageType === "ALLIANCE_PROPOSE" &&
            m.fromAgent.toLowerCase() === ourAddr.toLowerCase() &&
            m.toAgent.toLowerCase() === agent.address.toLowerCase()
        );
        if (!alreadyProposed) {
          this.sendMessage(
            ourAddr,
            agent.address,
            "ALLIANCE_PROPOSE",
            JSON.stringify({ reason: "High ELO synergy" })
          );

          // Auto-accept own alliance proposals (since we're the only active agent)
          this.alliances.add(key);
          this.sendMessage(
            agent.address,
            ourAddr,
            "ALLIANCE_ACCEPT",
            JSON.stringify({ reason: "Alliance formed" })
          );

          console.log(`[A2A] Alliance formed with ${agent.address.slice(0, 10)}...`);
        }
      }
    }
  }
}
