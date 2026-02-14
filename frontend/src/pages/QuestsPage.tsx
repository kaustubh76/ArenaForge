import { useEffect } from 'react';
import clsx from 'clsx';
import { Flame, Star, Clock, Gift, Check, Zap } from 'lucide-react';
import { useQuestStore, type Quest, type QuestProgress } from '@/stores/questStore';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { ProgressBar } from '@/components/arcade/ProgressBar';
import { NeonButton } from '@/components/arcade/NeonButton';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { Breadcrumbs } from '@/components/arcade/Breadcrumbs';

export function QuestsPage() {
  const { refreshQuests, getActiveQuests, claimQuest, totalXP, level } = useQuestStore();

  // Refresh quests on mount (rotate daily/weekly)
  useEffect(() => {
    refreshQuests();
  }, [refreshQuests]);

  const quests = getActiveQuests();
  const dailyQuests = quests.filter(q => q.type === 'daily');
  const weeklyQuests = quests.filter(q => q.type === 'weekly');

  const xpInLevel = totalXP % 500;
  const xpToNext = 500;

  const completedToday = dailyQuests.filter(q => q.progress.completed).length;
  const completedWeek = weeklyQuests.filter(q => q.progress.completed).length;
  const totalAvailableXP = quests.reduce((s, q) => s + q.xpReward, 0);
  const claimedXP = quests.filter(q => q.progress.claimedAt).reduce((s, q) => s + q.xpReward, 0);

  return (
    <div>
      <Breadcrumbs crumbs={[{ label: 'Quests' }]} />
      <RetroHeading level={1} color="gold" subtitle="Complete challenges, earn XP">
        DAILY QUESTS
      </RetroHeading>

      {/* Level + XP Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Level Card */}
        <div className="arcade-card p-5 text-center relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Level</div>
            <div
              className="text-4xl font-bold font-mono text-arcade-gold"
              style={{ textShadow: '0 0 12px rgba(255,215,0,0.4)' }}
            >
              {level}
            </div>
            <div className="mt-3">
              <ProgressBar value={(xpInLevel / xpToNext) * 100} color="gold" label={`${xpInLevel} / ${xpToNext} XP`} />
            </div>
            <div className="text-[9px] text-gray-600 mt-1">{totalXP} total XP</div>
          </div>
        </div>

        {/* Daily Progress */}
        <div className="arcade-card p-5 text-center">
          <Flame size={20} className="mx-auto mb-2 text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
          <div className="text-2xl font-bold font-mono text-white">{completedToday}/{dailyQuests.length}</div>
          <div className="text-[10px] text-gray-500 uppercase">Daily Complete</div>
          {completedToday === dailyQuests.length && dailyQuests.length > 0 && (
            <GlowBadge color="green" label="ALL DONE" className="mt-2" />
          )}
        </div>

        {/* Weekly Progress */}
        <div className="arcade-card p-5 text-center">
          <Star size={20} className="mx-auto mb-2 text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
          <div className="text-2xl font-bold font-mono text-white">{completedWeek}/{weeklyQuests.length}</div>
          <div className="text-[10px] text-gray-500 uppercase">Weekly Complete</div>
          <div className="text-[9px] text-gray-600 mt-1">{claimedXP}/{totalAvailableXP} XP claimed</div>
        </div>
      </div>

      {/* Daily Quests */}
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
        <Flame size={14} className="text-arcade-cyan" />
        Daily Missions
        <span className="text-[9px] text-gray-600 font-normal ml-2">Resets at midnight</span>
      </h2>

      <div className="space-y-3 mb-8">
        {dailyQuests.length === 0 ? (
          <div className="arcade-card p-8 text-center">
            <Clock size={32} className="mx-auto text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">Quests are loading...</p>
          </div>
        ) : (
          dailyQuests.map(quest => (
            <QuestCard key={quest.id} quest={quest} progress={quest.progress} onClaim={claimQuest} />
          ))
        )}
      </div>

      {/* Weekly Quests */}
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
        <Star size={14} className="text-arcade-purple" />
        Weekly Challenges
        <span className="text-[9px] text-gray-600 font-normal ml-2">Resets Monday</span>
      </h2>

      <div className="space-y-3">
        {weeklyQuests.length === 0 ? (
          <div className="arcade-card p-8 text-center">
            <Clock size={32} className="mx-auto text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">Weekly challenges are loading...</p>
          </div>
        ) : (
          weeklyQuests.map(quest => (
            <QuestCard key={quest.id} quest={quest} progress={quest.progress} onClaim={claimQuest} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Quest Card ──────────────────────────────────────────────────────────

function QuestCard({
  quest,
  progress,
  onClaim,
}: {
  quest: Quest;
  progress: QuestProgress;
  onClaim: (id: string) => void;
}) {
  const pct = quest.target > 0 ? (progress.current / quest.target) * 100 : 0;
  const isClaimed = !!progress.claimedAt;
  const isComplete = progress.completed;
  return (
    <div className={clsx(
      'arcade-card p-4 border transition-all',
      isClaimed ? 'border-arcade-green/20 opacity-60' :
      isComplete ? 'border-arcade-gold/30 shadow-lg shadow-arcade-gold/10' :
      'border-white/[0.04]'
    )}>
      <div className="flex items-center gap-4">
        {/* Icon */}
        <div className={clsx(
          'w-12 h-12 rounded-lg flex items-center justify-center text-2xl flex-shrink-0',
          isClaimed ? 'bg-arcade-green/10' :
          isComplete ? 'bg-arcade-gold/10' :
          'bg-surface-2'
        )}>
          {isClaimed ? <Check size={20} className="text-arcade-green" /> : quest.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('text-sm font-bold', isClaimed ? 'text-gray-500 line-through' : 'text-white')}>
              {quest.title}
            </span>
            <GlowBadge color={quest.type === 'daily' ? 'cyan' : 'purple'} label={quest.type === 'daily' ? 'DAILY' : 'WEEKLY'} />
          </div>
          <p className="text-xs text-gray-400 mb-2">{quest.description}</p>
          <div className="flex items-center gap-3">
            <ProgressBar
              value={pct}
              color={isClaimed ? 'green' : isComplete ? 'gold' : 'purple'}
              className="flex-1"
            />
            <span className="text-[10px] font-mono text-gray-500 w-12 text-right">
              {progress.current}/{quest.target}
            </span>
          </div>
        </div>

        {/* Reward + Claim */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-1">
            <Zap size={12} className="text-arcade-gold" />
            <span className="text-xs font-mono font-bold text-arcade-gold">{quest.xpReward} XP</span>
          </div>
          {isComplete && !isClaimed && (
            <NeonButton
              variant="neon"
              color="green"
              onClick={() => onClaim(quest.id)}
              className="text-[10px] px-3 py-1"
            >
              <span className="flex items-center gap-1">
                <Gift size={12} />
                CLAIM
              </span>
            </NeonButton>
          )}
          {isClaimed && (
            <span className="text-[9px] text-arcade-green uppercase">Claimed</span>
          )}
        </div>
      </div>
    </div>
  );
}
