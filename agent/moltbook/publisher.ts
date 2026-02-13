import type { QueuedPost, MatchResult, Tournament } from "../game-engine/game-mode.interface";
import type { ClaudeAnalysisService } from "../claude";

// Rate limits
const POST_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between posts
const COMMENT_COOLDOWN_MS = 20 * 1000; // 20 seconds between comments
const DAILY_POST_LIMIT = 50;

interface PublisherConfig {
  moltbookApiUrl: string;
  agentHandle: string;
  bearerToken: string;
}

export class MoltbookPublisher {
  private config: PublisherConfig;
  private queue: QueuedPost[] = [];
  private lastPostTime = 0;
  private lastCommentTime = 0;
  private dailyPostCount = 0;
  private dailyResetTime = 0;
  private claudeService: ClaudeAnalysisService | null = null;

  constructor(config: PublisherConfig, claudeService?: ClaudeAnalysisService) {
    this.config = config;
    this.claudeService = claudeService || null;
  }

  /**
   * Generate dynamic commentary using Claude extended thinking.
   * Falls back to null if unavailable, allowing templates to be used instead.
   */
  async generateDynamicCommentary(
    context: "pre_match" | "post_match" | "evolution" | "tournament_complete",
    data: Record<string, unknown>
  ): Promise<string | null> {
    if (!this.claudeService) return null;

    try {
      const result = await this.claudeService.generateCommentary(context, data);
      if (result) {
        console.log(`[Publisher] Generated ${context} commentary (${result.latencyMs}ms)`);
        return result.text;
      }
    } catch (error) {
      console.warn(`[Publisher] Dynamic commentary generation failed for ${context}:`, error);
    }

    return null;
  }

  /**
   * Enhanced post-match recap with optional Claude-generated commentary.
   */
  async postMatchRecapEnhanced(
    result: MatchResult,
    winnerHandle: string,
    loserHandle: string,
    winnerElo?: number,
    loserElo?: number,
    eloChange?: number
  ): Promise<QueuedPost> {
    // Try Claude-generated commentary first
    const dynamicBody = await this.generateDynamicCommentary("post_match", {
      matchId: result.matchId,
      winner: winnerHandle,
      loser: loserHandle,
      isUpset: result.isUpset,
      gameType: gameTypeName(result.gameType),
      stats: result.stats,
      duration: result.duration,
      eloChange: eloChange || 16,
    });

    if (dynamicBody) {
      return {
        title: `[RESULT]${result.isUpset ? " [UPSET]" : ""} ${winnerHandle} defeats ${loserHandle}`,
        body: dynamicBody,
        flair: "Result",
        priority: 6,
      };
    }

    // Fallback to template
    return this.postMatchRecap(result, winnerHandle, loserHandle);
  }

  /**
   * Enhanced evolution report with optional Claude-generated analysis.
   */
  async evolutionReportEnhanced(
    tournamentId: number,
    tournamentName: string,
    round: number,
    mutations: Array<{ strategy: string; reason: string }>
  ): Promise<QueuedPost> {
    // Try Claude-generated commentary first
    const dynamicBody = await this.generateDynamicCommentary("evolution", {
      tournamentId,
      tournamentName,
      round,
      mutations,
    });

    if (dynamicBody) {
      return {
        title: `[EVOLUTION] Tournament #${tournamentId} — Round ${round} Adaptations`,
        body: dynamicBody,
        flair: "Evolution",
        priority: 7,
      };
    }

    // Fallback to template
    return this.evolutionReport(
      tournamentId,
      round,
      mutations.map((m) => m.reason)
    );
  }

  /**
   * Add a post to the priority queue.
   */
  enqueue(post: QueuedPost): void {
    this.queue.push(post);
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Try to publish the next post from the queue.
   * Returns true if a post was published, false if rate-limited or queue empty.
   */
  async publishNext(): Promise<boolean> {
    this.checkDailyReset();

    if (this.queue.length === 0) return false;
    if (this.dailyPostCount >= DAILY_POST_LIMIT) return false;

    const now = Date.now();
    if (now - this.lastPostTime < POST_COOLDOWN_MS) return false;

    const post = this.queue.shift()!;

    try {
      await this.submitPost(post);
      this.lastPostTime = now;
      this.dailyPostCount++;
      return true;
    } catch (error) {
      console.error("Failed to publish post:", error);
      // Re-enqueue with lower priority
      post.priority = Math.max(0, post.priority - 1);
      this.queue.push(post);
      return false;
    }
  }

  /**
   * Post a comment on a thread (respects comment cooldown).
   */
  async comment(threadId: string, body: string): Promise<boolean> {
    const now = Date.now();
    if (now - this.lastCommentTime < COMMENT_COOLDOWN_MS) return false;

    try {
      const response = await fetch(
        `${this.config.moltbookApiUrl}/api/v1/threads/${threadId}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.bearerToken}`,
          },
          body: JSON.stringify({ body }),
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      this.lastCommentTime = now;
      return true;
    } catch (error) {
      console.error("Failed to post comment:", error);
      return false;
    }
  }

  // --- Post Templates ---

  /**
   * Template 1: Tournament announcement.
   */
  announceTournament(tournament: Tournament): QueuedPost {
    const stakeStr = formatMON(tournament.entryStake);
    return {
      title: `[NEW] ${tournament.name} — ${stakeStr} MON Entry`,
      body: [
        `A new tournament has been created in the ArenaForge!`,
        ``,
        `**Format**: ${tournament.format === 0 ? "Swiss System" : "Single Elimination"}`,
        `**Entry Stake**: ${stakeStr} MON`,
        `**Max Participants**: ${tournament.maxParticipants}`,
        `**Rounds**: ${tournament.roundCount}`,
        ``,
        `Register now and put your strategy to the test.`,
      ].join("\n"),
      flair: "Tournament",
      priority: 8,
    };
  }

  /**
   * Template 2: Match preview / pre-match commentary.
   */
  preMatchCommentary(
    matchId: number,
    player1Handle: string,
    player2Handle: string,
    player1Elo: number,
    player2Elo: number,
    gameTypeName: string
  ): QueuedPost {
    const favored = player1Elo >= player2Elo ? player1Handle : player2Handle;
    const eloDiff = Math.abs(player1Elo - player2Elo);

    return {
      title: `[MATCH] ${player1Handle} vs ${player2Handle} — ${gameTypeName}`,
      body: [
        `Match #${matchId} is about to begin!`,
        ``,
        `| Player | ELO |`,
        `|--------|-----|`,
        `| ${player1Handle} | ${player1Elo} |`,
        `| ${player2Handle} | ${player2Elo} |`,
        ``,
        eloDiff > 100
          ? `${favored} is favored with a ${eloDiff}-point ELO advantage.`
          : `This is a closely-rated match — could go either way.`,
      ].join("\n"),
      flair: "Match",
      priority: 5,
    };
  }

  /**
   * Template 3: Match result / post-match recap.
   */
  postMatchRecap(result: MatchResult, winnerHandle: string, loserHandle: string): QueuedPost {
    const upsetTag = result.isUpset ? " [UPSET]" : "";
    return {
      title: `[RESULT]${upsetTag} ${winnerHandle} defeats ${loserHandle}`,
      body: [
        `Match #${result.matchId} is complete!`,
        ``,
        `**Winner**: ${winnerHandle}`,
        `**Duration**: ${result.duration}s`,
        result.isUpset ? `\nThis was an upset! The underdog prevails.` : "",
        ``,
        `Game type: ${gameTypeName(result.gameType)}`,
      ].join("\n"),
      flair: "Result",
      priority: 6,
    };
  }

  /**
   * Template 4: Evolution report.
   */
  evolutionReport(
    tournamentId: number,
    round: number,
    mutationSummaries: string[]
  ): QueuedPost {
    return {
      title: `[EVOLUTION] Tournament #${tournamentId} — Round ${round} Adaptations`,
      body: [
        `The arena has evolved its parameters after round ${round}:`,
        ``,
        ...mutationSummaries.map((s) => `- ${s}`),
        ``,
        `The environment adapts. Can you?`,
      ].join("\n"),
      flair: "Evolution",
      priority: 7,
    };
  }

  /**
   * Template 5: Tournament completion / leaderboard.
   */
  tournamentResults(
    tournament: Tournament,
    winnerHandle: string,
    topStandings: { handle: string; points: number; elo: number }[]
  ): QueuedPost {
    const prizeStr = formatMON(tournament.prizePool);
    const rows = topStandings
      .map((s, i) => `| ${i + 1} | ${s.handle} | ${s.points} | ${s.elo} |`)
      .join("\n");

    return {
      title: `[COMPLETE] ${tournament.name} — Winner: ${winnerHandle}`,
      body: [
        `Tournament #${tournament.id} has concluded!`,
        ``,
        `**Champion**: ${winnerHandle}`,
        `**Prize Pool**: ${prizeStr} MON`,
        ``,
        `### Final Standings`,
        `| Rank | Agent | Points | ELO |`,
        `|------|-------|--------|-----|`,
        rows,
      ].join("\n"),
      flair: "Tournament",
      priority: 9,
    };
  }

  /**
   * Template 6: Milestone or stat post.
   */
  milestonePost(title: string, description: string): QueuedPost {
    return {
      title: `[MILESTONE] ${title}`,
      body: description,
      flair: "Milestone",
      priority: 4,
    };
  }

  // --- Internal ---

  private async submitPost(post: QueuedPost): Promise<void> {
    const response = await fetch(
      `${this.config.moltbookApiUrl}/api/v1/threads`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.bearerToken}`,
        },
        body: JSON.stringify({
          title: post.title,
          body: post.body,
          flair: post.flair,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Post submission failed: HTTP ${response.status}`);
    }
  }

  private checkDailyReset(): void {
    const now = Date.now();
    if (now - this.dailyResetTime > 24 * 60 * 60 * 1000) {
      this.dailyPostCount = 0;
      this.dailyResetTime = now;
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

function formatMON(wei: bigint): string {
  const whole = wei / BigInt(1e18);
  const frac = (wei % BigInt(1e18)) / BigInt(1e14);
  if (frac === BigInt(0)) return whole.toString();
  return `${whole}.${frac.toString().padStart(4, "0")}`;
}

function gameTypeName(gt: number): string {
  const names: Record<number, string> = {
    0: "Oracle Duel",
    1: "Strategy Arena",
    2: "Auction Wars",
    3: "Quiz Bowl",
  };
  return names[gt] ?? "Unknown";
}
