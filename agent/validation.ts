import type { TournamentConfig, GameParameters } from "./game-engine/game-mode.interface";
import { GameType, TournamentFormat } from "./game-engine/game-mode.interface";

// Tournament constraints
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 64;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 20;
const MIN_ENTRY_STAKE = BigInt(0);
const MAX_ENTRY_STAKE = BigInt(1000) * BigInt(10 ** 18); // 1000 MON
const MAX_NAME_LENGTH = 64;
const MIN_NAME_LENGTH = 3;

// Game parameter bounds
const GAME_PARAM_BOUNDS: Record<GameType, Record<string, { min: number; max: number }>> = {
  [GameType.OracleDuel]: {
    durationSeconds: { min: 60, max: 3600 },
    minPriceChange: { min: 1, max: 50 },
  },
  [GameType.StrategyArena]: {
    roundCount: { min: 1, max: 20 },
    cooperateReward: { min: 0, max: 100 },
    defectReward: { min: 0, max: 100 },
    mutualDefectPenalty: { min: -100, max: 0 },
    suckerPenalty: { min: -100, max: 0 },
  },
  [GameType.AuctionWars]: {
    boxCount: { min: 1, max: 10 },
    totalBudget: { min: 10, max: 1000 },
    minBid: { min: 0, max: 100 },
  },
  [GameType.QuizBowl]: {
    questionCount: { min: 3, max: 20 },
    timePerQuestion: { min: 10, max: 120 },
    pointsPerCorrect: { min: 1, max: 10 },
    streakBonus: { min: 0, max: 5 },
  },
};

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate tournament configuration before creation.
 */
export function validateTournamentConfig(config: TournamentConfig): ValidationResult {
  const errors: ValidationError[] = [];

  // Name validation
  if (!config.name || config.name.trim().length === 0) {
    errors.push({ field: "name", message: "Tournament name is required" });
  } else if (config.name.length < MIN_NAME_LENGTH) {
    errors.push({ field: "name", message: `Name must be at least ${MIN_NAME_LENGTH} characters` });
  } else if (config.name.length > MAX_NAME_LENGTH) {
    errors.push({ field: "name", message: `Name must be at most ${MAX_NAME_LENGTH} characters` });
  }

  // Game type validation
  if (!(config.gameType in GameType) || config.gameType < 0 || config.gameType > 3) {
    errors.push({ field: "gameType", message: `Invalid game type: ${config.gameType}` });
  }

  // Format validation
  if (!(config.format in TournamentFormat) || config.format < 0 || config.format > 1) {
    errors.push({ field: "format", message: `Invalid tournament format: ${config.format}` });
  }

  // Entry stake validation
  if (config.entryStake < MIN_ENTRY_STAKE) {
    errors.push({ field: "entryStake", message: "Entry stake cannot be negative" });
  } else if (config.entryStake > MAX_ENTRY_STAKE) {
    errors.push({ field: "entryStake", message: `Entry stake cannot exceed ${MAX_ENTRY_STAKE / BigInt(10 ** 18)} MON` });
  }

  // Participants validation
  if (config.maxParticipants < MIN_PARTICIPANTS) {
    errors.push({ field: "maxParticipants", message: `Must have at least ${MIN_PARTICIPANTS} participants` });
  } else if (config.maxParticipants > MAX_PARTICIPANTS) {
    errors.push({ field: "maxParticipants", message: `Cannot exceed ${MAX_PARTICIPANTS} participants` });
  }

  // For single elimination, participants must be power of 2
  if (config.format === TournamentFormat.SingleElimination) {
    const isPowerOf2 = (n: number) => n > 0 && (n & (n - 1)) === 0;
    if (!isPowerOf2(config.maxParticipants)) {
      errors.push({
        field: "maxParticipants",
        message: "Single elimination requires power of 2 participants (2, 4, 8, 16, 32, 64)"
      });
    }
  }

  // Round count validation
  if (config.roundCount < MIN_ROUNDS) {
    errors.push({ field: "roundCount", message: `Must have at least ${MIN_ROUNDS} round` });
  } else if (config.roundCount > MAX_ROUNDS) {
    errors.push({ field: "roundCount", message: `Cannot exceed ${MAX_ROUNDS} rounds` });
  }

  // For single elimination, validate round count matches participants
  if (config.format === TournamentFormat.SingleElimination) {
    const expectedRounds = Math.ceil(Math.log2(config.maxParticipants));
    if (config.roundCount < expectedRounds) {
      errors.push({
        field: "roundCount",
        message: `Single elimination with ${config.maxParticipants} participants needs at least ${expectedRounds} rounds`,
      });
    }
  }

  // Game parameters validation
  const paramErrors = validateGameParameters(config.gameType, config.gameParameters);
  errors.push(...paramErrors);

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate game-specific parameters.
 */
export function validateGameParameters(gameType: GameType, params: GameParameters): ValidationError[] {
  const errors: ValidationError[] = [];
  const bounds = GAME_PARAM_BOUNDS[gameType];

  if (!bounds) return errors;

  // Cast params to indexable record for dynamic access
  const paramRecord = params as Record<string, unknown>;

  for (const [key, { min, max }] of Object.entries(bounds)) {
    const value = paramRecord[key];
    if (value !== undefined && typeof value === "number") {
      if (value < min) {
        errors.push({ field: `gameParameters.${key}`, message: `${key} must be at least ${min}` });
      } else if (value > max) {
        errors.push({ field: `gameParameters.${key}`, message: `${key} must be at most ${max}` });
      }
    }
  }

  return errors;
}

/**
 * Sanitize tournament name (remove dangerous characters).
 */
export function sanitizeTournamentName(name: string): string {
  return name
    .trim()
    .replace(/[<>'"&]/g, "") // Remove potential XSS vectors
    .replace(/\s+/g, " ")    // Normalize whitespace
    .slice(0, MAX_NAME_LENGTH);
}

/**
 * Format validation errors for logging.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => `  - ${e.field}: ${e.message}`).join("\n");
}
