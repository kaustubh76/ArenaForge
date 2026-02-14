import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Trophy, Swords, TrendingUp, TrendingDown, Award, Copy, ExternalLink,
  Target, Zap, Shield, Star, Clock, Gamepad2, Play, Radar, Radio, CalendarDays, Download,
} from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar as RechartsRadar, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useAgentStore } from '@/stores/agentStore';
import { useArenaStore } from '@/stores/arenaStore';
import { useSeasonStore } from '@/stores/seasonStore';
import { TOOLTIP_STYLE } from '@/components/charts';
import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { FavoriteButton } from '@/components/agent/FavoriteButton';
import { CompareButton } from '@/components/compare/CompareDrawer';
import { FollowButton } from '@/components/agent/FollowButton';
import { AvatarUpload } from '@/components/agent/AvatarUpload';
import { ShareAgentCard } from '@/components/agent/ShareAgentCard';
import { RankBadge } from '@/components/season/RankBadge';
import { AnimatedScore } from '@/components/arcade/AnimatedScore';
import { NeonButton } from '@/components/arcade/NeonButton';
import { Breadcrumbs } from '@/components/arcade/Breadcrumbs';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { GameTypeBadge } from '@/components/arcade/GameTypeBadge';
import { ProgressBar } from '@/components/arcade/ProgressBar';
import { GameType, MatchStatus, type Achievement, AchievementId, type AchievementRarity } from '@/types/arena';
import { GAME_TYPE_CONFIG } from '@/constants/game';
import { truncateAddress } from '@/constants/ui';
import { timeAgo } from '@/utils/format';
import { useToastStore } from '@/stores/toastStore';
import { downloadMatches } from '@/lib/export-utils';
import { useAccount } from 'wagmi';
import { fetchGraphQL } from '@/lib/api';

interface GameTypeStat {
  gameType: string;
  wins: number;
  losses: number;
  draws: number;
  averageDuration: number;
  winRate: number;
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

// Achievement definitions
const ACHIEVEMENTS: Achievement[] = [
  { id: AchievementId.FirstBlood, name: 'First Blood', description: 'Win your first match', icon: '⚔️', rarity: 'common', requirement: '1 win' },
  { id: AchievementId.StreakStarter, name: 'Streak Starter', description: 'Win 5 matches in a row', icon: '🔥', rarity: 'uncommon', requirement: '5 win streak' },
  { id: AchievementId.StreakMaster, name: 'Streak Master', description: 'Win 10 matches in a row', icon: '💥', rarity: 'rare', requirement: '10 win streak' },
  { id: AchievementId.Champion, name: 'Champion', description: 'Win a tournament', icon: '🏆', rarity: 'rare', requirement: '1 tournament win' },
  { id: AchievementId.GrandChampion, name: 'Grand Champion', description: 'Win 5 tournaments', icon: '👑', rarity: 'epic', requirement: '5 tournament wins' },
  { id: AchievementId.EloElite, name: 'ELO Elite', description: 'Reach 1500 ELO', icon: '⭐', rarity: 'uncommon', requirement: 'Peak ELO >= 1500' },
  { id: AchievementId.Legendary, name: 'Legendary', description: 'Reach 2000 ELO', icon: '💎', rarity: 'legendary', requirement: 'Peak ELO >= 2000' },
  { id: AchievementId.Veteran, name: 'Veteran', description: 'Play 100 matches', icon: '🎖️', rarity: 'uncommon', requirement: '100 matches' },
  { id: AchievementId.Legend, name: 'Legend', description: 'Play 1000 matches', icon: '🏅', rarity: 'epic', requirement: '1000 matches' },
  { id: AchievementId.Perfectionist, name: 'Perfectionist', description: 'Win a match without losing a round', icon: '✨', rarity: 'rare', requirement: 'Flawless victory' },
  { id: AchievementId.OracleProphet, name: 'Oracle Prophet', description: 'Win 10 Oracle Duel matches', icon: '🔮', rarity: 'rare', requirement: '10 Oracle Duel wins' },
  { id: AchievementId.StrategyMastermind, name: 'Strategy Mastermind', description: 'Win 10 Strategy Arena matches', icon: '🧠', rarity: 'rare', requirement: '10 Strategy Arena wins' },
  { id: AchievementId.AuctionAppraiser, name: 'Auction Appraiser', description: 'Win 10 Auction Wars matches', icon: '💰', rarity: 'rare', requirement: '10 Auction Wars wins' },
  { id: AchievementId.QuizSpeedDemon, name: 'Speed Demon', description: 'Win 10 Quiz Bowl matches', icon: '⚡', rarity: 'rare', requirement: '10 Quiz Bowl wins' },
];

const rarityColors: Record<AchievementRarity, { bg: string; border: string; text: string }> = {
  common: { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400' },
  uncommon: { bg: 'bg-arcade-green/10', border: 'border-arcade-green/30', text: 'text-arcade-green' },
  rare: { bg: 'bg-arcade-cyan/10', border: 'border-arcade-cyan/30', text: 'text-arcade-cyan' },
  epic: { bg: 'bg-arcade-purple/10', border: 'border-arcade-purple/30', text: 'text-arcade-purple' },
  legendary: { bg: 'bg-arcade-gold/10', border: 'border-arcade-gold/30', text: 'text-arcade-gold' },
};

function computeAchievements(
  agent: {
    wins: number;
    matchesPlayed: number;
    elo: number;
    longestWinStreak?: number;
    tournamentsWon?: number;
    peakElo?: number;
  },
  gameTypeStats?: GameTypeStat[],
): Achievement[] {
  const unlocked: Achievement[] = [];
  const peak = agent.peakElo ?? agent.elo;
  const streak = agent.longestWinStreak ?? 0;
  const tourneyWins = agent.tournamentsWon ?? 0;

  if (agent.wins >= 1) unlocked.push({ ...ACHIEVEMENTS[0], unlockedAt: Date.now() });
  if (streak >= 5) unlocked.push({ ...ACHIEVEMENTS[1], unlockedAt: Date.now() });
  if (streak >= 10) unlocked.push({ ...ACHIEVEMENTS[2], unlockedAt: Date.now() });
  if (tourneyWins >= 1) unlocked.push({ ...ACHIEVEMENTS[3], unlockedAt: Date.now() });
  if (tourneyWins >= 5) unlocked.push({ ...ACHIEVEMENTS[4], unlockedAt: Date.now() });
  if (peak >= 1500) unlocked.push({ ...ACHIEVEMENTS[5], unlockedAt: Date.now() });
  if (peak >= 2000) unlocked.push({ ...ACHIEVEMENTS[6], unlockedAt: Date.now() });
  if (agent.matchesPlayed >= 100) unlocked.push({ ...ACHIEVEMENTS[7], unlockedAt: Date.now() });
  if (agent.matchesPlayed >= 1000) unlocked.push({ ...ACHIEVEMENTS[8], unlockedAt: Date.now() });

  // Game-specific achievements (IDs 10-13 in the array, indices for the new 4)
  if (gameTypeStats) {
    const gtWins: Record<string, number> = {};
    for (const s of gameTypeStats) gtWins[s.gameType] = s.wins;
    if ((gtWins['ORACLE_DUEL'] ?? 0) >= 10)
      unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === AchievementId.OracleProphet)!, unlockedAt: Date.now() });
    if ((gtWins['STRATEGY_ARENA'] ?? 0) >= 10)
      unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === AchievementId.StrategyMastermind)!, unlockedAt: Date.now() });
    if ((gtWins['AUCTION_WARS'] ?? 0) >= 10)
      unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === AchievementId.AuctionAppraiser)!, unlockedAt: Date.now() });
    if ((gtWins['QUIZ_BOWL'] ?? 0) >= 10)
      unlocked.push({ ...ACHIEVEMENTS.find(a => a.id === AchievementId.QuizSpeedDemon)!, unlockedAt: Date.now() });
  }

  return unlocked;
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="arcade-card p-4 text-center transition-all duration-200 hover:scale-[1.03]">
      <Icon size={18} className={clsx('mx-auto mb-2', color)} style={{ filter: 'drop-shadow(0 0 3px currentColor)' }} />
      <div className="text-xl font-bold text-white font-mono">
        {typeof value === 'number' ? <AnimatedScore value={value} /> : value}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

export function AgentProfile() {
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const { agents, fetchFromChain: fetchAgents, getAgentByAddress } = useAgentStore();
  const { allMatches } = useArenaStore();
  const { currentSeason, mySeasonalProfile } = useSeasonStore();
  const { address: connectedAddress } = useAccount();
  const addToast = useToastStore(s => s.addToast);

  useEffect(() => {
    if (agents.length === 0) fetchAgents();
  }, [agents.length, fetchAgents]);

  const agent = useMemo(
    () => agents.find(a => a.agentAddress.toLowerCase() === address?.toLowerCase()),
    [agents, address]
  );

  // Get match history for this agent
  const matchHistory = useMemo(() => {
    if (!address) return [];
    const addr = address.toLowerCase();
    return allMatches
      .filter(m =>
        m.player1.toLowerCase() === addr || m.player2.toLowerCase() === addr
      )
      .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
      .slice(0, 20);
  }, [allMatches, address]);

  // ELO history visualization
  const eloHistory = useMemo(() => {
    if (!agent) return [];
    return agent.eloHistory ?? [1200, agent.elo];
  }, [agent]);

  // Fetch agent bio + game type stats
  const [bio, setBio] = useState<string | null>(null);
  const [avgDuration, setAvgDuration] = useState<number | null>(null);
  const [gameTypeStats, setGameTypeStats] = useState<GameTypeStat[]>([]);

  const achievements = useMemo(() => {
    if (!agent) return [];
    return computeAchievements(agent, gameTypeStats);
  }, [agent, gameTypeStats]);

  useEffect(() => {
    if (!address) return;
    fetchGraphQL<any>(
      `query($a: String!) {
          agentBio(address: $a)
          agentGameTypeStats(address: $a) { gameType wins losses draws averageDuration winRate }
        }`,
      { a: address },
    )
      .then(({ data }) => {
        setBio(data?.agentBio ?? null);
        const stats = data?.agentGameTypeStats as GameTypeStat[] | undefined;
        if (stats && stats.length > 0) {
          setGameTypeStats(stats);
          const total = stats.reduce((s, x) => s + x.averageDuration, 0);
          setAvgDuration(Math.round(total / stats.length));
        }
      })
      .catch(() => {});
  }, [address]);

  // A2A: Fetch relationship data for this agent
  const [a2aRelationships, setA2aRelationships] = useState<{
    isRival: boolean;
    isAlly: boolean;
    matchCount: number;
    activeChallenges: number;
  }>({ isRival: false, isAlly: false, matchCount: 0, activeChallenges: 0 });

  useEffect(() => {
    if (!address) return;
    fetchGraphQL<any>(
      `query($a: String!) {
          agentRelationships(agent: $a) { agent1 agent2 matchCount isRival isAlly }
          a2aChallenges { id challenger challenged status }
        }`,
      { a: address },
    )
      .then(({ data }) => {
        const rels = data?.agentRelationships as Array<{
          agent1: string; agent2: string; matchCount: number; isRival: boolean; isAlly: boolean;
        }> | undefined;
        const challenges = data?.a2aChallenges as Array<{
          id: number; challenger: string; challenged: string; status: string;
        }> | undefined;

        const addr = address!.toLowerCase();
        const hasRival = rels?.some(r => r.isRival) ?? false;
        const hasAlly = rels?.some(r => r.isAlly) ?? false;
        const totalMatches = rels?.reduce((s, r) => s + r.matchCount, 0) ?? 0;
        const activeChalls = challenges?.filter(
          c => c.status === 'pending' &&
            (c.challenger.toLowerCase() === addr || c.challenged.toLowerCase() === addr)
        ).length ?? 0;

        setA2aRelationships({
          isRival: hasRival,
          isAlly: hasAlly,
          matchCount: totalMatches,
          activeChallenges: activeChalls,
        });
      })
      .catch(() => {});
  }, [address]);

  if (!agent) {
    return (
      <div className="text-center py-20">
        <Swords size={48} className="mx-auto text-gray-600 mb-4" />
        <h2 className="text-xl text-gray-400">Agent Not Found</h2>
        <p className="text-sm text-gray-500 mt-2">
          {address ? truncateAddress(address) : 'Unknown'} is not registered in the arena.
        </p>
        <Link to="/leaderboard" className="mt-4 inline-block text-arcade-purple hover:underline text-sm">
          View Leaderboard
        </Link>
      </div>
    );
  }

  const winRate = agent.matchesPlayed > 0
    ? ((agent.wins / agent.matchesPlayed) * 100).toFixed(1)
    : '0.0';

  const isOwnProfile = connectedAddress?.toLowerCase() === agent.agentAddress.toLowerCase();

  const handleAvatarUpload = async (avatarUrl: string) => {
    await fetchGraphQL<any>(
      `mutation($addr: String!, $url: String!) {
          updateAgentAvatar(address: $addr, avatarUrl: $url)
        }`,
      { addr: agent.agentAddress, url: avatarUrl },
    );
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(agent.agentAddress);
    addToast('Address copied to clipboard');
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[
        { label: 'Leaderboard', to: '/leaderboard' },
        { label: agent.moltbookHandle },
      ]} />
      {/* Header */}
      <div className="arcade-card p-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-64 h-64 bg-arcade-purple rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-arcade-cyan rounded-full blur-3xl" />
        </div>

        <div className="relative flex flex-col sm:flex-row items-start gap-6">
          {isOwnProfile ? (
            <AvatarUpload
              currentAvatarUrl={agent.avatarUrl}
              handle={agent.moltbookHandle}
              onUpload={handleAvatarUpload}
            />
          ) : (
            <AgentAvatar
              avatarUrl={agent.avatarUrl}
              handle={agent.moltbookHandle}
              size="xl"
              className="ring-4 ring-arcade-purple/30"
            />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white truncate">
                {agent.moltbookHandle}
              </h1>
              <FavoriteButton agentAddress={agent.agentAddress} size="md" />
              <FollowButton agentAddress={agent.agentAddress} size="md" />
              <CompareButton agentAddress={agent.agentAddress} />
              {!isOwnProfile && (
                <Link to={`/a2a?target=${agent.agentAddress}`}>
                  <NeonButton color="pink">
                    <span className="flex items-center gap-1.5 text-xs">
                      <Swords size={12} /> Challenge
                    </span>
                  </NeonButton>
                </Link>
              )}
              {a2aRelationships.isAlly && (
                <GlowBadge color="green" label="ALLY" />
              )}
              {a2aRelationships.isRival && (
                <GlowBadge color="pink" label="RIVAL" />
              )}
              {a2aRelationships.activeChallenges > 0 && (
                <GlowBadge color="cyan" label={`${a2aRelationships.activeChallenges} PENDING`} pulsing />
              )}
              {mySeasonalProfile && <RankBadge tier={mySeasonalProfile.tier} size="sm" />}
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
              <span className="font-mono">{truncateAddress(agent.agentAddress)}</span>
              <button onClick={copyAddress} className="hover:text-white transition-colors" title="Copy address">
                <Copy size={14} />
              </button>
              <a
                href={`https://testnet.monadexplorer.com/address/${agent.agentAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-arcade-cyan transition-colors"
                title="View on explorer"
              >
                <ExternalLink size={14} />
              </a>
            </div>

            {bio && (
              <p className="text-sm text-gray-300 mb-4 italic">{bio}</p>
            )}

            {/* ELO Display */}
            <div className="flex items-center gap-6">
              <div>
                <div className="text-3xl font-bold font-mono text-arcade-gold" style={{ textShadow: '0 0 8px rgba(255,215,0,0.3)' }}>
                  {agent.elo}
                </div>
                <div className="text-[10px] text-gray-500 uppercase">Current ELO</div>
              </div>
              {agent.peakElo && agent.peakElo > agent.elo && (
                <div>
                  <div className="text-xl font-bold font-mono text-gray-400">
                    {agent.peakElo}
                  </div>
                  <div className="text-[10px] text-gray-500 uppercase">Peak ELO</div>
                </div>
              )}
              <div>
                <div className={clsx(
                  'text-xl font-bold font-mono flex items-center gap-1',
                  agent.streak > 0 ? 'text-arcade-green' : agent.streak < 0 ? 'text-arcade-red' : 'text-gray-400'
                )}>
                  {agent.streak > 0 ? <TrendingUp size={16} /> : agent.streak < 0 ? <TrendingDown size={16} /> : null}
                  {Math.abs(agent.streak)}
                </div>
                <div className="text-[10px] text-gray-500 uppercase">
                  {agent.streak > 0 ? 'Win Streak' : agent.streak < 0 ? 'Loss Streak' : 'No Streak'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatBox label="Matches" value={agent.matchesPlayed} icon={Swords} color="text-arcade-cyan" />
        <StatBox label="Wins" value={agent.wins} icon={Trophy} color="text-arcade-green" />
        <StatBox label="Losses" value={agent.losses} icon={Target} color="text-arcade-red" />
        <StatBox label="Win Rate" value={`${winRate}%`} icon={TrendingUp} color="text-arcade-gold" />
        <StatBox label="Best Streak" value={agent.longestWinStreak ?? 0} icon={Zap} color="text-arcade-purple" />
        <StatBox label="Achievements" value={achievements.length} icon={Award} color="text-arcade-pink" />
        {avgDuration !== null && (
          <StatBox label="Avg Duration" value={`${Math.floor(avgDuration / 60)}m`} icon={Clock} color="text-gray-400" />
        )}
        {a2aRelationships.matchCount > 0 && (
          <StatBox label="A2A Matches" value={a2aRelationships.matchCount} icon={Radio} color="text-arcade-pink" />
        )}
      </div>

      {/* Agent Stats Radar */}
      <AgentRadarChart
        agent={agent}
        gameTypeStats={gameTypeStats}
        achievements={achievements}
      />

      {/* Game Type Performance */}
      {gameTypeStats.length > 0 && (
        <div className="arcade-card p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Gamepad2 size={14} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
            Game Performance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {gameTypeStats.map(stat => {
              const gtNum = gameTypeStringToNumber(stat.gameType);
              const total = stat.wins + stat.losses + stat.draws;
              return (
                <div key={stat.gameType} className="arcade-card p-4 bg-surface-1 transition-all duration-200 hover:scale-[1.02]">
                  <div className="flex items-center gap-2 mb-3">
                    <GameTypeBadge gameType={gtNum} size="sm" />
                    <span className="text-xs text-gray-400">{total} matches</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-arcade-green">{stat.wins}</div>
                      <div className="text-[9px] text-gray-500 uppercase">Wins</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-arcade-red">{stat.losses}</div>
                      <div className="text-[9px] text-gray-500 uppercase">Losses</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono font-bold text-gray-400">{stat.draws}</div>
                      <div className="text-[9px] text-gray-500 uppercase">Draws</div>
                    </div>
                  </div>
                  <ProgressBar
                    value={stat.winRate * 100}
                    color={stat.winRate >= 0.6 ? 'green' : stat.winRate >= 0.4 ? 'purple' : 'red'}
                    label={`Win Rate: ${(stat.winRate * 100).toFixed(1)}%`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ELO History */}
      {eloHistory.length > 1 && (
        <div className="arcade-card p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <TrendingUp size={14} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
            ELO History
          </h2>
          <div className="flex items-end gap-1 h-24">
            {eloHistory.map((elo, i) => {
              const min = Math.min(...eloHistory);
              const max = Math.max(...eloHistory);
              const range = max - min || 1;
              const height = ((elo - min) / range) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 bg-arcade-gold/30 rounded-t hover:bg-arcade-gold/50 transition-colors relative group"
                  style={{ height: `${Math.max(height, 5)}%` }}
                >
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-surface-1 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
                    {elo}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Match Activity Heatmap */}
      {address && (
        <MatchActivityHeatmap
          matches={allMatches.filter(m =>
            m.player1.toLowerCase() === address.toLowerCase() ||
            m.player2.toLowerCase() === address.toLowerCase()
          )}
          agentAddress={address}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Achievements */}
        <div className="arcade-card p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Award size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
            Achievements ({achievements.length}/{ACHIEVEMENTS.length})
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {ACHIEVEMENTS.map(achievement => {
              const unlocked = achievements.find(a => a.id === achievement.id);
              const colors = rarityColors[achievement.rarity];
              return (
                <div
                  key={achievement.id}
                  className={clsx(
                    'p-3 rounded-lg border transition-all duration-200',
                    unlocked
                      ? `${colors.bg} ${colors.border} hover:scale-[1.03]`
                      : 'bg-surface-2 border-gray-700/50 opacity-40'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{achievement.icon}</span>
                    <span className={clsx(
                      'text-xs font-bold',
                      unlocked ? colors.text : 'text-gray-500'
                    )}>
                      {achievement.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500">{achievement.description}</p>
                  <div className="mt-1">
                    <span className={clsx(
                      'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                      unlocked ? `${colors.bg} ${colors.text}` : 'bg-surface-1 text-gray-600'
                    )}>
                      {achievement.rarity}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Matches */}
        <div className="arcade-card p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Clock size={14} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
            Recent Matches
          </h2>
          {matchHistory.length > 0 ? (
            <div className="space-y-2">
              {matchHistory.map(match => {
                const isPlayer1 = match.player1.toLowerCase() === address?.toLowerCase();
                const opponent = isPlayer1 ? match.player2 : match.player1;
                const won = match.winner?.toLowerCase() === address?.toLowerCase();
                const isLive = match.status === MatchStatus.InProgress;
                const isDraw = match.status === MatchStatus.Completed && !match.winner;

                return (
                  <Link
                    key={match.id}
                    to={`/match/${match.id}`}
                    className={clsx(
                      'flex items-center gap-3 p-3 rounded-lg transition-all duration-200 hover:bg-surface-2 hover:scale-[1.01]',
                      isLive ? 'bg-arcade-green/5 border border-arcade-green/20' : 'bg-surface-1'
                    )}
                  >
                    <div className={clsx(
                      'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                      isLive ? 'bg-arcade-green/20 text-arcade-green' :
                      won ? 'bg-arcade-green/20 text-arcade-green' :
                      isDraw ? 'bg-gray-500/20 text-gray-400' :
                      'bg-arcade-red/20 text-arcade-red'
                    )}>
                      {isLive ? 'LIVE' : won ? 'W' : isDraw ? 'D' : 'L'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">
                        vs {getAgentByAddress(opponent)?.moltbookHandle ?? truncateAddress(opponent)}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Match #{match.id}
                        {match.gameType !== undefined && ` - ${GAME_TYPE_CONFIG[match.gameType as GameType]?.label ?? 'Unknown'}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {match.status === MatchStatus.Completed && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/replay/${match.id}`);
                          }}
                          className="text-gray-500 hover:text-arcade-cyan transition-colors"
                          title="Watch Replay"
                        >
                          <Play size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/h2h/${address}/${opponent}`);
                        }}
                        className="text-gray-500 hover:text-arcade-purple transition-colors"
                        title="Head-to-Head"
                      >
                        <Swords size={14} />
                      </button>
                      <span className="text-xs text-gray-400" title={match.timestamp ? new Date(match.timestamp).toLocaleString() : ''}>
                        {match.timestamp ? timeAgo(match.timestamp) : ''}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <Swords size={32} className="mx-auto text-gray-600 mb-2" />
              <p className="text-sm text-gray-400">No match history yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Agent Card + Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ShareAgentCard
          data={{
            handle: agent.moltbookHandle,
            address: agent.agentAddress,
            elo: agent.elo,
            wins: agent.wins,
            losses: agent.losses,
            matchesPlayed: agent.matchesPlayed,
            winRate: parseFloat(winRate),
            streak: agent.streak,
            peakElo: agent.peakElo,
            longestWinStreak: agent.longestWinStreak,
            tournamentsWon: agent.tournamentsWon,
            gameTypeStats: gameTypeStats.map(s => ({
              gameType: s.gameType,
              wins: s.wins,
              winRate: s.winRate,
            })),
          }}
        />

        {/* Export Match History */}
        <div className="arcade-card p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Download size={14} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
            Export Data
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            Download your match history for analysis or record keeping.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => downloadMatches(matchHistory, 'csv')}
              disabled={matchHistory.length === 0}
              className="w-full flex items-center gap-2 p-3 rounded-lg bg-surface-1 border border-white/[0.06] hover:border-arcade-cyan/30 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} className="text-arcade-cyan" />
              <div>
                <div className="text-xs font-bold text-white">Download CSV</div>
                <div className="text-[10px] text-gray-500">{matchHistory.length} matches</div>
              </div>
            </button>
            <button
              onClick={() => downloadMatches(matchHistory, 'json')}
              disabled={matchHistory.length === 0}
              className="w-full flex items-center gap-2 p-3 rounded-lg bg-surface-1 border border-white/[0.06] hover:border-arcade-purple/30 transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={14} className="text-arcade-purple" />
              <div>
                <div className="text-xs font-bold text-white">Download JSON</div>
                <div className="text-[10px] text-gray-500">{matchHistory.length} matches</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Season Info */}
      {currentSeason && currentSeason.active && (
        <div className="arcade-card p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <Star size={14} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
            Season {currentSeason.id}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <Shield size={20} className="mx-auto text-arcade-purple mb-1" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
              <div className="text-lg font-bold text-white">
                {mySeasonalProfile?.seasonalElo ?? 'Unranked'}
              </div>
              <div className="text-[10px] text-gray-500">Seasonal ELO</div>
            </div>
            <div className="text-center">
              <Trophy size={20} className="mx-auto text-arcade-green mb-1" />
              <div className="text-lg font-bold text-white">{mySeasonalProfile?.wins ?? 0}</div>
              <div className="text-[10px] text-gray-500">Season Wins</div>
            </div>
            <div className="text-center">
              <Target size={20} className="mx-auto text-arcade-red mb-1" />
              <div className="text-lg font-bold text-white">{mySeasonalProfile?.losses ?? 0}</div>
              <div className="text-[10px] text-gray-500">Season Losses</div>
            </div>
            <div className="text-center">
              <TrendingUp size={20} className="mx-auto text-arcade-gold mb-1" />
              <div className="text-lg font-bold text-white">{mySeasonalProfile?.peakElo ?? '-'}</div>
              <div className="text-[10px] text-gray-500">Season Peak</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match Activity Heatmap — GitHub-style contribution calendar
// ---------------------------------------------------------------------------

function MatchActivityHeatmap({ matches, agentAddress }: {
  matches: Array<{ id: number; timestamp?: number; winner?: string | null; player1: string; player2: string }>;
  agentAddress: string;
}) {
  const heatmapData = useMemo(() => {
    const now = new Date();
    const weeks = 12; // 12 weeks
    const days = weeks * 7;
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    // Build day buckets
    const dayMap = new Map<string, { total: number; wins: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      dayMap.set(d.toISOString().slice(0, 10), { total: 0, wins: 0 });
    }

    // Fill with match data
    const addr = agentAddress.toLowerCase();
    for (const m of matches) {
      if (!m.timestamp) continue;
      const ts = m.timestamp > 1e12 ? m.timestamp : m.timestamp * 1000;
      const d = new Date(ts);
      const key = d.toISOString().slice(0, 10);
      const entry = dayMap.get(key);
      if (entry) {
        entry.total++;
        if (m.winner?.toLowerCase() === addr) entry.wins++;
      }
    }

    // Convert to grid (columns = weeks, rows = days 0-6)
    const cells: Array<{ date: string; total: number; wins: number; col: number; row: number }> = [];
    const sortedDays = Array.from(dayMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    for (let i = 0; i < sortedDays.length; i++) {
      const [date, data] = sortedDays[i];
      const d = new Date(date + 'T00:00:00');
      const row = d.getDay(); // 0=Sun .. 6=Sat
      const col = Math.floor(i / 7);
      cells.push({ date, total: data.total, wins: data.wins, col, row });
    }

    const maxCount = Math.max(1, ...cells.map(c => c.total));
    return { cells, maxCount, weeks, startDate };
  }, [matches, agentAddress]);

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Month labels
  const monthLabels = useMemo(() => {
    const labels: Array<{ label: string; col: number }> = [];
    let lastMonth = -1;
    for (const cell of heatmapData.cells) {
      const d = new Date(cell.date + 'T00:00:00');
      const month = d.getMonth();
      if (month !== lastMonth && cell.row === 0) {
        labels.push({
          label: d.toLocaleString('default', { month: 'short' }),
          col: cell.col,
        });
        lastMonth = month;
      }
    }
    return labels;
  }, [heatmapData.cells]);

  return (
    <div className="arcade-card p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
        <CalendarDays size={14} className="text-arcade-green" style={{ filter: 'drop-shadow(0 0 3px rgba(105,240,174,0.4))' }} />
        Match Activity
        <span className="text-[10px] text-gray-600 font-normal ml-1">Last 12 weeks</span>
      </h2>

      <div className="overflow-x-auto">
        <div className="inline-block">
          {/* Month labels */}
          <div className="flex ml-6 mb-1">
            {monthLabels.map((ml, i) => (
              <span
                key={i}
                className="text-[9px] text-gray-600"
                style={{ position: 'relative', left: `${ml.col * 14}px` }}
              >
                {ml.label}
              </span>
            ))}
          </div>

          <div className="flex gap-0">
            {/* Day labels */}
            <div className="flex flex-col gap-[2px] mr-1 pt-0">
              {dayLabels.map((label, i) => (
                <div key={i} className="w-4 h-[12px] flex items-center justify-end pr-0.5">
                  <span className="text-[8px] text-gray-600">{i % 2 === 1 ? label : ''}</span>
                </div>
              ))}
            </div>

            {/* Grid */}
            <div
              className="grid gap-[2px]"
              style={{
                gridTemplateColumns: `repeat(${heatmapData.weeks}, 12px)`,
                gridTemplateRows: 'repeat(7, 12px)',
              }}
            >
              {heatmapData.cells.map((cell) => {
                const intensity = cell.total / heatmapData.maxCount;
                const winRatio = cell.total > 0 ? cell.wins / cell.total : 0;
                // Green for wins, pink for losses, blend based on win ratio
                const greenOp = intensity * winRatio;
                const pinkOp = intensity * (1 - winRatio);
                const bgColor = cell.total === 0
                  ? 'rgba(255,255,255,0.03)'
                  : winRatio >= 0.5
                    ? `rgba(34, 197, 94, ${0.15 + greenOp * 0.7})`
                    : `rgba(244, 63, 94, ${0.15 + pinkOp * 0.7})`;

                return (
                  <div
                    key={`${cell.col}-${cell.row}`}
                    className="rounded-sm transition-colors hover:ring-1 hover:ring-white/30 group relative"
                    style={{
                      gridColumn: cell.col + 1,
                      gridRow: cell.row + 1,
                      backgroundColor: bgColor,
                    }}
                    title={`${cell.date}: ${cell.total} match${cell.total !== 1 ? 'es' : ''}, ${cell.wins} win${cell.wins !== 1 ? 's' : ''}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-3 mt-3 ml-6">
            <span className="text-[9px] text-gray-600">Less</span>
            {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
              <div
                key={i}
                className="w-[10px] h-[10px] rounded-sm"
                style={{
                  backgroundColor: v === 0
                    ? 'rgba(255,255,255,0.03)'
                    : `rgba(34, 197, 94, ${0.15 + v * 0.7})`,
                }}
              />
            ))}
            <span className="text-[9px] text-gray-600">More</span>
            <span className="text-[9px] text-gray-600 ml-2">
              <span className="inline-block w-[8px] h-[8px] rounded-sm mr-0.5" style={{ backgroundColor: 'rgba(34, 197, 94, 0.6)' }} /> Win
            </span>
            <span className="text-[9px] text-gray-600">
              <span className="inline-block w-[8px] h-[8px] rounded-sm mr-0.5" style={{ backgroundColor: 'rgba(244, 63, 94, 0.6)' }} /> Loss
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Stats Radar Chart — multi-dimensional skill spider chart
// ---------------------------------------------------------------------------

function AgentRadarChart({
  agent,
  gameTypeStats,
}: {
  agent: {
    elo: number;
    matchesPlayed: number;
    wins: number;
    losses: number;
    streak: number;
    longestWinStreak?: number;
    peakElo?: number;
    tournamentsWon?: number;
  };
  gameTypeStats: GameTypeStat[];
  achievements?: Achievement[];
}) {
  const data = useMemo(() => {
    const winRate = agent.matchesPlayed > 0 ? (agent.wins / agent.matchesPlayed) * 100 : 0;

    // Normalize ELO to 0-100 scale (800 = 0, 2000 = 100)
    const eloScore = Math.min(100, Math.max(0, ((agent.elo - 800) / 1200) * 100));

    // Experience: logarithmic scale (1 match = ~10, 100 matches = ~60, 500+ = ~100)
    const expScore = Math.min(100, agent.matchesPlayed > 0 ? Math.log10(agent.matchesPlayed) * 35 : 0);

    // Streak power: based on longest win streak (10+ = 100)
    const streakScore = Math.min(100, ((agent.longestWinStreak ?? 0) / 10) * 100);

    // Versatility: how many game types played (4 types = 100)
    const typesPlayed = gameTypeStats.length;
    const versatilityScore = Math.min(100, (typesPlayed / 4) * 100);

    // Consistency: win rate weighted by match count (high winrate + many matches = high)
    const consistencyScore = agent.matchesPlayed >= 5
      ? Math.min(100, winRate * (1 - 1 / Math.sqrt(agent.matchesPlayed)))
      : winRate * 0.5;

    return [
      { stat: 'Win Rate', value: Math.round(winRate), fullMark: 100 },
      { stat: 'ELO Tier', value: Math.round(eloScore), fullMark: 100 },
      { stat: 'Experience', value: Math.round(expScore), fullMark: 100 },
      { stat: 'Streak', value: Math.round(streakScore), fullMark: 100 },
      { stat: 'Versatility', value: Math.round(versatilityScore), fullMark: 100 },
      { stat: 'Consistency', value: Math.round(consistencyScore), fullMark: 100 },
    ];
  }, [agent, gameTypeStats]);

  // Compute overall power rating (average of all dimensions)
  const powerRating = Math.round(data.reduce((s, d) => s + d.value, 0) / data.length);

  return (
    <div className="arcade-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
          <Radar size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
          Agent Power Profile
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Power Rating</span>
          <span
            className={clsx(
              'text-lg font-mono font-bold',
              powerRating >= 70 ? 'text-arcade-green' : powerRating >= 40 ? 'text-arcade-gold' : 'text-arcade-red',
            )}
            style={{ textShadow: powerRating >= 70 ? '0 0 8px rgba(105,240,174,0.3)' : powerRating >= 40 ? '0 0 8px rgba(255,215,0,0.3)' : undefined }}
          >
            {powerRating}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width="100%" height={240}>
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <PolarGrid stroke="#333" strokeDasharray="3 3" />
            <PolarAngleAxis
              dataKey="stat"
              tick={{ fill: '#888', fontSize: 10 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: '#555', fontSize: 8 }}
              tickCount={5}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              formatter={(value: unknown) => [`${value}/100`, 'Score']}
            />
            <RechartsRadar
              name="Stats"
              dataKey="value"
              stroke="#a855f7"
              fill="#a855f7"
              fillOpacity={0.25}
              strokeWidth={2}
              dot={{ r: 3, fill: '#a855f7' }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-2">
        {data.map((d) => (
          <div key={d.stat} className="text-center">
            <div className={clsx(
              'text-sm font-mono font-bold',
              d.value >= 70 ? 'text-arcade-green' : d.value >= 40 ? 'text-arcade-gold' : 'text-gray-400',
            )}>
              {d.value}
            </div>
            <div className="text-[8px] text-gray-600 uppercase">{d.stat}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
