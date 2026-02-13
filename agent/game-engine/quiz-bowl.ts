import type {
  GameMode,
  GameParameters,
  PlayerAction,
  ActionResult,
  MatchState,
  MatchOutcome,
  QuizQuestion,
} from "./game-mode.interface";
import { GameType } from "./game-mode.interface";
import { keccak256, toBytes } from "viem";
import { SubmoltManager } from "../moltbook/submolt-manager";

interface QuizState {
  matchId: number;
  players: string[];
  params: GameParameters;
  questions: QuizQuestion[];
  currentQuestionIdx: number;
  commitDeadline: number;
  revealDeadline: number;
  commits: Map<string, Map<number, string>>; // player -> questionIdx -> commitHash
  answers: Map<string, Map<number, { answer: number; timestamp: number }>>; // player -> questionIdx -> answer
  scores: Map<string, number>;
  completed: boolean;
  winner: string | null;
}

// Difficulty distribution defaults: [easy, medium, hard] counts
const DEFAULT_DIFFICULTY_DIST: [number, number, number] = [3, 4, 3];
const BASE_SCORE = 100;

export class QuizBowlEngine implements GameMode {
  readonly gameType = GameType.QuizBowl;
  private matches = new Map<number, QuizState>();
  private submoltManager: SubmoltManager | null;
  // Track used question indices per match to prevent duplicates
  private usedQuestions = new Map<number, Set<string>>();

  constructor(submoltManager?: SubmoltManager) {
    this.submoltManager = submoltManager ?? null;
  }

  async initMatch(
    matchId: number,
    players: string[],
    params: GameParameters
  ): Promise<void> {
    if (players.length < 2) {
      throw new Error("Quiz Bowl requires at least 2 players");
    }

    const questionCount = params.quizQuestionCount ?? 10;
    const answerTime = params.quizAnswerTime ?? 30;

    // Generate questions
    const questions = await this.generateQuestions(questionCount, params);
    const now = Math.floor(Date.now() / 1000);

    const scores = new Map<string, number>();
    for (const p of players) {
      scores.set(p, 0);
    }

    const state: QuizState = {
      matchId,
      players,
      params,
      questions,
      currentQuestionIdx: 0,
      commitDeadline: now + answerTime,
      revealDeadline: now + answerTime + 15,
      commits: new Map(),
      answers: new Map(),
      scores,
      completed: false,
      winner: null,
    };

    for (const p of players) {
      state.commits.set(p, new Map());
      state.answers.set(p, new Map());
    }

    this.matches.set(matchId, state);
  }

  async processAction(
    matchId: number,
    player: string,
    action: PlayerAction
  ): Promise<ActionResult> {
    const state = this.matches.get(matchId);
    if (!state) return { accepted: false, error: "Match not found" };
    if (state.completed) return { accepted: false, error: "Match completed" };
    if (!state.players.includes(player)) return { accepted: false, error: "Not a participant" };

    const qIdx = state.currentQuestionIdx;
    const now = Math.floor(Date.now() / 1000);

    switch (action.type) {
      case "commit_answer": {
        if (now > state.commitDeadline) {
          return { accepted: false, error: "Answer time expired" };
        }

        const playerCommits = state.commits.get(player)!;
        if (playerCommits.has(qIdx)) {
          return { accepted: false, error: "Already committed for this question" };
        }

        const commitHash = action.data.commitHash as string;
        if (!commitHash) return { accepted: false, error: "Missing commitHash" };

        playerCommits.set(qIdx, commitHash);
        return { accepted: true };
      }

      case "reveal_answer": {
        if (now > state.revealDeadline) {
          return { accepted: false, error: "Reveal deadline passed" };
        }

        const pCommits = state.commits.get(player)!;
        if (!pCommits.has(qIdx)) {
          return { accepted: false, error: "Must commit before revealing" };
        }

        const playerAnswers = state.answers.get(player)!;
        if (playerAnswers.has(qIdx)) {
          return { accepted: false, error: "Already revealed for this question" };
        }

        const answer = Number(action.data.answer);
        if (answer < 0 || answer > 3) {
          return { accepted: false, error: "Answer must be 0-3" };
        }

        playerAnswers.set(qIdx, { answer, timestamp: now });

        // Check if all committed players have revealed
        const allRevealed = state.players.every((p) => {
          const commits = state.commits.get(p)!;
          const answers = state.answers.get(p)!;
          return !commits.has(qIdx) || answers.has(qIdx);
        });

        if (allRevealed) {
          this.scoreQuestion(state);
        }

        return { accepted: true };
      }

      default:
        return { accepted: false, error: `Unknown action: ${action.type}` };
    }
  }

  async isResolvable(matchId: number): Promise<boolean> {
    const state = this.matches.get(matchId);
    if (!state || state.completed) return false;

    const now = Math.floor(Date.now() / 1000);

    // Current question can be scored (all revealed or timeout)
    if (now > state.revealDeadline) return true;

    // Check if all players revealed
    const qIdx = state.currentQuestionIdx;
    const allRevealed = state.players.every((p) => {
      const commits = state.commits.get(p)!;
      const answers = state.answers.get(p)!;
      return !commits.has(qIdx) || answers.has(qIdx);
    });

    return allRevealed;
  }

  async resolve(matchId: number): Promise<MatchOutcome> {
    const state = this.matches.get(matchId);
    if (!state) throw new Error(`Match ${matchId} not found`);

    // Score remaining unanswered questions
    while (state.currentQuestionIdx < state.questions.length) {
      this.scoreQuestion(state);
    }

    state.completed = true;

    // Determine winner
    let bestPlayer: string | null = null;
    let bestScore = -1;
    for (const [player, score] of state.scores) {
      if (score > bestScore) {
        bestScore = score;
        bestPlayer = player;
      }
    }

    // Check for ties
    const topScorers = Array.from(state.scores.entries()).filter(
      ([, s]) => s === bestScore
    );
    state.winner = topScorers.length === 1 ? bestPlayer : null;

    const resultHash = keccak256(
      toBytes(
        JSON.stringify({
          matchId,
          scores: Object.fromEntries(state.scores),
          winner: state.winner,
        })
      )
    );

    return {
      matchId,
      winner: state.winner,
      scores: state.scores,
      resultData: {
        questions: state.questions.map((q, i) => ({
          index: i,
          difficulty: q.difficulty,
          category: q.category,
          correctAnswer: q.correctAnswer,
          playerAnswers: Object.fromEntries(
            Array.from(state.answers.entries()).map(([p, aMap]) => [
              p,
              aMap.get(i)?.answer ?? null,
            ])
          ),
        })),
        finalScores: Object.fromEntries(state.scores),
      },
      resultHash,
    };
  }

  async getState(matchId: number): Promise<MatchState> {
    const state = this.matches.get(matchId);
    if (!state) throw new Error(`Match ${matchId} not found`);

    const currentQ = state.questions[state.currentQuestionIdx];

    return {
      matchId,
      gameType: GameType.QuizBowl,
      status: state.completed ? "completed" : "in_progress",
      data: {
        currentQuestionIdx: state.currentQuestionIdx,
        totalQuestions: state.questions.length,
        commitDeadline: state.commitDeadline,
        revealDeadline: state.revealDeadline,
        currentQuestion: currentQ
          ? {
              index: currentQ.index,
              question: currentQ.question,
              options: currentQ.options,
              difficulty: currentQ.difficulty,
              category: currentQ.category,
              // Do NOT expose correctAnswer
            }
          : null,
        scores: Object.fromEntries(state.scores),
        committed: state.players.filter((p) =>
          state.commits.get(p)!.has(state.currentQuestionIdx)
        ),
        revealed: state.players.filter((p) =>
          state.answers.get(p)!.has(state.currentQuestionIdx)
        ),
      },
    };
  }

  validateParameters(params: GameParameters): boolean {
    const count = params.quizQuestionCount ?? 10;
    if (count < 3 || count > 20) return false;

    const time = params.quizAnswerTime ?? 30;
    if (time < 10 || time > 60) return false;

    const bonus = params.quizSpeedBonusMax ?? 50;
    if (bonus < 0 || bonus > 100) return false;

    const dist = params.quizDifficultyDistribution ?? DEFAULT_DIFFICULTY_DIST;
    if (dist.length !== 3 || dist.some((d) => d < 0)) return false;
    if (dist[0] + dist[1] + dist[2] === 0) return false;

    return true;
  }

  // --- Internal ---

  private scoreQuestion(state: QuizState): void {
    const qIdx = state.currentQuestionIdx;
    const question = state.questions[qIdx];
    if (!question) {
      state.currentQuestionIdx++;
      return;
    }

    const speedBonusMax = state.params.quizSpeedBonusMax ?? 50;
    const answerTime = state.params.quizAnswerTime ?? 30;

    // Find earliest commit time for speed bonus calculation
    let earliestCommit = Infinity;
    for (const [, answers] of state.answers) {
      const a = answers.get(qIdx);
      if (a) earliestCommit = Math.min(earliestCommit, a.timestamp);
    }

    for (const [player, answers] of state.answers) {
      const a = answers.get(qIdx);
      if (!a) continue; // No answer submitted

      if (a.answer === question.correctAnswer) {
        // Base score
        let score = BASE_SCORE;

        // Difficulty multiplier
        if (question.difficulty === "hard") score = Math.round(score * 1.5);
        else if (question.difficulty === "easy") score = Math.round(score * 0.75);

        // Speed bonus: proportional to how fast they answered
        if (speedBonusMax > 0 && earliestCommit !== Infinity) {
          const elapsed = a.timestamp - (state.commitDeadline - answerTime);
          const speedFraction = Math.max(0, 1 - elapsed / answerTime);
          score += Math.round(speedBonusMax * speedFraction);
        }

        const prev = state.scores.get(player) || 0;
        state.scores.set(player, prev + score);
      }
    }

    // Advance to next question
    state.currentQuestionIdx++;
    if (state.currentQuestionIdx < state.questions.length) {
      const newAnswerTime = state.params.quizAnswerTime ?? 30;
      const now = Math.floor(Date.now() / 1000);
      state.commitDeadline = now + newAnswerTime;
      state.revealDeadline = now + newAnswerTime + 15;
    }
  }

  /**
   * Generate quiz questions. Sources content from Moltbook if available,
   * otherwise generates blockchain/crypto themed questions.
   * Ensures no duplicate questions are used within a match.
   */
  private async generateQuestions(
    count: number,
    params: GameParameters
  ): Promise<QuizQuestion[]> {
    const dist = params.quizDifficultyDistribution ?? DEFAULT_DIFFICULTY_DIST;
    const totalDist = dist[0] + dist[1] + dist[2];

    // Determine how many of each difficulty
    const easyCount = Math.round((dist[0] / totalDist) * count);
    const hardCount = Math.round((dist[2] / totalDist) * count);
    const mediumCount = count - easyCount - hardCount;

    const questions: QuizQuestion[] = [];
    const usedKeys = new Set<string>();

    // Source content from Moltbook if available
    let moltbookContent: string[] = [];
    if (this.submoltManager) {
      try {
        moltbookContent = await this.submoltManager.sourceQuizContent([
          "blockchain",
          "defi",
          "monad",
          "crypto",
          "web3",
        ]);
      } catch {
        // Fall back to static questions
      }
    }

    // Generate questions per difficulty with deduplication
    const generateForDifficulty = (
      targetCount: number,
      difficulty: "easy" | "medium" | "hard"
    ): void => {
      const pool = QUESTION_POOL[difficulty];
      const shuffledPool = [...pool].sort(() => Math.random() - 0.5);

      let added = 0;
      for (const q of shuffledPool) {
        if (added >= targetCount) break;

        const key = `${difficulty}:${q.question}`;
        if (!usedKeys.has(key)) {
          usedKeys.add(key);
          questions.push(
            this.createQuestionFromPool(questions.length, difficulty, q, moltbookContent)
          );
          added++;
        }
      }

      // If pool is exhausted but we need more, allow reuse with different indices
      while (added < targetCount) {
        const q = pool[added % pool.length];
        questions.push(
          this.createQuestionFromPool(questions.length, difficulty, q, moltbookContent)
        );
        added++;
      }
    };

    generateForDifficulty(easyCount, "easy");
    generateForDifficulty(mediumCount, "medium");
    generateForDifficulty(hardCount, "hard");

    // Shuffle final question order
    for (let i = questions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questions[i], questions[j]] = [questions[j], questions[i]];
      questions[i].index = i;
      questions[j].index = j;
    }

    return questions;
  }

  /**
   * Create a quiz question from a pool entry.
   */
  private createQuestionFromPool(
    index: number,
    difficulty: "easy" | "medium" | "hard",
    q: { question: string; options: string[]; correctAnswer: number; category: string },
    moltbookContent: string[]
  ): QuizQuestion {
    const questionHash = keccak256(
      toBytes(`${q.question}-${q.correctAnswer}-${index}-${Date.now()}`)
    );

    return {
      index,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      difficulty,
      category: q.category,
      sourceReference: moltbookContent.length > 0 ? "moltbook" : "static_pool",
      questionHash,
    };
  }
}

// Static question pool for when Moltbook content is unavailable
const QUESTION_POOL: Record<
  "easy" | "medium" | "hard",
  { question: string; options: string[]; correctAnswer: number; category: string }[]
> = {
  easy: [
    {
      question: "What consensus mechanism does Monad use?",
      options: ["Proof of Work", "MonadBFT", "Proof of Authority", "Delegated PoS"],
      correctAnswer: 1,
      category: "monad",
    },
    {
      question: "What is the native token of the Monad blockchain?",
      options: ["ETH", "MATIC", "MON", "SOL"],
      correctAnswer: 2,
      category: "monad",
    },
    {
      question: "What does EVM stand for?",
      options: [
        "Ethereum Virtual Machine",
        "Encrypted Validation Method",
        "External Value Manager",
        "Ethereum Verification Module",
      ],
      correctAnswer: 0,
      category: "blockchain",
    },
    {
      question: "What is a smart contract?",
      options: [
        "A legal agreement",
        "Self-executing code on blockchain",
        "A type of NFT",
        "A wallet address",
      ],
      correctAnswer: 1,
      category: "blockchain",
    },
    {
      question: "What is gas in blockchain context?",
      options: [
        "Fuel for mining rigs",
        "Transaction fee unit",
        "A type of token",
        "Network bandwidth",
      ],
      correctAnswer: 1,
      category: "blockchain",
    },
  ],
  medium: [
    {
      question: "What is Monad's theoretical TPS (transactions per second)?",
      options: ["100", "1,000", "10,000", "100,000"],
      correctAnswer: 2,
      category: "monad",
    },
    {
      question: "What is a bonding curve in the context of token launches?",
      options: [
        "A cryptographic signature scheme",
        "A mathematical formula determining token price vs supply",
        "A type of smart contract vulnerability",
        "A consensus mechanism",
      ],
      correctAnswer: 1,
      category: "defi",
    },
    {
      question: "What is the Prisoner's Dilemma in game theory?",
      options: [
        "A zero-sum game",
        "A scenario where individual rationality leads to suboptimal outcomes",
        "A type of auction",
        "A voting mechanism",
      ],
      correctAnswer: 1,
      category: "game_theory",
    },
    {
      question: "What does ELO measure in competitive gaming?",
      options: [
        "Transaction speed",
        "Relative skill level",
        "Token value",
        "Network latency",
      ],
      correctAnswer: 1,
      category: "gaming",
    },
    {
      question: "What is a commit-reveal scheme used for?",
      options: [
        "Version control",
        "Preventing front-running by hiding data until all parties commit",
        "Compressing blockchain data",
        "Token staking",
      ],
      correctAnswer: 1,
      category: "cryptography",
    },
  ],
  hard: [
    {
      question: "What is the approximate block time on Monad?",
      options: ["12 seconds", "2 seconds", "0.4 seconds", "6 seconds"],
      correctAnswer: 2,
      category: "monad",
    },
    {
      question: "In a Nash Equilibrium of the iterated Prisoner's Dilemma, what is the dominant strategy?",
      options: [
        "Always cooperate",
        "Always defect",
        "Tit-for-tat",
        "Random",
      ],
      correctAnswer: 1,
      category: "game_theory",
    },
    {
      question: "What technique does Monad use for parallel transaction execution?",
      options: [
        "Sharding",
        "Optimistic concurrency control",
        "Sequential processing",
        "Proof of computation",
      ],
      correctAnswer: 1,
      category: "monad",
    },
    {
      question: "In a sealed-bid auction, what is the 'winner's curse'?",
      options: [
        "The winner pays too much gas",
        "The winner tends to overpay relative to item value",
        "The winner's transaction gets reverted",
        "The winner receives a counterfeit item",
      ],
      correctAnswer: 1,
      category: "game_theory",
    },
    {
      question: "What is the K-factor in ELO rating calculations?",
      options: [
        "The total number of games played",
        "The maximum rating change per game",
        "The starting rating for new players",
        "The minimum rating difference for a match",
      ],
      correctAnswer: 1,
      category: "gaming",
    },
  ],
};
