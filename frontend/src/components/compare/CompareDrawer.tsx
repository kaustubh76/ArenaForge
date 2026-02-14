import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { X, Swords, Trophy, BarChart3, ExternalLink, Minus } from 'lucide-react';
import { useCompareStore } from '@/stores/compareStore';
import { useAgentStore } from '@/stores/agentStore';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { GAME_TYPE_CONFIG } from '@/constants/game';
import { GameType } from '@/types/arena';
import type { AgentProfileExtended } from '@/types/arena';
import { fetchGraphQL } from '@/lib/api';

// ── Types ──────────────────────────────────────────────────────────────

interface H2HData {
  agent1: string;
  agent2: string;
  agent1Wins: number;
  agent2Wins: number;
  draws: number;
  totalMatches: number;
  matches: Array<{
    matchId: number;
    gameType: string;
    winner: string | null;
    isDraw: boolean;
    timestamp: number;
  }>;
}

function gameTypeStringToNumber(gt: string): GameType {
  const map: Record<string, GameType> = {
    ORACLE_DUEL: GameType.OracleDuel,
    STRATEGY_ARENA: GameType.StrategyArena,
    AUCTION_WARS: GameType.AuctionWars,
    QUIZ_BOWL: GameType.QuizBowl,
  };
  return map[gt] ?? GameType.OracleDuel;
}

// ── Main Drawer ────────────────────────────────────────────────────────

export function CompareDrawer() {
  const { isOpen, agent1, agent2, closeDrawer, removeFromCompare, clearCompare } =
    useCompareStore();
  const getAgentByAddress = useAgentStore((s) => s.getAgentByAddress);

  const [h2hData, setH2hData] = useState<H2HData | null>(null);
  const [loading, setLoading] = useState(false);

  const a1Profile = agent1 ? getAgentByAddress(agent1) : undefined;
  const a2Profile = agent2 ? getAgentByAddress(agent2) : undefined;
  const a1Name = a1Profile?.moltbookHandle || agent1?.slice(0, 8) || '—';
  const a2Name = a2Profile?.moltbookHandle || agent2?.slice(0, 8) || '—';

  const fetchH2H = useCallback(async () => {
    if (!agent1 || !agent2) {
      setH2hData(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await fetchGraphQL<{ headToHead: H2HData | null }>(
        `query H2H($agent1: String!, $agent2: String!) {
            headToHead(agent1: $agent1, agent2: $agent2) {
              agent1 agent2
              agent1Wins agent2Wins draws totalMatches
              matches {
                matchId gameType winner isDraw timestamp
              }
            }
          }`,
        { agent1, agent2 },
      );
      setH2hData(data?.headToHead ?? null);
    } catch {
      setH2hData(null);
    } finally {
      setLoading(false);
    }
  }, [agent1, agent2]);

  useEffect(() => {
    if (isOpen && agent1 && agent2) {
      fetchH2H();
    }
  }, [isOpen, agent1, agent2, fetchH2H]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
        onClick={closeDrawer}
      />

      {/* Drawer panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-surface-0 border-l border-white/[0.06] z-50 shadow-2xl flex flex-col animate-slide-in-right overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Swords size={16} className="text-arcade-purple" />
            <h2 className="text-sm font-bold tracking-wider uppercase text-gray-200">
              Quick Compare
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearCompare}
              className="text-[10px] text-gray-500 hover:text-red-400 uppercase tracking-wider transition-colors"
            >
              Clear
            </button>
            <button
              onClick={closeDrawer}
              className="p-1.5 text-gray-500 hover:text-white rounded-md hover:bg-surface-2 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Agent comparison header */}
          <div className="grid grid-cols-5 gap-2 items-center">
            <AgentSlot
              address={agent1}
              profile={a1Profile}
              name={a1Name}
              color="cyan"
              onRemove={() => agent1 && removeFromCompare(agent1)}
            />
            <div className="text-center">
              <Swords size={18} className="text-arcade-purple mx-auto" />
              <div className="text-[9px] text-gray-500 uppercase mt-1">VS</div>
            </div>
            <AgentSlot
              address={agent2}
              profile={a2Profile}
              name={a2Name}
              color="pink"
              onRemove={() => agent2 && removeFromCompare(agent2)}
            />
          </div>

          {/* Both agents present — show comparison */}
          {agent1 && agent2 ? (
            <>
              {/* ELO comparison */}
              {a1Profile && a2Profile && (
                <div className="arcade-card p-4">
                  <h3 className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">
                    Stats Comparison
                  </h3>
                  <CompareRow
                    label="ELO"
                    v1={a1Profile.elo}
                    v2={a2Profile.elo}
                    format="number"
                  />
                  <CompareRow
                    label="Win Rate"
                    v1={a1Profile.winRate}
                    v2={a2Profile.winRate}
                    format="percent"
                  />
                  <CompareRow
                    label="Wins"
                    v1={a1Profile.wins}
                    v2={a2Profile.wins}
                    format="number"
                  />
                  <CompareRow
                    label="Matches"
                    v1={a1Profile.matchesPlayed}
                    v2={a2Profile.matchesPlayed}
                    format="number"
                  />
                  <CompareRow
                    label="Streak"
                    v1={a1Profile.streak}
                    v2={a2Profile.streak}
                    format="number"
                  />
                  {a1Profile.peakElo !== undefined && a2Profile.peakElo !== undefined && (
                    <CompareRow
                      label="Peak ELO"
                      v1={a1Profile.peakElo}
                      v2={a2Profile.peakElo}
                      format="number"
                    />
                  )}
                </div>
              )}

              {/* H2H data */}
              {loading ? (
                <div className="arcade-card p-8 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-arcade-purple border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Loading head-to-head...</p>
                </div>
              ) : h2hData ? (
                <>
                  {/* Win distribution */}
                  <div className="arcade-card p-4">
                    <h3 className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Trophy size={12} />
                      Head-to-Head ({h2hData.totalMatches} matches)
                    </h3>
                    <WinBar
                      a1Wins={h2hData.agent1Wins}
                      a2Wins={h2hData.agent2Wins}
                      draws={h2hData.draws}
                      a1Name={a1Name}
                      a2Name={a2Name}
                    />
                  </div>

                  {/* Game type breakdown */}
                  <GameTypeMiniBreakdown
                    matches={h2hData.matches}
                    agent1={h2hData.agent1}
                    a1Name={a1Name}
                    a2Name={a2Name}
                  />

                  {/* Match Timeline Strip */}
                  {h2hData.matches.length > 1 && (
                    <div className="arcade-card p-4">
                      <h3 className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <BarChart3 size={12} />
                        Match Timeline
                      </h3>
                      <div className="flex items-center gap-0.5">
                        {h2hData.matches.slice().reverse().map((m, i) => {
                          const isA1Win = m.winner?.toLowerCase() === h2hData.agent1.toLowerCase();
                          return (
                            <div
                              key={m.matchId}
                              className={clsx(
                                'flex-1 h-3 rounded-sm transition-all duration-300',
                                m.isDraw ? 'bg-gray-600/50' :
                                isA1Win ? 'bg-arcade-cyan/70' : 'bg-arcade-pink/70',
                                i === h2hData.matches.length - 1 && 'ring-1 ring-white/20'
                              )}
                              title={`#${m.matchId}: ${m.isDraw ? 'Draw' : isA1Win ? `${a1Name} wins` : `${a2Name} wins`}`}
                            />
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[8px] text-gray-600">Oldest</span>
                        <span className="text-[8px] text-gray-600">Latest</span>
                      </div>
                      {/* Streak detection */}
                      {(() => {
                        const recent = h2hData.matches.slice(0, 5);
                        let streak = 0;
                        let streakWinner = '';
                        for (const m of recent) {
                          if (m.isDraw) break;
                          const w = m.winner?.toLowerCase() || '';
                          if (streak === 0) { streakWinner = w; streak = 1; }
                          else if (w === streakWinner) streak++;
                          else break;
                        }
                        if (streak >= 2) {
                          const name = streakWinner === h2hData.agent1.toLowerCase() ? a1Name : a2Name;
                          const color = streakWinner === h2hData.agent1.toLowerCase() ? 'text-arcade-cyan' : 'text-arcade-pink';
                          return (
                            <div className="mt-2 text-center">
                              <span className={clsx('text-[9px] font-pixel', color)}>
                                {name} ON {streak}-WIN STREAK
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  )}

                  {/* Recent matches */}
                  <div className="arcade-card p-4">
                    <h3 className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">
                      Recent Matches
                    </h3>
                    <div className="space-y-1.5">
                      {h2hData.matches.slice(0, 5).map((m) => {
                        const isA1Win =
                          m.winner?.toLowerCase() === h2hData.agent1.toLowerCase();
                        return (
                          <Link
                            key={m.matchId}
                            to={`/match/${m.matchId}`}
                            onClick={closeDrawer}
                            className="flex items-center justify-between p-2 rounded-lg bg-surface-1 hover:bg-surface-2 transition-colors text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={clsx(
                                  'w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold',
                                  m.isDraw
                                    ? 'bg-gray-600/30 text-gray-400'
                                    : isA1Win
                                      ? 'bg-arcade-cyan/20 text-arcade-cyan'
                                      : 'bg-arcade-pink/20 text-arcade-pink',
                                )}
                              >
                                {m.isDraw ? 'D' : isA1Win ? a1Name[0] : a2Name[0]}
                              </span>
                              <span className="text-gray-300">
                                {m.isDraw
                                  ? 'Draw'
                                  : isA1Win
                                    ? `${a1Name} wins`
                                    : `${a2Name} wins`}
                              </span>
                            </div>
                            <span className="text-gray-600">
                              {GAME_TYPE_CONFIG[gameTypeStringToNumber(m.gameType)]?.label ?? m.gameType}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="arcade-card p-6 text-center">
                  <Swords size={24} className="text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">No matches between these agents yet</p>
                </div>
              )}

              {/* Full H2H link */}
              <Link
                to={`/h2h/${agent1}/${agent2}`}
                onClick={closeDrawer}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-arcade-purple/30 text-arcade-purple text-xs font-semibold hover:bg-arcade-purple/10 transition-colors"
              >
                <ExternalLink size={12} />
                View Full Head-to-Head
              </Link>
            </>
          ) : (
            <div className="arcade-card p-8 text-center">
              <Swords size={32} className="text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-400">
                {agent1 ? 'Select a second agent to compare' : 'Select two agents to compare'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Use the compare button on agent profiles or leaderboards
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Sub Components ─────────────────────────────────────────────────────

function AgentSlot({
  address,
  profile,
  name,
  color,
  onRemove,
}: {
  address: string | null;
  profile: AgentProfileExtended | undefined;
  name: string;
  color: 'cyan' | 'pink';
  onRemove: () => void;
}) {
  if (!address) {
    return (
      <div className="col-span-2 text-center py-4">
        <div className="w-10 h-10 rounded-full bg-surface-2 border-2 border-dashed border-gray-600 mx-auto flex items-center justify-center">
          <span className="text-gray-600 text-lg">?</span>
        </div>
        <p className="text-[10px] text-gray-600 mt-1.5">Empty slot</p>
      </div>
    );
  }

  const colorClass = color === 'cyan' ? 'text-arcade-cyan' : 'text-arcade-pink';

  return (
    <div className="col-span-2 text-center relative group">
      <button
        onClick={onRemove}
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-surface-2 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/30 hover:border-red-500/40"
        title="Remove"
      >
        <Minus size={8} className="text-gray-400" />
      </button>
      <Link to={`/agent/${address}`}>
        <AgentAvatar
          handle={name}
          avatarUrl={profile?.avatarUrl}
          size="md"
          className="mx-auto"
        />
      </Link>
      <Link
        to={`/agent/${address}`}
        className={clsx('text-xs font-bold mt-1.5 block truncate hover:underline', colorClass)}
      >
        {name}
      </Link>
      {profile && (
        <div className="text-[10px] text-gray-500 mt-0.5">
          ELO {profile.elo}
        </div>
      )}
    </div>
  );
}

function CompareRow({
  label,
  v1,
  v2,
  format,
}: {
  label: string;
  v1: number;
  v2: number;
  format: 'number' | 'percent';
}) {
  const fmt = (v: number) => (format === 'percent' ? `${v.toFixed(1)}%` : String(v));
  const highlight1 = v1 > v2;
  const highlight2 = v2 > v1;
  const maxVal = Math.max(v1, v2, 1);

  return (
    <div className="py-1.5 border-b border-white/[0.03] last:border-0">
      <div className="flex items-center justify-between mb-1">
        <span
          className={clsx(
            'font-mono text-sm w-16 text-right',
            highlight1 ? 'text-arcade-cyan font-bold' : 'text-gray-400',
          )}
        >
          {fmt(v1)}
        </span>
        <span className="text-[10px] text-gray-600 uppercase tracking-wider flex-1 text-center">
          {label}
        </span>
        <span
          className={clsx(
            'font-mono text-sm w-16 text-left',
            highlight2 ? 'text-arcade-pink font-bold' : 'text-gray-400',
          )}
        >
          {fmt(v2)}
        </span>
      </div>
      {/* Visual comparison bar */}
      <div className="flex items-center gap-1">
        <div className="flex-1 h-1 bg-surface-0 rounded-full overflow-hidden flex justify-end">
          <div
            className={clsx('h-full rounded-full transition-all duration-500', highlight1 ? 'bg-arcade-cyan/70' : 'bg-arcade-cyan/30')}
            style={{ width: `${(v1 / maxVal) * 100}%` }}
          />
        </div>
        <div className="w-0.5" />
        <div className="flex-1 h-1 bg-surface-0 rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-500', highlight2 ? 'bg-arcade-pink/70' : 'bg-arcade-pink/30')}
            style={{ width: `${(v2 / maxVal) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function WinBar({
  a1Wins,
  a2Wins,
  draws,
  a1Name,
  a2Name,
}: {
  a1Wins: number;
  a2Wins: number;
  draws: number;
  a1Name: string;
  a2Name: string;
}) {
  const total = a1Wins + a2Wins + draws;
  if (total === 0) return null;
  const a1Pct = (a1Wins / total) * 100;
  const drawPct = (draws / total) * 100;
  const a2Pct = (a2Wins / total) * 100;

  return (
    <div>
      <div className="flex h-5 rounded-lg overflow-hidden">
        {a1Pct > 0 && (
          <div
            className="bg-arcade-cyan flex items-center justify-center text-[9px] font-bold text-black"
            style={{ width: `${a1Pct}%` }}
          >
            {a1Pct >= 20 ? a1Wins : ''}
          </div>
        )}
        {drawPct > 0 && (
          <div
            className="bg-gray-600 flex items-center justify-center text-[9px] font-bold text-white"
            style={{ width: `${drawPct}%` }}
          >
            {drawPct >= 20 ? draws : ''}
          </div>
        )}
        {a2Pct > 0 && (
          <div
            className="bg-arcade-pink flex items-center justify-center text-[9px] font-bold text-black"
            style={{ width: `${a2Pct}%` }}
          >
            {a2Pct >= 20 ? a2Wins : ''}
          </div>
        )}
      </div>
      <div className="flex justify-between mt-1 text-[9px]">
        <span className="text-arcade-cyan">
          {a1Name} {a1Pct.toFixed(0)}%
        </span>
        {draws > 0 && <span className="text-gray-500">Draws {drawPct.toFixed(0)}%</span>}
        <span className="text-arcade-pink">
          {a2Name} {a2Pct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function GameTypeMiniBreakdown({
  matches,
  agent1,
  a1Name,
  a2Name,
}: {
  matches: H2HData['matches'];
  agent1: string;
  a1Name: string;
  a2Name: string;
}) {
  const byType: Record<string, { a1: number; a2: number; d: number; t: number }> = {};
  for (const m of matches) {
    if (!byType[m.gameType]) byType[m.gameType] = { a1: 0, a2: 0, d: 0, t: 0 };
    byType[m.gameType].t++;
    if (m.isDraw) byType[m.gameType].d++;
    else if (m.winner?.toLowerCase() === agent1.toLowerCase()) byType[m.gameType].a1++;
    else byType[m.gameType].a2++;
  }

  const entries = Object.entries(byType);
  if (entries.length <= 1) return null;

  return (
    <div className="arcade-card p-4">
      <h3 className="text-[10px] text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <BarChart3 size={12} />
        By Game Type
      </h3>
      <div className="space-y-2">
        {entries.map(([gt, stats]) => {
          const config = GAME_TYPE_CONFIG[gameTypeStringToNumber(gt)];
          return (
            <div key={gt} className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 w-20 truncate">
                {config?.label ?? gt}
              </span>
              <div className="flex-1 h-2.5 rounded-full bg-surface-1 overflow-hidden flex">
                {stats.a1 > 0 && (
                  <div
                    className="bg-arcade-cyan"
                    style={{ width: `${(stats.a1 / stats.t) * 100}%` }}
                  />
                )}
                {stats.d > 0 && (
                  <div
                    className="bg-gray-600"
                    style={{ width: `${(stats.d / stats.t) * 100}%` }}
                  />
                )}
                {stats.a2 > 0 && (
                  <div
                    className="bg-arcade-pink"
                    style={{ width: `${(stats.a2 / stats.t) * 100}%` }}
                  />
                )}
              </div>
              <span className="text-[9px] text-gray-500 w-12 text-right">
                {stats.a1}-{stats.d}-{stats.a2}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-3 text-[9px] text-gray-500 mt-2 pt-2 border-t border-white/[0.03]">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-arcade-cyan" /> {a1Name}
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-600" /> Draw
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-arcade-pink" /> {a2Name}
        </span>
      </div>
    </div>
  );
}

// ── Compare Button (for use in other components) ───────────────────────

export function CompareButton({
  agentAddress,
  className,
}: {
  agentAddress: string;
  className?: string;
}) {
  const addToCompare = useCompareStore((s) => s.addToCompare);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        addToCompare(agentAddress);
      }}
      className={clsx(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider group/cmp',
        'bg-surface-2 border border-white/[0.06] text-gray-400',
        'hover:text-arcade-purple hover:border-arcade-purple/30 hover:scale-105 hover:shadow-sm hover:shadow-arcade-purple/20',
        'active:scale-95 transition-all duration-200',
        className,
      )}
      title="Add to compare"
    >
      <Swords size={10} className="group-hover/cmp:rotate-45 transition-transform duration-200" />
      Compare
    </button>
  );
}

// ── Floating Compare Pill (shows when 1 agent is selected) ─────────

export function CompareFloatingPill() {
  const { agent1, agent2, isOpen, openDrawer, clearCompare } = useCompareStore();
  const getAgent = useAgentStore((s) => s.getAgentByAddress);

  // Show pill when at least 1 agent selected but drawer is closed
  if ((!agent1 && !agent2) || isOpen) return null;

  const count = (agent1 ? 1 : 0) + (agent2 ? 1 : 0);
  const name1 = agent1
    ? getAgent(agent1)?.moltbookHandle || agent1.slice(0, 6)
    : '';

  return (
    <div className="fixed bottom-6 right-6 z-40 animate-fade-in-up">
      <div
        className="flex items-center gap-2 bg-surface-1 border border-arcade-purple/30 rounded-full pl-4 pr-2 py-2 shadow-lg group animate-border-glow"
        style={{ boxShadow: '0 4px 20px rgba(168,85,247,0.15), 0 0 1px rgba(168,85,247,0.4)' }}
      >
        <Swords size={14} className="text-arcade-purple group-hover:rotate-45 transition-transform duration-300" />
        <span className="text-xs text-gray-300">
          {count === 1 ? (
            <>
              <span className="text-arcade-cyan font-bold">{name1}</span> — pick 2nd agent
            </>
          ) : (
            <>{count} agents selected</>
          )}
        </span>
        <button
          onClick={openDrawer}
          className="px-2.5 py-1 rounded-full bg-arcade-purple/20 text-arcade-purple text-[10px] font-bold uppercase hover:bg-arcade-purple/30 hover:scale-105 transition-all duration-200"
        >
          {count === 2 ? 'Compare' : 'View'}
        </button>
        <button
          onClick={clearCompare}
          className="p-1 rounded-full hover:bg-surface-3 text-gray-500 hover:text-white hover:rotate-90 transition-all duration-200"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
