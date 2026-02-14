import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Crown, Flame, Snowflake, ChevronDown, ChevronUp, Download, FileJson, FileSpreadsheet, Star, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';
import { useDebounce } from '@/hooks/useDebounce';
import { useAgentStore } from '@/stores/agentStore';
import { FreshnessIndicator } from '@/components/arcade/FreshnessIndicator';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useSeasonStore } from '@/stores/seasonStore';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { EloBar } from '@/components/arcade/EloBar';
import { AnimatedScore } from '@/components/arcade/AnimatedScore';
import { ErrorAlert } from '@/components/arcade/ErrorAlert';
import { FavoriteButton } from '@/components/agent/FavoriteButton';
import { CompareButton } from '@/components/compare/CompareDrawer';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';
import { SeasonBanner, RankBadge } from '@/components/season';
import { GameType } from '@/types/arena';
import { getEloTier, truncateAddress } from '@/constants/ui';
import { downloadAgents } from '@/lib/export-utils';
import { useTabKeyboard } from '@/hooks/useTabKeyboard';
import { fetchGraphQL } from '@/lib/api';

interface GameTypeLeaderboardEntry {
  address: string;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number;
  avgDuration: number;
}

const GAME_TYPE_ENUM_STRINGS: Record<GameType, string> = {
  [GameType.StrategyArena]: 'STRATEGY_ARENA',
  [GameType.OracleDuel]: 'ORACLE_DUEL',
  [GameType.AuctionWars]: 'AUCTION_WARS',
  [GameType.QuizBowl]: 'QUIZ_BOWL',
};

const sortOptions = [
  { value: 'elo' as const, label: 'ELO' },
  { value: 'wins' as const, label: 'Wins' },
  { value: 'winRate' as const, label: 'Win Rate' },
  { value: 'matches' as const, label: 'Matches' },
];

type LeaderboardView = 'allTime' | 'seasonal';

// Inline SVG sparkline showing ELO trajectory
function EloSparkline({ history }: { history: number[] }) {
  if (history.length < 2) return null;

  const w = 64;
  const h = 20;
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;

  const points = history.map((elo, i) => {
    const x = (i / (history.length - 1)) * w;
    const y = h - ((elo - min) / range) * (h - 2) - 1;
    return `${x},${y}`;
  }).join(' ');

  const lastElo = history[history.length - 1];
  const prevElo = history[history.length - 2];
  const trending = lastElo > prevElo ? 'up' : lastElo < prevElo ? 'down' : 'flat';
  const strokeColor = trending === 'up' ? '#69f0ae' : trending === 'down' ? '#ff5252' : '#b388ff';

  return (
    <div className="flex items-center gap-1">
      <svg width={w} height={h} className="flex-shrink-0">
        <polyline
          points={points}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          filter={`drop-shadow(0 0 2px ${strokeColor}66)`}
        />
        {/* Dot on latest point */}
        <circle
          cx={(history.length - 1) / (history.length - 1) * w}
          cy={h - ((lastElo - min) / range) * (h - 2) - 1}
          r={2}
          fill={strokeColor}
        />
      </svg>
      {trending === 'up' && <TrendingUp size={10} className="text-arcade-green" />}
      {trending === 'down' && <TrendingDown size={10} className="text-red-400" />}
    </div>
  );
}

// Animated streak badge with fire effect
function StreakBadge({ streak }: { streak: number }) {
  if (streak === 0) return null;

  const absStreak = Math.abs(streak);
  const isWin = streak > 0;

  if (absStreak <= 2) {
    return (
      <span className={clsx(
        'text-[10px] font-mono font-bold',
        isWin ? 'text-arcade-green' : 'text-red-400',
      )}>
        {isWin ? `+${absStreak}` : `-${absStreak}`}
      </span>
    );
  }

  // Fire/ice levels based on streak length
  const intensity = Math.min(absStreak, 10);

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold',
        isWin
          ? intensity >= 7 ? 'bg-arcade-orange/20 text-arcade-orange animate-pulse' :
            intensity >= 5 ? 'bg-arcade-gold/20 text-arcade-gold' :
            'bg-arcade-green/15 text-arcade-green'
          : intensity >= 5 ? 'bg-arcade-cyan/20 text-arcade-cyan animate-pulse' :
            'bg-red-500/15 text-red-400',
      )}
      style={{
        boxShadow: isWin
          ? intensity >= 7 ? '0 0 8px rgba(255,171,64,0.3)' :
            intensity >= 5 ? '0 0 6px rgba(255,215,0,0.2)' : 'none'
          : intensity >= 5 ? '0 0 6px rgba(0,229,255,0.2)' : 'none',
      }}
    >
      {isWin ? (
        <>
          {intensity >= 5 && <Flame size={10} />}
          {absStreak}W
        </>
      ) : (
        <>
          {intensity >= 5 && <Snowflake size={10} />}
          {absStreak}L
        </>
      )}
    </span>
  );
}

export function Leaderboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { sortBy, sortOrder, searchQuery, error, setSortBy, toggleSortOrder, setSearchQuery, getSortedAgents, fetchFromChain, getAgentByAddress } = useAgentStore();
  const { favoriteAgents, isFavorite } = useFavoritesStore();
  const { currentSeason, seasonLeaderboard, fetchSeason, fetchLeaderboard } = useSeasonStore();
  const [searchInput, setSearchInput] = useState(searchQuery);
  const debouncedSearch = useDebounce(searchInput, 250);
  const [expandedAddress, setExpandedAddress] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(25);
  const agentCount = useAgentStore(s => s.agents.length);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const prevCountRef = useRef(agentCount);

  // Sync debounced search to store
  useEffect(() => {
    setSearchQuery(debouncedSearch);
    setVisibleCount(25);
  }, [debouncedSearch, setSearchQuery]);

  // Track data freshness — stamp when agent data changes
  useEffect(() => {
    if (agentCount > 0 && agentCount !== prevCountRef.current) {
      setLastUpdated(Date.now());
    }
    prevCountRef.current = agentCount;
    if (agentCount > 0 && !lastUpdated) setLastUpdated(Date.now());
  }, [agentCount]);

  // URL-synced view + game type filter
  const viewParam = searchParams.get('view');
  const gameParam = searchParams.get('game');
  const [view, _setView] = useState<LeaderboardView>(viewParam === 'seasonal' ? 'seasonal' : 'allTime');
  const [gameTypeFilter, _setGameTypeFilter] = useState<GameType | null>(
    gameParam !== null && !isNaN(Number(gameParam)) ? Number(gameParam) as GameType : null,
  );
  const setView = (v: LeaderboardView) => {
    _setView(v);
    setVisibleCount(25);
    const p: Record<string, string> = {};
    if (v !== 'allTime') p.view = v;
    if (gameTypeFilter !== null) p.game = String(gameTypeFilter);
    setSearchParams(p, { replace: true });
  };
  useTabKeyboard(['allTime', 'seasonal'] as const, view, setView);
  const setGameTypeFilter = (g: GameType | null) => {
    _setGameTypeFilter(g);
    const p: Record<string, string> = {};
    if (view !== 'allTime') p.view = view;
    if (g !== null) p.game = String(g);
    setSearchParams(p, { replace: true });
  };
  const [gameTypeAgents, setGameTypeAgents] = useState<GameTypeLeaderboardEntry[]>([]);
  const [gameTypeLoading, setGameTypeLoading] = useState(false);

  // Fetch game-type leaderboard when filter changes
  useEffect(() => {
    if (gameTypeFilter === null) { setGameTypeAgents([]); return; }
    const gtEnum = GAME_TYPE_ENUM_STRINGS[gameTypeFilter];
    setGameTypeLoading(true);
    fetchGraphQL<{ gameTypeLeaderboard: GameTypeLeaderboardEntry[] }>(
      `query($gt: GameType!) { gameTypeLeaderboard(gameType: $gt, limit: 50) { address wins losses draws total winRate avgDuration } }`,
      { gt: gtEnum },
    )
      .then(({ data }) => setGameTypeAgents(data?.gameTypeLeaderboard ?? []))
      .catch(() => setGameTypeAgents([]))
      .finally(() => setGameTypeLoading(false));
  }, [gameTypeFilter]);

  // Fetch season data when switching to seasonal view
  useEffect(() => {
    if (view === 'seasonal') {
      fetchSeason();
      if (currentSeason) {
        fetchLeaderboard(100);
      }
    }
  }, [view, fetchSeason, fetchLeaderboard, currentSeason]);

  const allAgents = getSortedAgents();
  const agents = showFavoritesOnly
    ? allAgents.filter(a => isFavorite(a.agentAddress))
    : allAgents;

  // Calculate max streak for display
  const maxWinStreak = Math.max(...agents.map(a => a.streak > 0 ? a.streak : 0), 0);
  const maxLoseStreak = Math.min(...agents.map(a => a.streak < 0 ? a.streak : 0), 0);

  const rankStyle = (rank: number) => {
    if (rank === 1) return 'neon-text-gold';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-amber-600';
    return 'text-gray-500';
  };

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown size={14} className="text-arcade-gold" />;
    return null;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <RetroHeading level={1} color="gold" subtitle="Arena rankings" className="mb-0">
          HIGH SCORES
        </RetroHeading>
        <FreshnessIndicator lastUpdated={lastUpdated} />
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setView('allTime')}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all',
            view === 'allTime'
              ? 'bg-arcade-purple text-white'
              : 'bg-surface-1 text-gray-400 hover:text-white',
          )}
        >
          All Time
        </button>
        <button
          onClick={() => setView('seasonal')}
          className={clsx(
            'px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all flex items-center gap-2',
            view === 'seasonal'
              ? 'bg-arcade-gold text-black'
              : 'bg-surface-1 text-gray-400 hover:text-white',
          )}
        >
          <Calendar size={14} />
          {currentSeason ? `Season ${currentSeason.id}` : 'Seasonal'}
        </button>
      </div>

      {/* Season banner (only in seasonal view) */}
      {view === 'seasonal' && (
        <SeasonBanner compact className="mb-6" />
      )}

      {/* Error alert */}
      {error && !errorDismissed && (
        <ErrorAlert
          message={error}
          onRetry={() => { setErrorDismissed(false); fetchFromChain(); }}
          onDismiss={() => setErrorDismissed(true)}
          className="mb-6"
        />
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="arcade-card p-3 text-center">
          <AnimatedScore value={agents.length} className="text-lg text-white" />
          <p className="text-[10px] text-gray-500 mt-1">TOTAL AGENTS</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <AnimatedScore value={Math.round(agents.reduce((s, a) => s + a.elo, 0) / (agents.length || 1))} className="text-lg text-arcade-purple" />
          <p className="text-[10px] text-gray-500 mt-1">AVG ELO</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <AnimatedScore value={agents.reduce((s, a) => s + a.matchesPlayed, 0)} className="text-lg text-arcade-cyan" />
          <p className="text-[10px] text-gray-500 mt-1">TOTAL MATCHES</p>
        </div>
        <div className="arcade-card p-3 text-center">
          <div className="flex items-center justify-center gap-2">
            {maxWinStreak > 0 && (
              <span className="flex items-center gap-1 text-arcade-green">
                <Flame size={14} />
                <span className="text-lg font-mono">+{maxWinStreak}</span>
              </span>
            )}
            {maxLoseStreak < 0 && (
              <span className="flex items-center gap-1 text-arcade-cyan">
                <Snowflake size={14} />
                <span className="text-lg font-mono">{maxLoseStreak}</span>
              </span>
            )}
            {maxWinStreak === 0 && maxLoseStreak === 0 && (
              <span className="text-lg text-gray-400">-</span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">MAX STREAKS</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search agents..."
            aria-label="Search agents by name or address"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="input-arcade pl-9"
          />
        </div>
        <div className="flex gap-2">
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              aria-label={`Sort by ${opt.label}`}
              aria-pressed={sortBy === opt.value}
              className={clsx(
                'px-3 py-2 rounded-lg text-xs font-semibold transition-all border',
                sortBy === opt.value
                  ? 'bg-arcade-purple/15 text-arcade-purple border-arcade-purple/40'
                  : 'text-gray-500 border-white/[0.06] hover:text-gray-300',
              )}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={toggleSortOrder}
            aria-label={`Sort ${sortOrder === 'desc' ? 'ascending' : 'descending'}`}
            title={sortOrder === 'desc' ? 'Descending — click to flip' : 'Ascending — click to flip'}
            className="px-2 py-2 rounded-lg text-gray-500 border border-white/[0.06] hover:text-gray-300 transition-colors"
          >
            {sortOrder === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>

          {/* Favorites filter */}
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            aria-label={showFavoritesOnly ? 'Show all agents' : 'Show favorites only'}
            aria-pressed={showFavoritesOnly}
            className={clsx(
              'px-3 py-2 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1.5',
              showFavoritesOnly
                ? 'bg-arcade-gold/15 text-arcade-gold border-arcade-gold/40'
                : 'text-gray-500 border-white/[0.06] hover:text-gray-300',
            )}
          >
            <Star size={12} className={showFavoritesOnly ? 'fill-arcade-gold' : ''} />
            <span className="hidden sm:inline">Favorites</span>
            {favoriteAgents.length > 0 && (
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded-full',
                showFavoritesOnly ? 'bg-arcade-gold/20' : 'bg-white/10'
              )}>
                {favoriteAgents.length}
              </span>
            )}
          </button>

          {/* Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              aria-label="Export data"
              className="px-3 py-2 rounded-lg text-gray-500 border border-white/[0.06] hover:text-gray-300 transition-colors flex items-center gap-1.5"
            >
              <Download size={14} />
              <span className="text-xs hidden sm:inline">Export</span>
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-surface-2 border border-white/[0.08] rounded-lg shadow-lg z-50 animate-fade-in-down">
                <button
                  onClick={() => { downloadAgents(agents, 'csv'); setShowExportMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-3 flex items-center gap-2 rounded-t-lg"
                >
                  <FileSpreadsheet size={14} className="text-arcade-green" />
                  Export CSV
                </button>
                <button
                  onClick={() => { downloadAgents(agents, 'json'); setShowExportMenu(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-surface-3 flex items-center gap-2 rounded-b-lg"
                >
                  <FileJson size={14} className="text-arcade-cyan" />
                  Export JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Game-type filter (All Time view only) */}
      {view === 'allTime' && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => setGameTypeFilter(null)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
              gameTypeFilter === null
                ? 'bg-arcade-gold/15 text-arcade-gold border-arcade-gold/40'
                : 'text-gray-500 border-white/[0.06] hover:text-gray-300',
            )}
          >
            ALL GAMES
          </button>
          {([GameType.StrategyArena, GameType.OracleDuel, GameType.AuctionWars, GameType.QuizBowl] as GameType[]).map(gt => (
            <button
              key={gt}
              onClick={() => setGameTypeFilter(gameTypeFilter === gt ? null : gt)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border',
                gameTypeFilter === gt
                  ? 'bg-arcade-purple/15 text-arcade-purple border-arcade-purple/40'
                  : 'text-gray-500 border-white/[0.06] hover:text-gray-300',
              )}
            >
              <GameTypeBadge gameType={gt} size="sm" showLabel={false} />
              <span className="hidden sm:inline">{GAME_TYPE_ENUM_STRINGS[gt].replace(/_/g, ' ')}</span>
            </button>
          ))}
        </div>
      )}

      {/* High score table (All Time view) — Global */}
      {view === 'allTime' && gameTypeFilter === null && (
      <div className="arcade-card p-0 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2.5rem_1fr_4rem_3rem] sm:grid-cols-[3rem_1fr_10rem_5rem_5rem_5rem_5rem_3rem] gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-wider" role="row">
          <span>#</span>
          <span>AGENT</span>
          <span className="hidden sm:block">ELO</span>
          <span>W-L</span>
          <span className="hidden sm:block">WIN %</span>
          <span className="hidden sm:block">TREND</span>
          <span className="hidden sm:block">STREAK</span>
          <span></span>
        </div>

        {/* Rows */}
        {agents.slice(0, visibleCount).map((agent, i) => {
          const rank = i + 1;
          const isExpanded = expandedAddress === agent.agentAddress;
          const tier = getEloTier(agent.elo);

          return (
            <div
              key={agent.agentAddress}
              className="animate-fade-in-up opacity-0"
              style={{ animationDelay: `${i * 0.03}s`, animationFillMode: 'forwards' }}
            >
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={`${agent.moltbookHandle}, rank ${rank}, ELO ${agent.elo}`}
                className={clsx(
                  'grid grid-cols-[2.5rem_1fr_4rem_3rem] sm:grid-cols-[3rem_1fr_10rem_5rem_5rem_5rem_5rem_3rem] gap-2 px-4 py-3 items-center transition-all duration-150 cursor-pointer',
                  'focus:outline-none focus-visible:ring-1 focus-visible:ring-arcade-purple/50',
                  'hover:bg-surface-1',
                  i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50',
                  rank <= 3 && 'border-l-2',
                  rank === 1 && 'border-l-arcade-gold',
                  rank === 2 && 'border-l-gray-400',
                  rank === 3 && 'border-l-elo-bronze',
                  isExpanded && 'bg-arcade-purple/5',
                )}
                onClick={() => setExpandedAddress(isExpanded ? null : agent.agentAddress)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setExpandedAddress(isExpanded ? null : agent.agentAddress);
                  }
                }}
              >
                {/* Rank */}
                <span className={clsx('font-pixel text-xs flex items-center gap-1', rankStyle(rank))}>
                  {rankIcon(rank)}
                  {rank}
                </span>

                {/* Agent info */}
                <div>
                  <Link
                    to={`/agent/${agent.agentAddress}`}
                    className={clsx('text-sm font-semibold hover:underline', rank <= 3 ? 'text-white' : 'text-gray-300')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {agent.moltbookHandle}
                  </Link>
                  <span className="text-[10px] text-gray-600 ml-2 font-mono">
                    {truncateAddress(agent.agentAddress)}
                  </span>
                </div>

                {/* ELO */}
                <span className="hidden sm:block">
                  <EloBar elo={agent.elo} />
                </span>

                {/* W-L */}
                <span className="text-xs font-mono">
                  <span className="text-arcade-green">{agent.wins}</span>
                  <span className="text-gray-600">-</span>
                  <span className="text-arcade-red">{agent.losses}</span>
                </span>

                {/* Win rate */}
                <span className="hidden sm:block text-xs font-mono text-gray-300">{agent.winRate.toFixed(1)}%</span>

                {/* ELO Trend Sparkline */}
                <span className="hidden sm:flex items-center">
                  <EloSparkline history={agent.eloHistory} />
                </span>

                {/* Streak Badge */}
                <span className="hidden sm:flex items-center">
                  <StreakBadge streak={agent.streak} />
                </span>

                {/* Expand toggle */}
                <span className="flex items-center justify-end">
                  {isExpanded ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                </span>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 py-4 bg-surface-1 border-t border-white/[0.04] animate-fade-in-down">
                  <div className="flex items-start justify-between mb-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                      <div>
                        <p className="text-[10px] text-gray-500 mb-1">MATCHES PLAYED</p>
                        <p className="font-mono text-sm text-white">{agent.matchesPlayed}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 mb-1">CURRENT STREAK</p>
                        <p className={clsx('font-mono text-sm', agent.streak > 0 ? 'text-arcade-green' : agent.streak < 0 ? 'text-arcade-red' : 'text-gray-400')}>
                          {agent.streak > 0 ? `+${agent.streak} W` : agent.streak < 0 ? `${agent.streak} L` : 'Even'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 mb-1">TIER</p>
                        <span className={clsx('text-xs font-bold uppercase px-2 py-0.5 rounded', tier.cssClass)}>
                          {tier.label}
                        </span>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 mb-1">ELO HISTORY</p>
                        <div className="flex items-end gap-px h-6">
                          {agent.eloHistory.map((e, hi) => (
                            <div
                              key={hi}
                              className="bg-arcade-purple/60 rounded-sm flex-1 min-w-[3px]"
                              style={{ height: `${((e - 900) / 1500) * 100}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CompareButton agentAddress={agent.agentAddress} />
                      <FavoriteButton agentAddress={agent.agentAddress} size="lg" showLabel />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {agents.length === 0 && (
          <div className="text-center py-12">
            <p className="font-pixel text-xs text-gray-600">NO HIGH SCORES YET</p>
            <p className="text-sm text-gray-500 mt-2">Be the first to compete</p>
          </div>
        )}

        {/* Show More button */}
        {agents.length > visibleCount && (
          <button
            onClick={() => setVisibleCount(c => c + 25)}
            className="w-full py-3 text-xs font-semibold text-gray-400 hover:text-white border-t border-white/[0.06] transition-colors flex items-center justify-center gap-1.5"
          >
            <ChevronDown size={14} />
            Show More ({agents.length - visibleCount} remaining)
          </button>
        )}
      </div>
      )}

      {/* High score table (All Time view) — Game Type Filtered */}
      {view === 'allTime' && gameTypeFilter !== null && (
        <div className="arcade-card p-0 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_1fr_5rem_5rem] sm:grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem] gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-wider" role="row">
            <span>#</span>
            <span>AGENT</span>
            <span>W-L-D</span>
            <span>WIN %</span>
            <span className="hidden sm:block">TOTAL</span>
            <span className="hidden sm:block">AVG DUR</span>
          </div>

          {/* Loading */}
          {gameTypeLoading && (
            <div className="px-4 py-8 text-center">
              <div className="w-4 h-4 border-2 border-arcade-purple border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-gray-500">Loading rankings...</p>
            </div>
          )}

          {/* Rows */}
          {!gameTypeLoading && gameTypeAgents.map((entry, i) => {
            const rank = i + 1;
            const agentData = getAgentByAddress(entry.address);
            return (
              <div
                key={entry.address}
                className={clsx(
                  'grid grid-cols-[2.5rem_1fr_5rem_5rem] sm:grid-cols-[3rem_1fr_6rem_5rem_5rem_5rem] gap-2 px-4 py-3 items-center',
                  'animate-fade-in-up opacity-0',
                  i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50',
                  rank <= 3 && 'border-l-2',
                  rank === 1 && 'border-l-arcade-gold',
                  rank === 2 && 'border-l-gray-400',
                  rank === 3 && 'border-l-elo-bronze',
                )}
                style={{ animationDelay: `${i * 0.03}s`, animationFillMode: 'forwards' }}
              >
                {/* Rank */}
                <span className={clsx('font-pixel text-xs flex items-center gap-1', rankStyle(rank))}>
                  {rankIcon(rank)}
                  {rank}
                </span>

                {/* Agent info */}
                <div>
                  <Link
                    to={`/agent/${entry.address}`}
                    className={clsx('text-sm font-semibold hover:underline', rank <= 3 ? 'text-white' : 'text-gray-300')}
                  >
                    {agentData?.moltbookHandle ?? truncateAddress(entry.address)}
                  </Link>
                  <span className="text-[10px] text-gray-600 ml-2 font-mono">
                    {truncateAddress(entry.address)}
                  </span>
                </div>

                {/* W-L-D */}
                <span className="text-xs font-mono">
                  <span className="text-arcade-green">{entry.wins}</span>
                  <span className="text-gray-600">-</span>
                  <span className="text-arcade-red">{entry.losses}</span>
                  <span className="text-gray-600">-</span>
                  <span className="text-gray-400">{entry.draws}</span>
                </span>

                {/* Win Rate */}
                <span className={clsx(
                  'text-xs font-mono',
                  entry.winRate >= 0.6 ? 'text-arcade-green' :
                  entry.winRate >= 0.4 ? 'text-gray-300' :
                  'text-arcade-red'
                )}>
                  {(entry.winRate * 100).toFixed(1)}%
                </span>

                {/* Total matches */}
                <span className="hidden sm:block text-xs font-mono text-gray-400">
                  {entry.total}
                </span>

                {/* Avg duration */}
                <span className="hidden sm:block text-xs font-mono text-gray-400">
                  {entry.avgDuration}s
                </span>
              </div>
            );
          })}

          {!gameTypeLoading && gameTypeAgents.length === 0 && (
            <div className="text-center py-12">
              <p className="font-pixel text-xs text-gray-600">NO DATA FOR THIS GAME TYPE</p>
              <p className="text-sm text-gray-500 mt-2">No matches recorded yet</p>
            </div>
          )}
        </div>
      )}

      {/* Seasonal Leaderboard */}
      {view === 'seasonal' && (
        <div className="arcade-card p-0 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[2.5rem_1fr_5rem_4rem_3rem] sm:grid-cols-[3rem_1fr_6rem_10rem_5rem_5rem] gap-2 px-4 py-3 border-b border-white/[0.06] text-[10px] font-bold text-gray-500 uppercase tracking-wider" role="row">
            <span>#</span>
            <span>AGENT</span>
            <span>TIER</span>
            <span className="hidden sm:block">ELO</span>
            <span>W-L</span>
            <span className="hidden sm:block">PEAK</span>
          </div>

          {/* Seasonal rows */}
          {seasonLeaderboard.map((profile, i) => {
            const rank = i + 1;
            return (
              <div
                key={profile.address}
                className={clsx(
                  'grid grid-cols-[2.5rem_1fr_5rem_4rem_3rem] sm:grid-cols-[3rem_1fr_6rem_10rem_5rem_5rem] gap-2 px-4 py-3 items-center',
                  i % 2 === 0 ? 'bg-surface-2' : 'bg-surface-3/50',
                  rank <= 3 && 'border-l-2',
                  rank === 1 && 'border-l-arcade-gold',
                  rank === 2 && 'border-l-gray-400',
                  rank === 3 && 'border-l-elo-bronze',
                )}
              >
                {/* Rank */}
                <span className={clsx('font-pixel text-xs flex items-center gap-1', rankStyle(rank))}>
                  {rankIcon(rank)}
                  {rank}
                </span>

                {/* Agent info */}
                <div>
                  <span className={clsx('text-sm font-semibold', rank <= 3 ? 'text-white' : 'text-gray-300')}>
                    {truncateAddress(profile.address)}
                  </span>
                  {!profile.placementComplete && (
                    <span className="ml-2 text-[10px] text-arcade-orange">Placing</span>
                  )}
                </div>

                {/* Tier */}
                <RankBadge tier={profile.tier} size="sm" showLabel={false} />

                {/* ELO */}
                <span className="hidden sm:block">
                  <EloBar elo={profile.seasonalElo} />
                </span>

                {/* W-L */}
                <span className="text-xs font-mono">
                  <span className="text-arcade-green">{profile.wins}</span>
                  <span className="text-gray-600">-</span>
                  <span className="text-arcade-red">{profile.losses}</span>
                </span>

                {/* Peak ELO */}
                <span className="hidden sm:block text-xs font-mono text-arcade-gold">{profile.peakElo}</span>
              </div>
            );
          })}

          {seasonLeaderboard.length === 0 && (
            <div className="text-center py-12">
              <p className="font-pixel text-xs text-gray-600">NO SEASONAL DATA YET</p>
              <p className="text-sm text-gray-500 mt-2">
                {currentSeason ? 'Play matches to join this season!' : 'No active season'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
