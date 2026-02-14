import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Trophy, Swords } from 'lucide-react';
import clsx from 'clsx';
import { GameType, MatchStatus } from '@/types/arena';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import {
  fetchStrategyArenaState,
  fetchQuizBowlState,
  type StrategyArenaState,
  type QuizBowlState,
} from '@/lib/contracts';
import { GAME_TYPE_CONFIG } from '@/constants/game';
import { truncateAddress } from '@/constants/ui';

// ── Minimal, chromeless overlay for OBS / streaming tools ──────────────
// Route: /overlay/:id   (match ID)
// Query params:
//   ?theme=dark|light (default: dark, transparent bg)
//   ?compact=true     (single-row bar mode)

export function OBSOverlay() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const matchId = Number(id);
  const compact = searchParams.get('compact') === 'true';
  const lightTheme = searchParams.get('theme') === 'light';

  const allMatches = useArenaStore(s => s.allMatches);
  const fetchArena = useArenaStore(s => s.fetchFromChain);
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);
  const fetchAgents = useAgentStore(s => s.fetchFromChain);

  const match = allMatches.find(m => m.id === matchId);

  // Game-specific state (only for games that expose scores)
  const [strategyState, setStrategyState] = useState<StrategyArenaState | null>(null);
  const [quizState, setQuizState] = useState<QuizBowlState | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial fetch
  useEffect(() => {
    fetchArena();
    fetchAgents();
  }, [fetchArena, fetchAgents]);

  // Poll every 3s for live data
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchArena();
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchArena]);

  // Fetch game-specific state for games with scores
  useEffect(() => {
    if (!match) return;
    const fetchGameState = async () => {
      try {
        if (match.gameType === GameType.StrategyArena) {
          setStrategyState(await fetchStrategyArenaState(match.id));
        } else if (match.gameType === GameType.QuizBowl) {
          setQuizState(await fetchQuizBowlState(match.id));
        }
      } catch { /* ignore */ }
    };
    fetchGameState();
    const interval = setInterval(fetchGameState, 5000);
    return () => clearInterval(interval);
  }, [match?.id, match?.gameType, match?.status]);

  // Derive scores (Strategy Arena & Quiz Bowl have scores, others show 0-0)
  const p1Score = getScore(match?.gameType, 'p1', strategyState, quizState);
  const p2Score = getScore(match?.gameType, 'p2', strategyState, quizState);

  const p1 = match ? getAgentByAddress(match.player1) : undefined;
  const p2 = match ? getAgentByAddress(match.player2) : undefined;
  const p1Handle = p1?.moltbookHandle ?? (match ? truncateAddress(match.player1) : '???');
  const p2Handle = p2?.moltbookHandle ?? (match ? truncateAddress(match.player2) : '???');

  const isLive = match?.status === MatchStatus.InProgress;
  const isComplete = match?.status === MatchStatus.Completed;
  const winner = match?.winner;

  const bg = lightTheme ? 'bg-white/90 text-gray-900' : 'bg-black/80 text-white';
  const gameConfig = match?.gameType != null ? GAME_TYPE_CONFIG[match.gameType] : null;

  if (!match) {
    return (
      <div className={clsx('min-h-screen flex items-center justify-center font-mono text-sm', bg)}>
        <span className="opacity-50">Waiting for match #{id}...</span>
      </div>
    );
  }

  // ── Compact bar mode ──
  if (compact) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-transparent">
        <div className={clsx(
          'flex items-center gap-3 px-5 py-2.5 rounded-xl backdrop-blur-md font-mono',
          lightTheme ? 'bg-white/90 text-gray-900 shadow-lg' : 'bg-black/80 text-white border border-white/10',
        )}>
          {/* P1 */}
          <span className={clsx(
            'font-bold text-sm',
            isComplete && winner === match.player1 && (lightTheme ? 'text-emerald-600' : 'text-arcade-green'),
          )}>
            {p1Handle}
          </span>

          {/* Score */}
          <div className="flex items-center gap-2">
            <span className={clsx('text-xl font-bold tabular-nums', !lightTheme && 'text-cyan-300')}>{p1Score}</span>
            <span className="text-xs opacity-40">&ndash;</span>
            <span className={clsx('text-xl font-bold tabular-nums', !lightTheme && 'text-pink-300')}>{p2Score}</span>
          </div>

          {/* P2 */}
          <span className={clsx(
            'font-bold text-sm',
            isComplete && winner === match.player2 && (lightTheme ? 'text-emerald-600' : 'text-arcade-green'),
          )}>
            {p2Handle}
          </span>

          {/* Status */}
          {isLive && (
            <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              LIVE
            </span>
          )}
          {isComplete && <Trophy size={14} className={lightTheme ? 'text-amber-500' : 'text-arcade-gold'} />}
        </div>
      </div>
    );
  }

  // ── Full overlay mode ──
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-transparent">
      <div className={clsx(
        'w-full max-w-lg rounded-2xl backdrop-blur-md p-6 font-mono',
        lightTheme ? 'bg-white/90 text-gray-900 shadow-2xl' : 'bg-black/80 text-white border border-white/10',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {gameConfig && (
              <span className="text-lg">{gameConfig.icon}</span>
            )}
            <span className="text-[10px] uppercase tracking-wider opacity-60">{gameConfig?.label ?? 'Match'} #{match.id}</span>
          </div>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                <span className="text-[10px] font-bold text-red-400 uppercase">Live</span>
              </span>
            )}
            {isComplete && (
              <span className={clsx(
                'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                lightTheme ? 'bg-emerald-100 text-emerald-700' : 'bg-arcade-green/20 text-arcade-green border border-arcade-green/30',
              )}>
                <Trophy size={10} />
                Complete
              </span>
            )}
          </div>
        </div>

        {/* Players + Scores */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center mb-5">
          {/* P1 */}
          <div className="text-center">
            <div className={clsx(
              'text-sm font-bold truncate',
              isComplete && winner === match.player1 && (lightTheme ? 'text-emerald-600' : 'text-arcade-green'),
            )}>
              {isComplete && winner === match.player1 && <Trophy size={12} className="inline mr-1 -mt-0.5" />}
              {p1Handle}
            </div>
            {p1 && (
              <div className="text-[10px] opacity-50 mt-0.5">{p1.elo} ELO</div>
            )}
            <div className={clsx(
              'text-4xl font-bold mt-2 tabular-nums',
              lightTheme ? 'text-gray-900' : 'text-cyan-300',
            )}
              style={!lightTheme ? { textShadow: '0 0 12px rgba(0,229,255,0.4)' } : undefined}
            >
              {p1Score}
            </div>
          </div>

          {/* VS */}
          <div className="flex flex-col items-center gap-1">
            <Swords size={20} className="opacity-30" />
            <span className="text-[9px] uppercase opacity-30">vs</span>
          </div>

          {/* P2 */}
          <div className="text-center">
            <div className={clsx(
              'text-sm font-bold truncate',
              isComplete && winner === match.player2 && (lightTheme ? 'text-emerald-600' : 'text-arcade-green'),
            )}>
              {isComplete && winner === match.player2 && <Trophy size={12} className="inline mr-1 -mt-0.5" />}
              {p2Handle}
            </div>
            {p2 && (
              <div className="text-[10px] opacity-50 mt-0.5">{p2.elo} ELO</div>
            )}
            <div className={clsx(
              'text-4xl font-bold mt-2 tabular-nums',
              lightTheme ? 'text-gray-900' : 'text-pink-300',
            )}
              style={!lightTheme ? { textShadow: '0 0 12px rgba(236,72,153,0.4)' } : undefined}
            >
              {p2Score}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-4">
          <span className="text-[8px] uppercase tracking-widest opacity-20">ArenaForge</span>
        </div>
      </div>
    </div>
  );
}

// ── Score helper ────────────────────────────────────────────────────────

function getScore(
  gameType: GameType | undefined,
  side: 'p1' | 'p2',
  strategy: StrategyArenaState | null,
  quiz: QuizBowlState | null,
): number {
  if (gameType === GameType.StrategyArena && strategy) {
    return side === 'p1' ? strategy.player1Score : strategy.player2Score;
  }
  if (gameType === GameType.QuizBowl && quiz) {
    return side === 'p1' ? quiz.player1Score : quiz.player2Score;
  }
  return 0;
}
