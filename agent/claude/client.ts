import Anthropic from "@anthropic-ai/sdk";

export interface ClaudeConfig {
  apiKey: string;
  model: string;
  maxThinkingTokens: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface ThinkingResponse {
  thinking: string;
  response: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

const DEFAULT_CONFIG: ClaudeConfig = {
  apiKey: "",
  model: "claude-sonnet-4-20250514",
  maxThinkingTokens: 10000,
  maxOutputTokens: 4096,
  requestTimeoutMs: 25000,
  retryAttempts: 2,
  retryDelayMs: 1000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Error && error.message.includes("timeout")) return true;
  return false;
}

export class ClaudeClient {
  private client: Anthropic;
  private config: ClaudeConfig;

  constructor(config?: Partial<ClaudeConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      model: process.env.CLAUDE_MODEL || DEFAULT_CONFIG.model,
      maxThinkingTokens:
        Number(process.env.CLAUDE_THINKING_BUDGET) || DEFAULT_CONFIG.maxThinkingTokens,
      maxOutputTokens:
        Number(process.env.CLAUDE_MAX_OUTPUT) || DEFAULT_CONFIG.maxOutputTokens,
      requestTimeoutMs:
        Number(process.env.CLAUDE_TIMEOUT_MS) || DEFAULT_CONFIG.requestTimeoutMs,
      ...config,
    };

    if (!this.config.apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required");
    }

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.requestTimeoutMs,
    });
  }

  async analyzeWithThinking(
    systemPrompt: string,
    userPrompt: string,
    thinkingBudget?: number
  ): Promise<ThinkingResponse> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxOutputTokens,
          thinking: {
            type: "enabled",
            budget_tokens: thinkingBudget || this.config.maxThinkingTokens,
          },
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });

        let thinking = "";
        let text = "";

        for (const block of response.content) {
          if (block.type === "thinking") {
            thinking = block.thinking;
          } else if (block.type === "text") {
            text = block.text;
          }
        }

        return {
          thinking,
          response: text,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          latencyMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error as Error;

        if (isRetryableError(error) && attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          console.warn(
            `[Claude] Request failed (attempt ${attempt + 1}), retrying in ${delay}ms:`,
            error instanceof Error ? error.message : error
          );
          await sleep(delay);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error("Unknown error in Claude client");
  }

  async analyzeSimple(
    systemPrompt: string,
    userPrompt: string
  ): Promise<{ response: string; inputTokens: number; outputTokens: number }> {
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.maxOutputTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    let text = "";
    for (const block of response.content) {
      if (block.type === "text") {
        text = block.text;
      }
    }

    return {
      response: text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  getConfig(): Readonly<ClaudeConfig> {
    return { ...this.config };
  }
}
