import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import clsx from 'clsx';
import { Swords, Trophy, TrendingUp, BarChart3, Play, Share2, Flame, Zap, Target, Radio } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { NeonButton } from '@/components/arcade/NeonButton';
import { ShimmerLoader } from '@/components/arcade/ShimmerLoader';
import { Breadcrumbs } from '@/components/arcade/Breadcrumbs';
import { ShareMatchButton } from '@/components/share/ShareMatchButton';
import { GAME_TYPE_CONFIG } from '@/constants/game';
import { GameType } from '@/types/arena';
import { useToastStore } from '@/stores/toastStore';

interface H2HData {
  agent1: string;
  agent2: string;
  agent1Wins: number;
  agent2Wins: number;
  draws: number;
  totalMatches: number;
  matches: Array<{
    matchId: number;
    tournamentId: number;
    gameType: string;
    winner: string | null;
    isDraw: boolean;
    duration: number;
    timestamp: number;
  }>;
}

const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

export function HeadToHead() {
  const { agent1: a1Param, agent2: a2Param } = useParams<{ agent1: string; agent2: string }>();
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);

  const [data, setData] = useState<H2HData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // A2A relationship status between these two agents
  const [a2aRel, setA2aRel] = useState<{
    relationship: 'RIVAL' | 'ALLY' | 'NEUTRAL';
    matchCount: number;
    challengeCount: number;
    messagesExchanged: number;
  }>({ relationship: 'NEUTRAL', matchCount: 0, challengeCount: 0, messagesExchanged: 0 });

  const fetchH2H = useCallback(async () => {
    if (!a1Param || !a2Param) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query H2H($agent1: String!, $agent2: String!) {
            headToHead(agent1: $agent1, agent2: $agent2) {
              agent1 agent2
              agent1Wins agent2Wins draws totalMatches
              matches {
                matchId tournamentId gameType winner isDraw duration timestamp
              }
            }
          }`,
          variables: { agent1: a1Param, agent2: a2Param },
        }),
      });

      const json = await response.json();
      setData(json?.data?.headToHead ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [a1Param, a2Param]);

  useEffect(() => { fetchH2H(); }, [fetchH2H]);

  // Fetch A2A relationship data between these two agents
  useEffect(() => {
    if (!a1Param || !a2Param) return;
    fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($a: String!) {
          agentRelationships(agent: $a) { agent1 agent2 matchCount isRival isAlly }
          a2aChallenges { id challenger challenged status }
          a2aMessages(agent: $a, limit: 100) { id fromAgent toAgent }
        }`,
        variables: { a: a1Param },
      }),
    })
      .then(r => r.json())
      .then(json => {
        const rels = json?.data?.agentRelationships as Array<{
          agent1: string; agent2: string; matchCount: number; isRival: boolean; isAlly: boolean;
        }> | undefined;
        const challenges = json?.data?.a2aChallenges as Array<{
          challenger: string; challenged: string; status: string;
        }> | undefined;
        const messages = json?.data?.a2aMessages as Array<{
          fromAgent: string; toAgent: string;
        }> | undefined;

        const a1 = a1Param.toLowerCase();
        const a2 = a2Param.toLowerCase();

        // Find relationship between these two specific agents
        const rel = rels?.find(r =>
          (r.agent1.toLowerCase() === a1 && r.agent2.toLowerCase() === a2) ||
          (r.agent1.toLowerCase() === a2 && r.agent2.toLowerCase() === a1)
        );

        // Count challenges between these two
        const challCount = challenges?.filter(c =>
          (c.challenger.toLowerCase() === a1 && c.challenged.toLowerCase() === a2) ||
          (c.challenger.toLowerCase() === a2 && c.challenged.toLowerCase() === a1)
        ).length ?? 0;

        // Count messages between these two
        const msgCount = messages?.filter(m =>
          (m.fromAgent.toLowerCase() === a1 && m.toAgent.toLowerCase() === a2) ||
          (m.fromAgent.toLowerCase() === a2 && m.toAgent.toLowerCase() === a1)
        ).length ?? 0;

        setA2aRel({
          relationship: rel?.isRival ? 'RIVAL' : rel?.isAlly ? 'ALLY' : 'NEUTRAL',
          matchCount: rel?.matchCount ?? 0,
          challengeCount: challCount,
          messagesExchanged: msgCount,
        });
      })
      .catch(() => {});
  }, [a1Param, a2Param]);

  const agent1 = getAgentByAddress(a1Param ?? '');
  const agent2 = getAgentByAddress(a2Param ?? '');
  const a1Name = agent1?.moltbookHandle ?? a1Param?.slice(0, 8) ?? '???';
  const a2Name = agent2?.moltbookHandle ?? a2Param?.slice(0, 8) ?? '???';

  if (loading) {
    return (
      <div className="space-y-6">
        <ShimmerLoader width="w-32" height="h-4" />
        <ShimmerLoader width="w-64" height="h-8" />
        <div className="grid grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="arcade-card p-6 space-y-3">
              <ShimmerLoader variant="circle" width="w-12" height="h-12" />
              <ShimmerLoader width="w-2/3" height="h-4" />
              <ShimmerLoader width="w-1/2" height="h-3" />
              <ShimmerLoader width="w-full" height="h-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs crumbs={[
        { label: a1Name, to: `/agent/${a1Param}` },
        { label: `vs ${a2Name}` },
      ]} />

      {/* Title */}
      <div className="text-center mb-8">
        <RetroHeading level={2} color="purple" className="mb-2">
          HEAD-TO-HEAD
        </RetroHeading>
        <p className="text-sm text-gray-400">Complete rivalry breakdown</p>
        <ShareRivalryButton a1Name={a1Name} a2Name={a2Name} />
      </div>

      {/* Matchup Header */}
      <div className="arcade-card p-6 mb-6">
        <div className="grid grid-cols-3 gap-4 items-center">
          {/* Agent 1 */}
          <Link to={`/agent/${a1Param}`} className="text-center group">
            <AgentAvatar handle={a1Name} size="lg" className="mx-auto mb-2" />
            <div className="font-bold text-arcade-cyan group-hover:underline">{a1Name}</div>
            {agent1 && (
              <div className="text-xs text-gray-400 mt-1">
                ELO {agent1.elo} &middot; {agent1.wins}W / {agent1.losses}L
              </div>
            )}
          </Link>

          {/* VS */}
          <div className="text-center flex flex-col items-center gap-1.5">
            <Swords className="w-10 h-10 text-arcade-purple" style={{ filter: 'drop-shadow(0 0 6px rgba(168,85,247,0.4))' }} />
            <div className="text-sm text-gray-400 uppercase tracking-wider" style={{ textShadow: '0 0 6px rgba(168,85,247,0.2)' }}>versus</div>
            {a2aRel.relationship !== 'NEUTRAL' && (
              <GlowBadge
                color={a2aRel.relationship === 'RIVAL' ? 'pink' : 'green'}
                label={a2aRel.relationship}
                pulsing={a2aRel.relationship === 'RIVAL'}
              />
            )}
            <Link to={`/a2a?target=${a2Param}`}>
              <NeonButton color="pink">
                <span className="flex items-center gap-1.5 text-xs">
                  <Radio size={12} /> Challenge
                </span>
              </NeonButton>
            </Link>
          </div>

          {/* Agent 2 */}
          <Link to={`/agent/${a2Param}`} className="text-center group">
            <AgentAvatar handle={a2Name} size="lg" className="mx-auto mb-2" />
            <div className="font-bold text-arcade-pink group-hover:underline">{a2Name}</div>
            {agent2 && (
              <div className="text-xs text-gray-400 mt-1">
                ELO {agent2.elo} &middot; {agent2.wins}W / {agent2.losses}L
              </div>
            )}
          </Link>
        </div>
      </div>

      {/* A2A History */}
      {(a2aRel.matchCount > 0 || a2aRel.challengeCount > 0 || a2aRel.messagesExchanged > 0) && (
        <div className="arcade-card p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Radio size={14} className="text-arcade-pink" style={{ filter: 'drop-shadow(0 0 3px rgba(236,72,153,0.4))' }} />
            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">A2A History</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-surface-1 rounded-lg p-3 text-center transition-all duration-200 hover:scale-[1.03]">
              <div className="text-lg font-mono font-bold text-arcade-cyan" style={{ textShadow: '0 0 6px rgba(0,229,255,0.2)' }}>{a2aRel.matchCount}</div>
              <div className="text-[9px] text-gray-500 uppercase">A2A Matches</div>
            </div>
            <div className="bg-surface-1 rounded-lg p-3 text-center transition-all duration-200 hover:scale-[1.03]">
              <div className="text-lg font-mono font-bold text-arcade-pink" style={{ textShadow: '0 0 6px rgba(236,72,153,0.2)' }}>{a2aRel.challengeCount}</div>
              <div className="text-[9px] text-gray-500 uppercase">Challenges</div>
            </div>
            <div className="bg-surface-1 rounded-lg p-3 text-center transition-all duration-200 hover:scale-[1.03]">
              <div className="text-lg font-mono font-bold text-arcade-gold" style={{ textShadow: '0 0 6px rgba(255,215,0,0.2)' }}>{a2aRel.messagesExchanged}</div>
              <div className="text-[9px] text-gray-500 uppercase">Messages</div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="arcade-card border-arcade-red/30 p-4 mb-6 text-center">
          <p className="text-arcade-red text-sm">{error}</p>
        </div>
      )}

      {/* Win Probability Gauge */}
      <MatchupPredictor
        agent1={agent1}
        agent2={agent2}
        h2h={data}
        a1Name={a1Name}
        a2Name={a2Name}
      />

      {!data ? (
        <div className="arcade-card p-12 text-center">
          <Swords className="w-12 h-12 text-gray-500 mx-auto mb-4" />
          <p className="text-gray-400 text-lg">No match history between these agents</p>
          <p className="text-gray-500 text-sm mt-2">They haven't faced each other yet</p>
        </div>
      ) : (
        <>
          {/* Win/Loss Summary */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard
              label={a1Name + ' Wins'}
              value={data.agent1Wins}
              color="cyan"
              icon={<Trophy size={18} />}
            />
            <StatCard
              label="Draws"
              value={data.draws}
              color="gray"
              icon={<BarChart3 size={18} />}
            />
            <StatCard
              label={a2Name + ' Wins'}
              value={data.agent2Wins}
              color="pink"
              icon={<Trophy size={18} />}
            />
          </div>

          {/* Win distribution bar */}
          <div className="arcade-card p-4 mb-6">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-3 text-center">
              Win Distribution ({data.totalMatches} matches)
            </div>
            <WinDistributionBar
              a1Wins={data.agent1Wins}
              a2Wins={data.agent2Wins}
              draws={data.draws}
              a1Name={a1Name}
              a2Name={a2Name}
            />
          </div>

          {/* Game type breakdown */}
          <GameTypeBreakdown
            matches={data.matches}
            agent1={data.agent1}
            a1Name={a1Name}
            a2Name={a2Name}
          />

          {/* Rivalry Timeline */}
          <RivalryTimeline
            matches={data.matches}
            agent1={data.agent1}
            a1Name={a1Name}
            a2Name={a2Name}
          />

          {/* Match History */}
          <div className="arcade-card p-4 mt-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
              <TrendingUp size={14} />
              Match History
            </h3>
            <div className="space-y-2">
              {data.matches.map((m) => {
                const isA1Win = m.winner?.toLowerCase() === data.agent1.toLowerCase();
                const isA2Win = m.winner?.toLowerCase() === data.agent2.toLowerCase();
                const gameConfig = GAME_TYPE_CONFIG[gameTypeStringToNumber(m.gameType)];
                return (
                  <Link
                    key={m.matchId}
                    to={`/match/${m.matchId}`}
                    className="flex items-center justify-between p-3 bg-surface-1 rounded-lg hover:bg-surface-2 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                        m.isDraw ? 'bg-gray-600/30 text-gray-400' :
                        isA1Win ? 'bg-arcade-cyan/20 text-arcade-cyan' :
                        'bg-arcade-pink/20 text-arcade-pink',
                      )}>
                        #{m.matchId}
                      </div>
                      <div>
                        <div className="text-sm text-white">
                          {m.isDraw ? 'Draw' : isA1Win ? `${a1Name} wins` : isA2Win ? `${a2Name} wins` : 'Unknown'}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {gameConfig?.label ?? m.gameType}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                      {m.duration > 0 && (
                        <span className="text-[10px] text-gray-500">{Math.floor(m.duration / 60)}m</span>
                      )}
                      <ShareMatchButton matchId={m.matchId} size="sm" />
                      <Play size={12} className="text-gray-500 group-hover:text-arcade-purple transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matchup Predictor — SVG gauge showing win probability
// ---------------------------------------------------------------------------

function MatchupPredictor({
  agent1,
  agent2,
  h2h,
  a1Name,
  a2Name,
}: {
  agent1: ReturnType<typeof useAgentStore.getState>['agents'][0] | undefined;
  agent2: ReturnType<typeof useAgentStore.getState>['agents'][0] | undefined;
  h2h: H2HData | null;
  a1Name: string;
  a2Name: string;
}) {
  if (!agent1 || !agent2) return null;

  // ELO-based expected score (Elo formula)
  const eloDiff = agent1.elo - agent2.elo;
  const eloProb = 1 / (1 + Math.pow(10, -eloDiff / 400));

  // H2H adjustment
  let h2hProb = 0.5;
  if (h2h && h2h.totalMatches > 0) {
    h2hProb = (h2h.agent1Wins + h2h.draws * 0.5) / h2h.totalMatches;
  }

  // Form adjustment — recent win rate (last 5 matches)
  const a1Form = agent1.matchesPlayed > 0 ? agent1.winRate / 100 : 0.5;
  const a2Form = agent2.matchesPlayed > 0 ? agent2.winRate / 100 : 0.5;
  const formAdj = a1Form / (a1Form + a2Form || 1);

  // Weighted combination
  const hasH2H = h2h && h2h.totalMatches > 0;
  const winProb = hasH2H
    ? eloProb * 0.4 + h2hProb * 0.35 + formAdj * 0.25
    : eloProb * 0.6 + formAdj * 0.4;

  const a1Pct = Math.round(winProb * 100);
  const a2Pct = 100 - a1Pct;

  // SVG arc gauge parameters
  const cx = 120;
  const cy = 100;
  const r = 70;
  const startAngle = Math.PI;  // 180 degrees (left)
  const endAngle = 0;          // 0 degrees (right)
  const totalArc = Math.PI;
  const needleAngle = startAngle - winProb * totalArc;

  // Arc path helper
  const arcPath = (startA: number, endA: number) => {
    const x1 = cx + r * Math.cos(startA);
    const y1 = cy - r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy - r * Math.sin(endA);
    const largeArc = Math.abs(startA - endA) > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;
  };

  // Needle endpoint
  const needleLen = r - 10;
  const nx = cx + needleLen * Math.cos(needleAngle);
  const ny = cy - needleLen * Math.sin(needleAngle);

  // Factor labels
  const eloEdge = Math.abs(eloDiff);
  const eloFavor = eloDiff > 0 ? a1Name : eloDiff < 0 ? a2Name : 'Even';

  return (
    <div className="arcade-card p-5 mb-6">
      <div className="text-center mb-2">
        <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase flex items-center justify-center gap-2">
          <Target size={14} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
          Matchup Predictor
        </h3>
      </div>

      <div className="flex items-center justify-center">
        <svg width={240} height={130} viewBox="0 0 240 130">
          {/* Background arc */}
          <path
            d={arcPath(startAngle, endAngle)}
            fill="none"
            stroke="#333"
            strokeWidth={12}
            strokeLinecap="round"
          />
          {/* Agent 1 arc (cyan, from left) */}
          <path
            d={arcPath(startAngle, startAngle - winProb * totalArc)}
            fill="none"
            stroke="#00e5ff"
            strokeWidth={12}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
          {/* Agent 2 arc (pink, from right) */}
          <path
            d={arcPath(endAngle + (1 - winProb) * totalArc, endAngle)}
            fill="none"
            stroke="#ff4081"
            strokeWidth={12}
            strokeLinecap="round"
            className="transition-all duration-1000"
          />
          {/* Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke="#ffd740"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r={5} fill="#ffd740" />
          {/* Center text */}
          <text x={cx} y={cy + 20} textAnchor="middle" fill="#fff" fontSize={11} fontWeight="bold" fontFamily="monospace">
            PREDICTION
          </text>
          {/* Left / Right labels */}
          <text x={30} y={cy + 5} textAnchor="middle" fill="#00e5ff" fontSize={10} fontFamily="monospace">
            {a1Pct}%
          </text>
          <text x={210} y={cy + 5} textAnchor="middle" fill="#ff4081" fontSize={10} fontFamily="monospace">
            {a2Pct}%
          </text>
        </svg>
      </div>

      {/* Factor breakdown */}
      <div className="grid grid-cols-3 gap-3 mt-2">
        <div className="text-center bg-surface-1 rounded-lg p-2 transition-all duration-200 hover:scale-[1.03]">
          <div className="text-[9px] text-gray-500 uppercase">ELO Edge</div>
          <div className={clsx(
            'text-sm font-mono font-bold',
            eloDiff > 0 ? 'text-arcade-cyan' : eloDiff < 0 ? 'text-arcade-pink' : 'text-gray-400',
          )}>
            {eloEdge > 0 ? `+${eloEdge}` : '0'}
          </div>
          <div className="text-[8px] text-gray-600 truncate">{eloFavor}</div>
        </div>
        <div className="text-center bg-surface-1 rounded-lg p-2 transition-all duration-200 hover:scale-[1.03]">
          <div className="text-[9px] text-gray-500 uppercase">H2H Record</div>
          <div className="text-sm font-mono font-bold text-gray-300">
            {hasH2H ? `${h2h!.agent1Wins}-${h2h!.draws}-${h2h!.agent2Wins}` : 'N/A'}
          </div>
          <div className="text-[8px] text-gray-600">{hasH2H ? `${h2h!.totalMatches} games` : 'No history'}</div>
        </div>
        <div className="text-center bg-surface-1 rounded-lg p-2 transition-all duration-200 hover:scale-[1.03]">
          <div className="text-[9px] text-gray-500 uppercase">Form</div>
          <div className="flex items-center justify-center gap-1">
            <span className="text-[10px] font-mono text-arcade-cyan">{agent1.winRate.toFixed(0)}%</span>
            <span className="text-[8px] text-gray-600">vs</span>
            <span className="text-[10px] font-mono text-arcade-pink">{agent2.winRate.toFixed(0)}%</span>
          </div>
          <div className="text-[8px] text-gray-600">Win rates</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: 'cyan' | 'pink' | 'gray';
  icon: React.ReactNode;
}) {
  const colorMap = {
    cyan: 'text-arcade-cyan border-arcade-cyan/30',
    pink: 'text-arcade-pink border-arcade-pink/30',
    gray: 'text-gray-400 border-gray-600',
  };
  const glowMap = {
    cyan: '0 0 8px rgba(0,229,255,0.06)',
    pink: '0 0 8px rgba(236,72,153,0.06)',
    gray: 'none',
  };
  const textGlowMap = {
    cyan: '0 0 8px rgba(0,229,255,0.25)',
    pink: '0 0 8px rgba(236,72,153,0.25)',
    gray: 'none',
  };

  return (
    <div
      className={clsx('arcade-card p-4 text-center border transition-all duration-200 hover:scale-[1.03]', colorMap[color])}
      style={{ boxShadow: glowMap[color] }}
    >
      <div className={clsx('mx-auto mb-2', colorMap[color].split(' ')[0])}>{icon}</div>
      <div className={clsx('text-3xl font-mono font-bold', colorMap[color].split(' ')[0])} style={{ textShadow: textGlowMap[color] }}>
        {value}
      </div>
      <div className="text-xs text-gray-400 mt-1 truncate">{label}</div>
    </div>
  );
}

function WinDistributionBar({
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
      <div className="flex h-6 rounded-lg overflow-hidden">
        {a1Pct > 0 && (
          <div
            className="bg-arcade-cyan flex items-center justify-center text-[10px] font-bold text-black"
            style={{ width: `${a1Pct}%` }}
          >
            {a1Pct >= 15 ? `${a1Wins}` : ''}
          </div>
        )}
        {drawPct > 0 && (
          <div
            className="bg-gray-600 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ width: `${drawPct}%` }}
          >
            {drawPct >= 15 ? `${draws}` : ''}
          </div>
        )}
        {a2Pct > 0 && (
          <div
            className="bg-arcade-pink flex items-center justify-center text-[10px] font-bold text-black"
            style={{ width: `${a2Pct}%` }}
          >
            {a2Pct >= 15 ? `${a2Wins}` : ''}
          </div>
        )}
      </div>
      <div className="flex justify-between mt-1 text-[10px]">
        <span className="text-arcade-cyan">{a1Name} {a1Pct.toFixed(0)}%</span>
        {draws > 0 && <span className="text-gray-400">Draws {drawPct.toFixed(0)}%</span>}
        <span className="text-arcade-pink">{a2Name} {a2Pct.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function GameTypeBreakdown({
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
  // Group by game type
  const byType: Record<string, { a1Wins: number; a2Wins: number; draws: number; total: number }> = {};
  for (const m of matches) {
    if (!byType[m.gameType]) {
      byType[m.gameType] = { a1Wins: 0, a2Wins: 0, draws: 0, total: 0 };
    }
    byType[m.gameType].total++;
    if (m.isDraw) byType[m.gameType].draws++;
    else if (m.winner?.toLowerCase() === agent1.toLowerCase()) byType[m.gameType].a1Wins++;
    else byType[m.gameType].a2Wins++;
  }

  const entries = Object.entries(byType);
  if (entries.length <= 1) return null;

  return (
    <div className="arcade-card p-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
        <BarChart3 size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
        By Game Type
      </h3>
      <div className="space-y-3">
        {entries.map(([gameType, stats]) => {
          const config = GAME_TYPE_CONFIG[gameTypeStringToNumber(gameType)];
          return (
            <div key={gameType} className="flex items-center gap-3">
              <div className="w-24 text-xs text-gray-300 truncate">
                {config?.label ?? gameType}
              </div>
              <div className="flex-1">
                <div className="flex h-3 rounded-full overflow-hidden bg-surface-1">
                  {stats.a1Wins > 0 && (
                    <div
                      className="bg-arcade-cyan"
                      style={{ width: `${(stats.a1Wins / stats.total) * 100}%` }}
                    />
                  )}
                  {stats.draws > 0 && (
                    <div
                      className="bg-gray-600"
                      style={{ width: `${(stats.draws / stats.total) * 100}%` }}
                    />
                  )}
                  {stats.a2Wins > 0 && (
                    <div
                      className="bg-arcade-pink"
                      style={{ width: `${(stats.a2Wins / stats.total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="text-[10px] text-gray-400 w-16 text-right">
                {stats.a1Wins}-{stats.draws}-{stats.a2Wins}
              </div>
            </div>
          );
        })}
        <div className="flex items-center justify-center gap-4 text-[10px] text-gray-500 mt-2 pt-2 border-t border-gray-700/50">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-arcade-cyan" /> {a1Name}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-600" /> Draw</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-arcade-pink" /> {a2Name}</span>
        </div>
      </div>
    </div>
  );
}

function ShareRivalryButton({ a1Name, a2Name }: { a1Name: string; a2Name: string }) {
  const addToast = useToastStore(s => s.addToast);
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    const text = `${a1Name} vs ${a2Name} — Head-to-Head rivalry on ArenaForge!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: `${a1Name} vs ${a2Name}`, text, url });
        return;
      } catch {
        // Cancelled or failed
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      addToast('H2H link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  return (
    <button
      onClick={handleShare}
      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-surface-3 hover:bg-surface-4 text-gray-400 hover:text-white border border-white/10 hover:border-arcade-purple/50 transition-all"
    >
      <Share2 size={12} />
      {copied ? 'Link Copied!' : 'Share Rivalry'}
    </button>
  );
}

function RivalryTimeline({
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
  if (matches.length < 2) return null;

  // Sort chronologically
  const sorted = [...matches].sort((a, b) => a.timestamp - b.timestamp);

  // Compute streaks
  const streaks = useMemo(() => {
    const result: Array<{ type: 'a1' | 'a2' | 'draw'; count: number; startIdx: number }> = [];
    let current: typeof result[0] | null = null;

    sorted.forEach((m, i) => {
      const type = m.isDraw ? 'draw' : m.winner?.toLowerCase() === agent1.toLowerCase() ? 'a1' : 'a2';
      if (current && current.type === type) {
        current.count++;
      } else {
        if (current) result.push(current);
        current = { type, count: 1, startIdx: i };
      }
    });
    if (current) result.push(current);
    return result;
  }, [sorted, agent1]);

  const longestStreak = streaks.reduce((best, s) => s.count > best.count ? s : best, streaks[0]);

  // Recent momentum (last 5 matches)
  const last5 = sorted.slice(-5);
  const recentA1 = last5.filter(m => !m.isDraw && m.winner?.toLowerCase() === agent1.toLowerCase()).length;
  const recentA2 = last5.filter(m => !m.isDraw && m.winner?.toLowerCase() !== agent1.toLowerCase() && !m.isDraw).length;
  const momentumPct = last5.length > 0 ? (recentA1 / last5.length) * 100 : 50;

  return (
    <div className="arcade-card p-4 mt-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
        <Flame size={14} style={{ filter: 'drop-shadow(0 0 3px rgba(255,152,0,0.4))' }} />
        Rivalry Timeline
      </h3>

      {/* Visual timeline strip */}
      <div className="mb-4">
        <div className="flex gap-1">
          {sorted.map((m) => {
            const isA1Win = !m.isDraw && m.winner?.toLowerCase() === agent1.toLowerCase();
            const isA2Win = !m.isDraw && m.winner?.toLowerCase() !== agent1.toLowerCase();
            return (
              <Link
                key={m.matchId}
                to={`/match/${m.matchId}`}
                className={clsx(
                  'flex-1 h-8 rounded-sm transition-all hover:scale-y-125 cursor-pointer relative group',
                  isA1Win && 'bg-arcade-cyan',
                  isA2Win && 'bg-arcade-pink',
                  m.isDraw && 'bg-gray-600',
                )}
                title={`Match #${m.matchId}: ${m.isDraw ? 'Draw' : isA1Win ? a1Name + ' wins' : a2Name + ' wins'}`}
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 hidden group-hover:block text-[8px] text-gray-400 whitespace-nowrap">
                  #{m.matchId}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-gray-600">
          <span>First</span>
          <span>Latest</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Longest streak */}
        <div className="bg-surface-1 rounded-lg p-3 text-center transition-all duration-200 hover:scale-[1.02]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Longest Streak</div>
          <div
            className={clsx(
              'text-xl font-bold font-mono',
              longestStreak.type === 'a1' ? 'text-arcade-cyan' : longestStreak.type === 'a2' ? 'text-arcade-pink' : 'text-gray-400',
            )}
            style={{ textShadow: longestStreak.type === 'a1' ? '0 0 8px rgba(0,229,255,0.25)' : longestStreak.type === 'a2' ? '0 0 8px rgba(236,72,153,0.25)' : 'none' }}
          >
            {longestStreak.count} {longestStreak.count === 1 ? 'win' : 'wins'}
          </div>
          <div className="text-[10px] text-gray-500">
            {longestStreak.type === 'a1' ? a1Name : longestStreak.type === 'a2' ? a2Name : 'Draws'}
          </div>
        </div>

        {/* Recent momentum */}
        <div className="bg-surface-1 rounded-lg p-3 text-center transition-all duration-200 hover:scale-[1.02]">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
            <Zap size={10} style={{ filter: 'drop-shadow(0 0 2px rgba(255,215,0,0.4))' }} />
            Recent Form (Last 5)
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-surface-0 my-2">
            {momentumPct > 0 && (
              <div className="bg-arcade-cyan transition-all" style={{ width: `${momentumPct}%` }} />
            )}
            {100 - momentumPct > 0 && (
              <div className="bg-arcade-pink transition-all" style={{ width: `${100 - momentumPct}%` }} />
            )}
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-arcade-cyan">{a1Name} {recentA1}</span>
            <span className="text-arcade-pink">{a2Name} {recentA2}</span>
          </div>
        </div>
      </div>
    </div>
  );
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
