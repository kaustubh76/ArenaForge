import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Award, Lock, Trophy, Swords, Star, Target, ArrowRight, Sparkles, Radio } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { useAccount } from 'wagmi';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { ProgressBar } from '@/components/arcade/ProgressBar';
import { NeonButton } from '@/components/arcade/NeonButton';
import { AchievementId, type Achievement, type AchievementRarity } from '@/types/arena';

// Full achievement definitions with progress thresholds
const ACHIEVEMENTS: (Achievement & { threshold: number; category: string })[] = [
  { id: AchievementId.FirstBlood, name: 'First Blood', description: 'Win your first match', icon: '⚔️', rarity: 'common', requirement: '1 win', threshold: 1, category: 'Combat' },
  { id: AchievementId.StreakStarter, name: 'Streak Starter', description: 'Win 5 matches in a row', icon: '🔥', rarity: 'uncommon', requirement: '5 win streak', threshold: 5, category: 'Combat' },
  { id: AchievementId.StreakMaster, name: 'Streak Master', description: 'Win 10 matches in a row', icon: '💥', rarity: 'rare', requirement: '10 win streak', threshold: 10, category: 'Combat' },
  { id: AchievementId.Champion, name: 'Champion', description: 'Win a tournament', icon: '🏆', rarity: 'rare', requirement: '1 tournament win', threshold: 1, category: 'Tournament' },
  { id: AchievementId.GrandChampion, name: 'Grand Champion', description: 'Win 5 tournaments', icon: '👑', rarity: 'epic', requirement: '5 tournament wins', threshold: 5, category: 'Tournament' },
  { id: AchievementId.EloElite, name: 'ELO Elite', description: 'Reach 1500 ELO', icon: '⭐', rarity: 'uncommon', requirement: 'Peak ELO >= 1500', threshold: 1500, category: 'Rating' },
  { id: AchievementId.Legendary, name: 'Legendary', description: 'Reach 2000 ELO', icon: '💎', rarity: 'legendary', requirement: 'Peak ELO >= 2000', threshold: 2000, category: 'Rating' },
  { id: AchievementId.Veteran, name: 'Veteran', description: 'Play 100 matches', icon: '🎖️', rarity: 'uncommon', requirement: '100 matches', threshold: 100, category: 'Experience' },
  { id: AchievementId.Legend, name: 'Legend', description: 'Play 1000 matches', icon: '🏅', rarity: 'epic', requirement: '1000 matches', threshold: 1000, category: 'Experience' },
  { id: AchievementId.Perfectionist, name: 'Perfectionist', description: 'Win a match without losing a round', icon: '✨', rarity: 'rare', requirement: 'Flawless victory', threshold: 1, category: 'Combat' },
  { id: AchievementId.Diplomat, name: 'Diplomat', description: 'Form your first alliance with another agent', icon: '🤝', rarity: 'uncommon', requirement: '1 alliance', threshold: 1, category: 'A2A' },
  { id: AchievementId.Nemesis, name: 'Nemesis', description: 'Play 5+ matches against a single rival', icon: '💀', rarity: 'rare', requirement: '5 rivalry matches', threshold: 5, category: 'A2A' },
  { id: AchievementId.AllianceMaster, name: 'Alliance Master', description: 'Form 3 alliances with different agents', icon: '🌐', rarity: 'epic', requirement: '3 alliances', threshold: 3, category: 'A2A' },
];

const rarityColors: Record<AchievementRarity, { bg: string; border: string; text: string; glow: string }> = {
  common: { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400', glow: '' },
  uncommon: { bg: 'bg-arcade-green/10', border: 'border-arcade-green/30', text: 'text-arcade-green', glow: 'shadow-arcade-green/10' },
  rare: { bg: 'bg-arcade-cyan/10', border: 'border-arcade-cyan/30', text: 'text-arcade-cyan', glow: 'shadow-arcade-cyan/20' },
  epic: { bg: 'bg-arcade-purple/10', border: 'border-arcade-purple/30', text: 'text-arcade-purple', glow: 'shadow-arcade-purple/20' },
  legendary: { bg: 'bg-arcade-gold/10', border: 'border-arcade-gold/30', text: 'text-arcade-gold', glow: 'shadow-arcade-gold/30' },
};

const categoryIcons: Record<string, React.ElementType> = {
  Combat: Swords,
  Tournament: Trophy,
  Rating: Star,
  Experience: Target,
  A2A: Radio,
};

interface A2AProgressData {
  allianceCount: number;
  maxRivalryMatches: number;
}

function getProgress(
  agent: {
    wins: number;
    matchesPlayed: number;
    elo: number;
    longestWinStreak?: number;
    tournamentsWon?: number;
    peakElo?: number;
  },
  achievement: (typeof ACHIEVEMENTS)[number],
  a2aData?: A2AProgressData,
): { current: number; max: number; unlocked: boolean } {
  const peak = agent.peakElo ?? agent.elo;
  const streak = agent.longestWinStreak ?? 0;
  const tourneyWins = agent.tournamentsWon ?? 0;

  switch (achievement.id) {
    case AchievementId.FirstBlood:
      return { current: Math.min(agent.wins, 1), max: 1, unlocked: agent.wins >= 1 };
    case AchievementId.StreakStarter:
      return { current: Math.min(streak, 5), max: 5, unlocked: streak >= 5 };
    case AchievementId.StreakMaster:
      return { current: Math.min(streak, 10), max: 10, unlocked: streak >= 10 };
    case AchievementId.Champion:
      return { current: Math.min(tourneyWins, 1), max: 1, unlocked: tourneyWins >= 1 };
    case AchievementId.GrandChampion:
      return { current: Math.min(tourneyWins, 5), max: 5, unlocked: tourneyWins >= 5 };
    case AchievementId.EloElite:
      return { current: Math.min(peak, 1500), max: 1500, unlocked: peak >= 1500 };
    case AchievementId.Legendary:
      return { current: Math.min(peak, 2000), max: 2000, unlocked: peak >= 2000 };
    case AchievementId.Veteran:
      return { current: Math.min(agent.matchesPlayed, 100), max: 100, unlocked: agent.matchesPlayed >= 100 };
    case AchievementId.Legend:
      return { current: Math.min(agent.matchesPlayed, 1000), max: 1000, unlocked: agent.matchesPlayed >= 1000 };
    case AchievementId.Perfectionist:
      return { current: 0, max: 1, unlocked: false }; // tracked elsewhere
    case AchievementId.Diplomat: {
      const c = a2aData?.allianceCount ?? 0;
      return { current: Math.min(c, 1), max: 1, unlocked: c >= 1 };
    }
    case AchievementId.Nemesis: {
      const c = a2aData?.maxRivalryMatches ?? 0;
      return { current: Math.min(c, 5), max: 5, unlocked: c >= 5 };
    }
    case AchievementId.AllianceMaster: {
      const c = a2aData?.allianceCount ?? 0;
      return { current: Math.min(c, 3), max: 3, unlocked: c >= 3 };
    }
    default:
      return { current: 0, max: 1, unlocked: false };
  }
}

// ── SVG Radial Donut for category progress ────────────────────────────
function CategoryDonut({ label, unlocked, total, icon: Icon }: {
  label: string;
  unlocked: number;
  total: number;
  icon: React.ElementType;
}) {
  const pct = total > 0 ? unlocked / total : 0;
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const dashLen = circumference * pct;
  const colorMap: Record<string, string> = {
    Combat: '#22d3ee',    // arcade-cyan
    Tournament: '#a855f7', // arcade-purple
    Rating: '#ffd700',    // arcade-gold
    Experience: '#22c55e', // arcade-green
    A2A: '#ff4081',       // arcade-pink
  };
  const strokeColor = colorMap[label] ?? '#888';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="#333" strokeWidth="6" />
          <circle
            cx="40" cy="40" r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dashLen} ${circumference - dashLen}`}
            className="transition-all duration-700"
            style={{ filter: `drop-shadow(0 0 4px ${strokeColor}40)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon size={16} style={{ color: strokeColor }} />
          <span className="text-sm font-mono font-bold text-white mt-0.5">
            {unlocked}/{total}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{label}</span>
    </div>
  );
}

// ── Next-to-unlock callout ─────────────────────────────────────────────
function NextToUnlock({ agent, achievements, a2aData }: {
  agent: { wins: number; matchesPlayed: number; elo: number; longestWinStreak?: number; tournamentsWon?: number; peakElo?: number };
  achievements: (Achievement & { threshold: number; category: string })[];
  a2aData: A2AProgressData;
}) {
  // Find the closest-to-completion locked achievement
  const candidates = achievements
    .map(a => {
      const prog = getProgress(agent, a, a2aData);
      if (prog.unlocked) return null;
      return { ...a, progress: prog, pct: prog.max > 0 ? prog.current / prog.max : 0 };
    })
    .filter(Boolean)
    .sort((a, b) => b!.pct - a!.pct) as Array<(Achievement & { threshold: number; category: string; progress: { current: number; max: number }; pct: number })>;

  if (candidates.length === 0) return null;
  const next = candidates[0];
  const colors = rarityColors[next.rarity];
  const remaining = next.progress.max - next.progress.current;

  return (
    <div className={clsx(
      'arcade-card p-4 border-2 border-dashed',
      colors.border,
    )}>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles size={14} className="text-arcade-gold" />
        <span className="text-[10px] text-arcade-gold uppercase tracking-wider font-bold">Next to Unlock</span>
      </div>
      <div className="flex items-center gap-4">
        <div className={clsx(
          'w-14 h-14 rounded-lg flex items-center justify-center text-3xl',
          colors.bg,
        )}>
          {next.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-white">{next.name}</span>
            <span className={clsx('text-[9px] uppercase px-1.5 py-0.5 rounded', colors.bg, colors.text)}>
              {next.rarity}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-2">{next.description}</p>
          <ProgressBar value={next.pct * 100} color="gold" label={`${next.progress.current} / ${next.progress.max}`} />
          <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
            <ArrowRight size={10} />
            {remaining} more to go
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Rarity Showcase Bar ────────────────────────────────────────────────
function RarityShowcase({ agent, a2aData }: {
  agent: { wins: number; matchesPlayed: number; elo: number; longestWinStreak?: number; tournamentsWon?: number; peakElo?: number };
  a2aData: A2AProgressData;
}) {
  const rarities: AchievementRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const totalByRarity = rarities.map(r => {
    const total = ACHIEVEMENTS.filter(a => a.rarity === r).length;
    const unlocked = ACHIEVEMENTS.filter(a => a.rarity === r && getProgress(agent, a, a2aData).unlocked).length;
    return { rarity: r, total, unlocked };
  });

  const barTotal = ACHIEVEMENTS.length;

  return (
    <div className="arcade-card p-4">
      <h3 className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-3">
        Rarity Breakdown
      </h3>
      {/* Stacked bar */}
      <div className="flex h-6 rounded-lg overflow-hidden bg-surface-2 mb-3">
        {totalByRarity.map(({ rarity, unlocked }) => {
          if (unlocked === 0) return null;
          const width = (unlocked / barTotal) * 100;
          const colorMap: Record<string, string> = {
            common: '#6b7280',
            uncommon: '#22c55e',
            rare: '#22d3ee',
            epic: '#a855f7',
            legendary: '#ffd700',
          };
          return (
            <div
              key={rarity}
              className="h-full transition-all duration-500"
              style={{
                width: `${width}%`,
                backgroundColor: colorMap[rarity] ?? '#888',
                opacity: 0.8,
              }}
              title={`${rarity}: ${unlocked}`}
            />
          );
        })}
      </div>
      {/* Labels */}
      <div className="flex justify-between">
        {totalByRarity.map(({ rarity, total, unlocked }) => {
          const colors = rarityColors[rarity];
          return (
            <div key={rarity} className="text-center">
              <div className={clsx('text-xs font-mono font-bold', unlocked > 0 ? colors.text : 'text-gray-600')}>
                {unlocked}/{total}
              </div>
              <div className="text-[8px] text-gray-600 capitalize">{rarity}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AchievementsPage() {
  const { address } = useAccount();
  const agents = useAgentStore(s => s.agents);

  const agent = useMemo(() => {
    if (!address) return null;
    return agents.find(a => a.agentAddress.toLowerCase() === address.toLowerCase());
  }, [agents, address]);

  // A2A achievement progress data
  const [a2aData, setA2aData] = useState<A2AProgressData>({ allianceCount: 0, maxRivalryMatches: 0 });

  useEffect(() => {
    if (!agent) return;
    const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';
    fetch(gqlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($a: String!) {
          agentRelationships(agent: $a) { matchCount isAlly isRival }
        }`,
        variables: { a: agent.agentAddress },
      }),
    })
      .then(r => r.json())
      .then(json => {
        const rels = json?.data?.agentRelationships as Array<{
          matchCount: number; isAlly: boolean; isRival: boolean;
        }> | undefined;
        const allianceCount = rels?.filter(r => r.isAlly).length ?? 0;
        const rivalMatches = rels?.filter(r => r.isRival).map(r => r.matchCount) ?? [0];
        const maxRivalryMatches = Math.max(0, ...rivalMatches);
        setA2aData({ allianceCount, maxRivalryMatches });
      })
      .catch(() => {});
  }, [agent]);

  // Group by category
  const categories = useMemo(() => {
    const grouped: Record<string, typeof ACHIEVEMENTS> = {};
    for (const a of ACHIEVEMENTS) {
      if (!grouped[a.category]) grouped[a.category] = [];
      grouped[a.category].push(a);
    }
    return Object.entries(grouped);
  }, []);

  const unlockedCount = useMemo(() => {
    if (!agent) return 0;
    return ACHIEVEMENTS.filter(a => getProgress(agent, a, a2aData).unlocked).length;
  }, [agent, a2aData]);

  if (!address) {
    return (
      <div className="text-center py-16">
        <Award size={48} className="mx-auto text-gray-600 mb-4" />
        <RetroHeading level={2} color="purple" className="mb-2">
          ACHIEVEMENTS
        </RetroHeading>
        <p className="text-sm text-gray-400 mb-6">Connect your wallet to track your achievement progress</p>
        <Link to="/">
          <NeonButton variant="neon" color="purple">BACK TO LOBBY</NeonButton>
        </Link>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="text-center py-16">
        <Award size={48} className="mx-auto text-gray-600 mb-4" />
        <RetroHeading level={2} color="purple" className="mb-2">
          ACHIEVEMENTS
        </RetroHeading>
        <p className="text-sm text-gray-400 mb-6">No agent found for your address. Register in a tournament to start earning achievements!</p>
        <Link to="/">
          <NeonButton variant="neon" color="purple">BACK TO LOBBY</NeonButton>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <RetroHeading level={1} color="purple" subtitle="Track your progress">
        ACHIEVEMENTS
      </RetroHeading>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="arcade-card p-4 text-center">
          <Award size={20} className="mx-auto mb-2 text-arcade-purple" />
          <div className="text-2xl font-bold text-white font-mono">{unlockedCount}</div>
          <div className="text-[10px] text-gray-500 uppercase">Unlocked</div>
        </div>
        <div className="arcade-card p-4 text-center">
          <Lock size={20} className="mx-auto mb-2 text-gray-500" />
          <div className="text-2xl font-bold text-gray-400 font-mono">{ACHIEVEMENTS.length - unlockedCount}</div>
          <div className="text-[10px] text-gray-500 uppercase">Locked</div>
        </div>
        <div className="arcade-card p-4 text-center col-span-2">
          <div className="text-[10px] text-gray-500 uppercase mb-2">Completion</div>
          <ProgressBar
            value={(unlockedCount / ACHIEVEMENTS.length) * 100}
            color="purple"
            label={`${unlockedCount} / ${ACHIEVEMENTS.length}`}
          />
        </div>
      </div>

      {/* Category radial donuts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {categories.map(([category, achievements]) => {
          const CategoryIcon = categoryIcons[category] ?? Award;
          const unlockedInCat = achievements.filter(a => getProgress(agent, a, a2aData).unlocked).length;
          return (
            <CategoryDonut
              key={category}
              label={category}
              unlocked={unlockedInCat}
              total={achievements.length}
              icon={CategoryIcon}
            />
          );
        })}
      </div>

      {/* Next to unlock callout + rarity showcase */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <NextToUnlock agent={agent} achievements={ACHIEVEMENTS} a2aData={a2aData} />
        <RarityShowcase agent={agent} a2aData={a2aData} />
      </div>

      {/* Achievement categories */}
      <div className="space-y-8">
        {categories.map(([category, achievements]) => {
          const CategoryIcon = categoryIcons[category] ?? Award;
          return (
            <div key={category}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
                <CategoryIcon size={14} className="text-arcade-cyan" />
                {category}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {achievements.map(achievement => {
                  const progress = getProgress(agent, achievement, a2aData);
                  const colors = rarityColors[achievement.rarity];
                  const pct = progress.max > 0 ? (progress.current / progress.max) * 100 : 0;

                  return (
                    <div
                      key={achievement.id}
                      className={clsx(
                        'arcade-card p-4 border transition-all',
                        progress.unlocked
                          ? `${colors.border} ${colors.glow ? `shadow-lg ${colors.glow}` : ''}`
                          : 'border-gray-700/50',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={clsx(
                          'w-12 h-12 rounded-lg flex items-center justify-center text-2xl flex-shrink-0',
                          progress.unlocked ? colors.bg : 'bg-surface-2 grayscale opacity-50',
                        )}>
                          {achievement.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={clsx(
                              'text-sm font-bold',
                              progress.unlocked ? 'text-white' : 'text-gray-500',
                            )}>
                              {achievement.name}
                            </span>
                            <span className={clsx(
                              'text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded',
                              progress.unlocked ? `${colors.bg} ${colors.text}` : 'bg-surface-1 text-gray-600',
                            )}>
                              {achievement.rarity}
                            </span>
                          </div>
                          <p className={clsx(
                            'text-xs mb-2',
                            progress.unlocked ? 'text-gray-300' : 'text-gray-500',
                          )}>
                            {achievement.description}
                          </p>

                          {/* Progress bar */}
                          <div className="flex items-center gap-2">
                            <ProgressBar
                              value={pct}
                              color={progress.unlocked ? 'green' : 'purple'}
                              className="flex-1"
                              animated={false}
                            />
                            <span className={clsx(
                              'text-[10px] font-mono w-16 text-right',
                              progress.unlocked ? 'text-arcade-green' : 'text-gray-500',
                            )}>
                              {progress.unlocked ? 'DONE' : `${progress.current}/${progress.max}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
