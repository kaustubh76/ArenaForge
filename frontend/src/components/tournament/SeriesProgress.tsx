import clsx from 'clsx';
import { Circle, CheckCircle2, Flame } from 'lucide-react';
import { SeriesData } from '@/types/arena';
import { useAgentStore } from '@/stores/agentStore';
import { truncateAddress } from '@/constants/ui';

interface SeriesProgressProps {
  series: SeriesData;
  variant?: 'compact' | 'full';
}

export function SeriesProgress({ series, variant = 'compact' }: SeriesProgressProps) {
  const getAgentByAddress = useAgentStore((s) => s.getAgentByAddress);

  const getAgentName = (address: string) => {
    const agent = getAgentByAddress(address);
    return agent?.moltbookHandle ?? truncateAddress(address);
  };

  const player1Name = getAgentName(series.player1);
  const player2Name = getAgentName(series.player2);
  const totalGames = series.winsRequired * 2 - 1;
  const gamesPlayed = series.player1Wins + series.player2Wins;

  // Determine series status label
  const getSeriesLabel = () => {
    if (series.winsRequired === 2) return 'Bo3';
    if (series.winsRequired === 3) return 'Bo5';
    if (series.winsRequired === 4) return 'Bo7';
    return `First to ${series.winsRequired}`;
  };

  if (variant === 'compact') {
    return (
      <div className="inline-flex items-center gap-3 bg-surface-2 rounded-lg px-3 py-2 border border-white/[0.06]">
        {/* Player 1 */}
        <div
          className={clsx(
            'text-sm font-semibold',
            series.winner === series.player1
              ? 'text-arcade-green'
              : series.completed && series.winner !== series.player1
                ? 'text-gray-500'
                : 'text-white'
          )}
        >
          {player1Name}
        </div>

        {/* Score */}
        <div className="flex items-center gap-1">
          <span
            className={clsx(
              'font-pixel text-lg',
              series.player1Wins >= series.winsRequired ? 'text-arcade-green' : 'text-gray-300'
            )}
          >
            {series.player1Wins}
          </span>
          <span className="text-gray-600 text-xs mx-1">-</span>
          <span
            className={clsx(
              'font-pixel text-lg',
              series.player2Wins >= series.winsRequired ? 'text-arcade-green' : 'text-gray-300'
            )}
          >
            {series.player2Wins}
          </span>
        </div>

        {/* Player 2 */}
        <div
          className={clsx(
            'text-sm font-semibold',
            series.winner === series.player2
              ? 'text-arcade-green'
              : series.completed && series.winner !== series.player2
                ? 'text-gray-500'
                : 'text-white'
          )}
        >
          {player2Name}
        </div>

        {/* Series type badge */}
        <span className="text-[9px] font-pixel text-gray-500 bg-surface-3 px-2 py-0.5 rounded">
          {getSeriesLabel()}
        </span>
      </div>
    );
  }

  // Full variant with game indicators
  return (
    <div className="arcade-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-pixel text-[10px] text-gray-500 uppercase tracking-wider">
          {getSeriesLabel()} SERIES
        </h4>
        {series.completed && (
          <span className="text-[9px] font-pixel text-arcade-green bg-arcade-green/10 px-2 py-0.5 rounded">
            COMPLETE
          </span>
        )}
      </div>

      {/* Players */}
      <div className="flex items-center justify-between mb-4">
        <div
          className={clsx(
            'text-sm font-semibold flex-1',
            series.winner === series.player1 ? 'text-arcade-green' : 'text-white'
          )}
        >
          {player1Name}
        </div>
        <div className="font-pixel text-xl mx-4">
          <span
            className={clsx(
              series.player1Wins >= series.winsRequired ? 'text-arcade-green' : 'text-white'
            )}
          >
            {series.player1Wins}
          </span>
          <span className="text-gray-600 mx-2">:</span>
          <span
            className={clsx(
              series.player2Wins >= series.winsRequired ? 'text-arcade-green' : 'text-white'
            )}
          >
            {series.player2Wins}
          </span>
        </div>
        <div
          className={clsx(
            'text-sm font-semibold flex-1 text-right',
            series.winner === series.player2 ? 'text-arcade-green' : 'text-white'
          )}
        >
          {player2Name}
        </div>
      </div>

      {/* Game indicators */}
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: totalGames }, (_, i) => {
          const gameNumber = i + 1;
          let status: 'p1win' | 'p2win' | 'pending' | 'future' = 'future';

          // Determine game status based on win counts
          let p1WinsShown = 0;
          let p2WinsShown = 0;
          for (let g = 0; g < gameNumber; g++) {
            if (g < gamesPlayed) {
              // Assign wins in order (simplified - real implementation would track actual game order)
              const p1NeedsMore = p1WinsShown < series.player1Wins;
              const p2NeedsMore = p2WinsShown < series.player2Wins;
              if (p1NeedsMore && (!p2NeedsMore || g % 2 === 0)) {
                p1WinsShown++;
              } else if (p2NeedsMore) {
                p2WinsShown++;
              }
            }
          }

          if (gameNumber <= gamesPlayed) {
            if (p1WinsShown > p2WinsShown) status = 'p1win';
            else if (p2WinsShown > p1WinsShown) status = 'p2win';
            else status = gameNumber === gamesPlayed ? 'pending' : p1WinsShown >= p2WinsShown ? 'p1win' : 'p2win';
          } else if (gameNumber === gamesPlayed + 1 && !series.completed) {
            status = 'pending';
          }

          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-[8px] text-gray-600 font-pixel">G{gameNumber}</span>
              {status === 'p1win' ? (
                <CheckCircle2 size={18} className="text-arcade-green" />
              ) : status === 'p2win' ? (
                <CheckCircle2 size={18} className="text-arcade-purple" />
              ) : status === 'pending' ? (
                <Circle size={18} className="text-arcade-gold animate-pulse" />
              ) : (
                <Circle size={18} className="text-gray-700" />
              )}
            </div>
          );
        })}
      </div>

      {/* Win path progress bars */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-gray-500 w-6">P1</span>
          <div className="flex-1 h-2 bg-surface-0 rounded-full overflow-hidden">
            <div
              className="h-full bg-arcade-cyan/70 rounded-full transition-all duration-500"
              style={{ width: `${(series.player1Wins / series.winsRequired) * 100}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-gray-400 w-10 text-right">
            {series.player1Wins}/{series.winsRequired}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-gray-500 w-6">P2</span>
          <div className="flex-1 h-2 bg-surface-0 rounded-full overflow-hidden">
            <div
              className="h-full bg-arcade-purple/70 rounded-full transition-all duration-500"
              style={{ width: `${(series.player2Wins / series.winsRequired) * 100}%` }}
            />
          </div>
          <span className="text-[9px] font-mono text-gray-400 w-10 text-right">
            {series.player2Wins}/{series.winsRequired}
          </span>
        </div>
      </div>

      {/* Momentum indicator */}
      {gamesPlayed >= 2 && !series.completed && (() => {
        const lead = series.player1Wins - series.player2Wins;
        const momentum = lead > 0 ? 'P1' : lead < 0 ? 'P2' : 'EVEN';
        const clinch1 = series.winsRequired - series.player1Wins;
        const clinch2 = series.winsRequired - series.player2Wins;
        return (
          <div className="mt-3 flex items-center justify-center gap-3">
            {momentum !== 'EVEN' && (
              <div className="flex items-center gap-1">
                <Flame size={10} className={momentum === 'P1' ? 'text-arcade-cyan' : 'text-arcade-purple'} />
                <span className={clsx(
                  'text-[9px] font-pixel',
                  momentum === 'P1' ? 'text-arcade-cyan' : 'text-arcade-purple',
                )}>
                  {momentum} MOMENTUM
                </span>
              </div>
            )}
            <span className="text-[8px] text-gray-600 font-mono">
              Clinch: P1 in {clinch1} | P2 in {clinch2}
            </span>
          </div>
        );
      })()}

      {/* First to X indicator */}
      <div className="mt-3 text-center">
        <span className="text-[9px] text-gray-500 font-mono">
          First to {series.winsRequired} wins
        </span>
      </div>
    </div>
  );
}
