import { useState, useMemo } from 'react';
import clsx from 'clsx';
import { Shield, Zap } from 'lucide-react';
import { useBettingStore } from '@/stores/bettingStore';
import { LiveOdds } from './LiveOdds';
import { BetSlip } from './BetSlip';

interface BettingPanelProps {
  matchId: number;
  player1: string;
  player2: string;
  player1Handle?: string;
  player2Handle?: string;
  player1Elo?: number;
  player2Elo?: number;
  className?: string;
}

export function BettingPanel({
  matchId,
  player1,
  player2,
  player1Handle,
  player2Handle,
  player1Elo,
  player2Elo,
  className,
}: BettingPanelProps) {
  const {
    matchPools,
    pendingBetMatchId,
    pendingPrediction,
    setPendingBet,
    clearPendingBet,
  } = useBettingStore();

  const [showBetSlip, setShowBetSlip] = useState(false);

  const pool = matchPools[matchId];
  const isBettingOpen = pool?.bettingOpen ?? false;

  // ELO-based win probability (Elo expected score formula)
  const eloInsight = useMemo(() => {
    if (!player1Elo || !player2Elo) return null;
    const diff = player1Elo - player2Elo;
    const p1WinPct = 1 / (1 + Math.pow(10, -diff / 400)) * 100;
    const absDiff = Math.abs(diff);
    const advantage = absDiff < 50 ? 'EVEN' : absDiff < 150 ? 'SLIGHT' : absDiff < 300 ? 'STRONG' : 'DOMINANT';
    const favoredPlayer = diff >= 0 ? 1 : 2;
    return { p1WinPct, absDiff, advantage, favoredPlayer };
  }, [player1Elo, player2Elo]);

  const handleSelectPlayer = (player: string) => {
    if (!isBettingOpen) return;
    setPendingBet(matchId, player);
    setShowBetSlip(true);
  };

  const handleCloseBetSlip = () => {
    setShowBetSlip(false);
    clearPendingBet();
  };

  return (
    <div className={clsx('space-y-4', className)}>
      {/* Live Odds */}
      <LiveOdds
        matchId={matchId}
        player1={player1}
        player2={player2}
        player1Handle={player1Handle}
        player2Handle={player2Handle}
      />

      {/* ELO advantage insight */}
      {eloInsight && (
        <div className="bg-surface-1 rounded-lg p-3 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Shield size={12} className="text-arcade-purple" />
              <span className="text-[9px] font-pixel text-gray-500 tracking-wider">ELO MATCHUP</span>
            </div>
            <span
              className={clsx(
                'text-[9px] font-pixel font-bold px-2 py-0.5 rounded transition-all',
                eloInsight.advantage === 'EVEN' ? 'text-gray-400 bg-gray-400/10' :
                eloInsight.advantage === 'SLIGHT' ? 'text-arcade-gold bg-arcade-gold/10' :
                eloInsight.advantage === 'STRONG' ? 'text-arcade-orange bg-arcade-orange/10' :
                'text-arcade-red bg-arcade-red/10',
                eloInsight.advantage === 'DOMINANT' && 'animate-pulse',
              )}
              style={{
                boxShadow: eloInsight.advantage === 'STRONG' ? '0 0 6px rgba(255,171,64,0.2)' :
                            eloInsight.advantage === 'DOMINANT' ? '0 0 8px rgba(255,82,82,0.25)' : 'none',
              }}
            >
              {eloInsight.advantage === 'EVEN' ? 'EVEN MATCH' : `${eloInsight.advantage} ADV`}
            </span>
          </div>
          {/* Win probability bar */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[9px] font-mono text-arcade-cyan w-10 text-right">{eloInsight.p1WinPct.toFixed(0)}%</span>
            <div className="flex-1 h-2 bg-surface-0 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-arcade-cyan/60 rounded-l-full transition-all duration-500"
                style={{ width: `${eloInsight.p1WinPct}%` }}
              />
              <div
                className="h-full bg-arcade-pink/60 rounded-r-full transition-all duration-500"
                style={{ width: `${100 - eloInsight.p1WinPct}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-arcade-pink w-10">{(100 - eloInsight.p1WinPct).toFixed(0)}%</span>
          </div>
          {eloInsight.absDiff > 0 && (
            <div className="flex items-center justify-center gap-1">
              <Zap size={10} className={clsx(
                eloInsight.favoredPlayer === 1 ? 'text-arcade-cyan' : 'text-arcade-pink',
                eloInsight.absDiff > 200 && 'animate-pulse',
              )} />
              <span className="text-[9px] text-gray-500">
                {eloInsight.favoredPlayer === 1 ? (player1Handle || 'P1') : (player2Handle || 'P2')} favored by {eloInsight.absDiff} ELO
              </span>
            </div>
          )}
        </div>
      )}

      {/* Player selection buttons */}
      {isBettingOpen && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => handleSelectPlayer(player1)}
            className={clsx(
              'relative p-4 rounded-lg border-2 transition-all duration-200',
              pendingPrediction === player1 && pendingBetMatchId === matchId
                ? 'border-arcade-cyan bg-arcade-cyan/10'
                : 'border-gray-600 hover:border-arcade-cyan/50 bg-surface-1 hover:bg-arcade-cyan/5',
            )}
            style={pendingPrediction === player1 && pendingBetMatchId === matchId ? { boxShadow: '0 0 12px rgba(0,229,255,0.15)' } : undefined}
          >
            <div className="text-center">
              <div className="font-semibold text-white truncate">
                {player1Handle || player1.slice(0, 8)}
              </div>
              {player1Elo && (
                <div className="text-xs text-gray-400 mt-1">
                  ELO: {player1Elo}
                </div>
              )}
              <div className="mt-2 text-xs uppercase tracking-wider text-arcade-cyan">
                Bet on
              </div>
            </div>
            {pendingPrediction === player1 && pendingBetMatchId === matchId && (
              <div className="absolute top-2 right-2">
                <svg className="w-5 h-5 text-arcade-cyan" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>

          <button
            onClick={() => handleSelectPlayer(player2)}
            className={clsx(
              'relative p-4 rounded-lg border-2 transition-all duration-200',
              pendingPrediction === player2 && pendingBetMatchId === matchId
                ? 'border-arcade-pink bg-arcade-pink/10'
                : 'border-gray-600 hover:border-arcade-pink/50 bg-surface-1 hover:bg-arcade-pink/5',
            )}
            style={pendingPrediction === player2 && pendingBetMatchId === matchId ? { boxShadow: '0 0 12px rgba(255,64,129,0.15)' } : undefined}
          >
            <div className="text-center">
              <div className="font-semibold text-white truncate">
                {player2Handle || player2.slice(0, 8)}
              </div>
              {player2Elo && (
                <div className="text-xs text-gray-400 mt-1">
                  ELO: {player2Elo}
                </div>
              )}
              <div className="mt-2 text-xs uppercase tracking-wider text-arcade-pink">
                Bet on
              </div>
            </div>
            {pendingPrediction === player2 && pendingBetMatchId === matchId && (
              <div className="absolute top-2 right-2">
                <svg className="w-5 h-5 text-arcade-pink" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        </div>
      )}

      {/* Bet Slip */}
      {showBetSlip && pendingBetMatchId === matchId && (
        <BetSlip
          player1Handle={player1Handle}
          player2Handle={player2Handle}
          onClose={handleCloseBetSlip}
        />
      )}

      {/* Closed message */}
      {!isBettingOpen && pool && (
        <div className="text-center py-4 bg-surface-1 rounded-lg">
          <span className="text-sm text-gray-400">
            {pool.settled ? 'Match settled' : 'Betting closed for this match'}
          </span>
        </div>
      )}
    </div>
  );
}
