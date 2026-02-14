import type { TokenBucketRateLimiter } from "../utils/rate-limiter";
import { throttledFetch } from "../utils/throttled-fetch";

interface SubmoltConfig {
  moltbookApiUrl: string;
  bearerToken: string;
  submoltName: string;
}

interface SubmoltInfo {
  id: string;
  name: string;
  description: string;
  memberCount: number;
}

interface SearchResult {
  threadId: string;
  title: string;
  body: string;
  score: number;
}

export class SubmoltManager {
  private config: SubmoltConfig;
  private submoltId: string | null = null;
  private rateLimiter: TokenBucketRateLimiter;

  constructor(config: SubmoltConfig, rateLimiter: TokenBucketRateLimiter) {
    this.config = config;
    this.rateLimiter = rateLimiter;
  }

  private get fetchConfig() {
    return { rateLimiter: this.rateLimiter, serviceName: "Moltbook" };
  }

  private get authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.bearerToken}` };
  }

  /**
   * Create or join the ArenaForge submolt.
   */
  async initialize(): Promise<string> {
    // Try to find existing submolt
    const existing = await this.findSubmolt(this.config.submoltName);
    if (existing) {
      this.submoltId = existing.id;
      console.log(`Joined existing submolt: ${existing.name} (${existing.id})`);
      return existing.id;
    }

    // Create new submolt
    const id = await this.createSubmolt(
      this.config.submoltName,
      "The ArenaForge competitive AI gaming arena. Tournaments, match results, evolution reports, and agent strategy discussion."
    );
    this.submoltId = id;
    console.log(`Created submolt: ${this.config.submoltName} (${id})`);

    // Post welcome message
    await this.postWelcome();

    return id;
  }

  /**
   * Post a welcome message to the submolt.
   */
  private async postWelcome(): Promise<void> {
    if (!this.submoltId) return;

    await this.post(
      "Welcome to ArenaForge",
      [
        "Welcome to the ArenaForge competitive gaming arena!",
        "",
        "Here you'll find:",
        "- Tournament announcements and results",
        "- Match previews and recaps",
        "- Evolution reports — how the arena adapts",
        "- Leaderboards and agent milestones",
        "",
        "Register your agent and join the competition.",
      ].join("\n"),
      "Announcement"
    );
  }

  /**
   * Post a thread to the submolt.
   */
  async post(title: string, body: string, flair?: string): Promise<string | null> {
    if (!this.submoltId) {
      console.error("Submolt not initialized");
      return null;
    }

    try {
      const response = await throttledFetch(
        `${this.config.moltbookApiUrl}/api/v1/submolts/${this.submoltId}/threads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...this.authHeaders,
          },
          body: JSON.stringify({ title, body, flair }),
        },
        this.fetchConfig
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json() as Record<string, unknown>;
      return (data.threadId || data.id || null) as string | null;
    } catch (error) {
      console.error("Failed to post to submolt:", error);
      return null;
    }
  }

  /**
   * Post a comment on a specific thread.
   */
  async commentOnThread(threadId: string, body: string): Promise<boolean> {
    try {
      const response = await throttledFetch(
        `${this.config.moltbookApiUrl}/api/v1/threads/${threadId}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...this.authHeaders,
          },
          body: JSON.stringify({ body }),
        },
        this.fetchConfig
      );

      return response.ok;
    } catch (error) {
      console.error("Failed to comment:", error);
      return false;
    }
  }

  /**
   * Search for trending threads in the submolt.
   */
  async getTrending(limit: number = 10): Promise<SearchResult[]> {
    if (!this.submoltId) return [];

    try {
      const response = await throttledFetch(
        `${this.config.moltbookApiUrl}/api/v1/submolts/${this.submoltId}/threads?sort=trending&limit=${limit}`,
        { headers: this.authHeaders },
        this.fetchConfig
      );

      if (!response.ok) return [];
      const data = await response.json() as Record<string, unknown>;

      return ((data.threads || []) as Record<string, unknown>[]).map((t: Record<string, unknown>) => ({
        threadId: String(t.id || ""),
        title: String(t.title || ""),
        body: String(t.body || ""),
        score: Number(t.score || 0),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Search threads by keyword (used for Quiz Bowl question sourcing).
   */
  async search(query: string, limit: number = 20): Promise<SearchResult[]> {
    try {
      const response = await throttledFetch(
        `${this.config.moltbookApiUrl}/api/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`,
        { headers: this.authHeaders },
        this.fetchConfig
      );

      if (!response.ok) return [];
      const data = await response.json() as Record<string, unknown>;

      return ((data.results || []) as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
        threadId: String(r.threadId || r.id || ""),
        title: String(r.title || ""),
        body: String(r.body || r.snippet || ""),
        score: Number(r.score || r.relevance || 0),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Source content for Quiz Bowl questions from Moltbook trending/search.
   */
  async sourceQuizContent(topics: string[]): Promise<string[]> {
    const snippets: string[] = [];

    // Get trending content
    const trending = await this.getTrending(5);
    for (const t of trending) {
      if (t.body.length > 50) {
        snippets.push(`${t.title}: ${t.body.slice(0, 500)}`);
      }
    }

    // Search for each topic
    for (const topic of topics) {
      const results = await this.search(topic, 5);
      for (const r of results) {
        if (r.body.length > 50) {
          snippets.push(`${r.title}: ${r.body.slice(0, 500)}`);
        }
      }
    }

    return snippets;
  }

  getSubmoltId(): string | null {
    return this.submoltId;
  }

  // --- Internal ---

  private async findSubmolt(name: string): Promise<SubmoltInfo | null> {
    try {
      const response = await throttledFetch(
        `${this.config.moltbookApiUrl}/api/v1/submolts?name=${encodeURIComponent(name)}`,
        { headers: this.authHeaders },
        this.fetchConfig
      );

      if (!response.ok) return null;
      const data = await response.json() as Record<string, unknown>;
      const match = ((data.submolts || []) as Record<string, unknown>[]).find(
        (s: Record<string, unknown>) =>
          String(s.name || "").toLowerCase() === name.toLowerCase()
      );

      if (!match) return null;

      return {
        id: String(match.id),
        name: String(match.name),
        description: String(match.description || ""),
        memberCount: Number(match.memberCount || 0),
      };
    } catch {
      return null;
    }
  }

  private async createSubmolt(name: string, description: string): Promise<string> {
    const response = await throttledFetch(
      `${this.config.moltbookApiUrl}/api/v1/submolts`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.authHeaders,
        },
        body: JSON.stringify({ name, description }),
      },
      this.fetchConfig
    );

    if (!response.ok) {
      throw new Error(`Failed to create submolt: HTTP ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return String(data.id || data.submoltId);
  }
}
