import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Target,
  Flame,
  Clock,
  X,
  DollarSign,
  History,
  BarChart3,
  Percent,
  Radar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar as RechartsRadar,
} from 'recharts';
import { useBettingStore } from '@/stores/bettingStore';
import { timeAgo } from '@/utils/format';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { Breadcrumbs } from '@/components/arcade/Breadcrumbs';
import { CHART_COLORS, TOOLTIP_STYLE, AXIS_STYLE, GRID_STYLE } from '@/components/charts';
import { CopyButton } from '@/components/arcade/CopyButton';
import { truncateAddress } from '@/constants/ui';
import type { Bet, BettorProfile } from '@/types/arena';

// ── Status Maps ────────────────────────────────────────────────────────

const STATUS_LABELS: Record<number, string> = {
  0: 'Active',
  1: 'Won',
  2: 'Lost',
  3: 'Refunded',
};

const STATUS_COLORS_TEXT: Record<number, string> = {
  0: 'text-arcade-cyan',
  1: 'text-arcade-green',
  2: 'text-red-400',
  3: 'text-gray-400',
};

const STATUS_ICONS: Record<number, typeof Trophy> = {
  0: Clock,
  1: Trophy,
  2: X,
  3: DollarSign,
};

// ── Bet P/L Helpers ────────────────────────────────────────────────────

function getBetPL(bet: Bet): number {
  if (bet.status === 1) return parseFloat(bet.payout || '0') - parseFloat(bet.amount);
  if (bet.status === 2) return -parseFloat(bet.amount);
  return 0;
}

// ── Profile Hero Stats ─────────────────────────────────────────────────

function ProfileHero({ profile, address }: { profile: BettorProfile | null; address: string }) {
  if (!profile) {
    return (
      <div className="arcade-card p-8 text-center">
        <Target size={40} className="text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400">No betting profile found for this address</p>
        <p className="font-mono text-xs text-gray-600 mt-1">{address}</p>
      </div>
    );
  }

  const profit = parseFloat(profile.netProfit);
  const roi = parseFloat(profile.totalWagered) > 0
    ? (profit / parseFloat(profile.totalWagered)) * 100
    : 0;

  const tierLabel =
    profile.winRate >= 65 && profile.totalBets >= 20
      ? 'SHARK'
      : profile.winRate >= 50 && profile.totalBets >= 10
        ? 'REGULAR'
        : 'FISH';
  const tierColor =
    tierLabel === 'SHARK'
      ? 'text-arcade-gold'
      : tierLabel === 'REGULAR'
        ? 'text-arcade-cyan'
        : 'text-arcade-pink';

  return (
    <div className="arcade-card p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-lg text-white">{truncateAddress(address)}</h2>
            <CopyButton text={address} label="Address copied" />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className={clsx('font-pixel text-xs', tierColor)} style={{ textShadow: tierLabel === 'SHARK' ? '0 0 6px rgba(255,215,0,0.3)' : undefined }}>{tierLabel}</span>
            {profile.currentStreak !== 0 && (
              <span
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold',
                  profile.currentStreak > 0
                    ? 'bg-arcade-green/15 text-arcade-green'
                    : 'bg-red-500/15 text-red-400',
                )}
              >
                {profile.currentStreak > 0 && <Flame size={10} />}
                {profile.currentStreak > 0
                  ? `${profile.currentStreak}W streak`
                  : `${Math.abs(profile.currentStreak)}L streak`}
              </span>
            )}
          </div>
        </div>
        <div
          className={clsx(
            'text-right',
            profit >= 0 ? 'text-arcade-green' : 'text-red-400',
          )}
        >
          <div
            className="flex items-center gap-1 text-2xl font-mono font-bold"
            style={{ textShadow: profit >= 0 ? '0 0 8px rgba(105,240,174,0.3)' : '0 0 8px rgba(248,113,113,0.3)' }}
          >
            {profit >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
            {profit >= 0 ? '+' : ''}
            {profit.toFixed(4)} ETH
          </div>
          <div className="text-xs opacity-70">Net Profit/Loss</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Bets" value={profile.totalBets} icon={History} color="text-arcade-purple" />
        <StatCard label="Wins" value={profile.wins} icon={Trophy} color="text-arcade-green" />
        <StatCard label="Losses" value={profile.losses} icon={X} color="text-red-400" />
        <StatCard
          label="Win Rate"
          value={`${profile.winRate.toFixed(1)}%`}
          icon={Percent}
          color={profile.winRate >= 50 ? 'text-arcade-green' : 'text-red-400'}
        />
        <StatCard label="Wagered" value={`${parseFloat(profile.totalWagered).toFixed(2)}`} icon={DollarSign} color="text-arcade-gold" />
        <StatCard
          label="ROI"
          value={`${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`}
          icon={BarChart3}
          color={roi >= 0 ? 'text-arcade-green' : 'text-red-400'}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof Trophy;
  color: string;
}) {
  return (
    <div className="bg-surface-1 rounded-lg p-3 text-center transition-all duration-200 hover:scale-[1.03]">
      <Icon size={14} className={clsx(color, 'mx-auto mb-1.5')} style={{ filter: 'drop-shadow(0 0 3px currentColor)' }} />
      <div className="text-lg font-bold font-mono text-white">{value}</div>
      <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

// ── P/L Chart ──────────────────────────────────────────────────────────

function PLChart({ bets }: { bets: Bet[] }) {
  const data = useMemo(() => {
    const sorted = [...bets].sort((a, b) => a.timestamp - b.timestamp);
    let cumPL = 0;
    return sorted
      .filter((b) => b.status === 1 || b.status === 2)
      .map((b, idx) => {
        const pl = getBetPL(b);
        cumPL += pl;
        return {
          index: idx + 1,
          pl,
          cumPL: parseFloat(cumPL.toFixed(4)),
          matchId: b.matchId,
        };
      });
  }, [bets]);

  if (data.length < 2) {
    return (
      <div className="arcade-card p-6 text-center">
        <BarChart3 size={24} className="text-gray-600 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Need at least 2 settled bets for P/L chart</p>
      </div>
    );
  }

  return (
    <div className="arcade-card p-5">
      <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase mb-4 flex items-center gap-2">
        <TrendingUp size={14} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
        Cumulative P/L
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="index" {...AXIS_STYLE} />
          <YAxis {...AXIS_STYLE} tickFormatter={(v: number) => `${v}`} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown) => [`${Number(value).toFixed(4)} ETH`, 'Cumulative P/L']}
            labelFormatter={(label: unknown) => `Bet #${label}`}
          />
          <Bar dataKey="cumPL" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.cumPL >= 0 ? CHART_COLORS.green : CHART_COLORS.red}
                fillOpacity={0.8}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Outcome Distribution Pie ───────────────────────────────────────────

function OutcomeDistribution({ bets }: { bets: Bet[] }) {
  const data = useMemo(() => {
    const won = bets.filter((b) => b.status === 1).length;
    const lost = bets.filter((b) => b.status === 2).length;
    const active = bets.filter((b) => b.status === 0).length;
    const refunded = bets.filter((b) => b.status === 3).length;
    return [
      { name: 'Won', value: won, color: CHART_COLORS.green },
      { name: 'Lost', value: lost, color: CHART_COLORS.red },
      { name: 'Active', value: active, color: CHART_COLORS.cyan },
      { name: 'Refunded', value: refunded, color: CHART_COLORS.gray },
    ].filter((d) => d.value > 0);
  }, [bets]);

  if (data.length === 0) return null;

  return (
    <div className="arcade-card p-5">
      <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase mb-4 flex items-center gap-2">
        <Target size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
        Outcome Distribution
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={70}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown, name: unknown) => [String(value), String(name)]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="text-[10px] text-gray-400">
              {d.name} ({d.value})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bet History List ───────────────────────────────────────────────────

function BettorBetHistory({ bets }: { bets: Bet[] }) {
  const [statusFilter, setStatusFilter] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let list = [...bets].sort((a, b) => b.timestamp - a.timestamp);
    if (statusFilter !== null) {
      list = list.filter((b) => b.status === statusFilter);
    }
    return list;
  }, [bets, statusFilter]);

  return (
    <div className="arcade-card overflow-hidden">
      <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase flex items-center gap-2">
          <History size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
          Bet History
        </h3>
        <div className="flex items-center gap-1">
          <FilterBtn label="All" active={statusFilter === null} onClick={() => setStatusFilter(null)} />
          <FilterBtn label="Won" active={statusFilter === 1} onClick={() => setStatusFilter(1)} />
          <FilterBtn label="Lost" active={statusFilter === 2} onClick={() => setStatusFilter(2)} />
          <FilterBtn label="Active" active={statusFilter === 0} onClick={() => setStatusFilter(0)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-8 text-center">
          <History size={24} className="text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No bets found</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.03]">
          {filtered.slice(0, 50).map((bet) => {
            const StatusIcon = STATUS_ICONS[bet.status];
            const pl = getBetPL(bet);

            return (
              <div
                key={bet.id}
                className="px-4 py-3 flex items-center gap-4 hover:bg-surface-2 transition-colors"
              >
                <div className={clsx('flex-shrink-0', STATUS_COLORS_TEXT[bet.status])}>
                  <StatusIcon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/match/${bet.matchId}`}
                      className="text-sm text-white hover:text-arcade-cyan transition-colors"
                    >
                      Match #{bet.matchId}
                    </Link>
                    <span
                      className={clsx(
                        'text-[9px] px-1.5 py-0.5 rounded-full font-semibold',
                        bet.status === 0 && 'bg-arcade-cyan/20 text-arcade-cyan',
                        bet.status === 1 && 'bg-arcade-green/20 text-arcade-green',
                        bet.status === 2 && 'bg-red-500/20 text-red-400',
                        bet.status === 3 && 'bg-gray-500/20 text-gray-400',
                      )}
                    >
                      {STATUS_LABELS[bet.status]}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Predicted {truncateAddress(bet.predictedWinner)} @ {parseFloat(bet.odds).toFixed(2)}x
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-mono text-sm text-arcade-gold">
                    {parseFloat(bet.amount).toFixed(4)} ETH
                  </div>
                  {(bet.status === 1 || bet.status === 2) && (
                    <div
                      className={clsx(
                        'text-[10px] font-mono',
                        pl >= 0 ? 'text-arcade-green' : 'text-red-400',
                      )}
                    >
                      {pl >= 0 ? '+' : ''}
                      {pl.toFixed(4)}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-gray-600 flex-shrink-0 w-20 text-right" title={new Date(bet.timestamp).toLocaleString()}>
                  {timeAgo(bet.timestamp)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1 text-[10px] font-semibold uppercase rounded-md transition-colors',
        active ? 'bg-arcade-purple/20 text-arcade-purple' : 'text-gray-500 hover:text-gray-300',
      )}
    >
      {label}
    </button>
  );
}

// ── Bettor Skill Radar ────────────────────────────────────────────────

function BettorRadar({ profile, bets }: { profile: BettorProfile; bets: Bet[] }) {
  const data = useMemo(() => {
    const settled = bets.filter(b => b.status === 1 || b.status === 2);
    if (settled.length === 0) return [];

    // Dimension 1: Win Rate (raw %)
    const winRateScore = Math.min(100, profile.winRate);

    // Dimension 2: ROI — (netProfit / totalWagered) scaled 0-100
    const wagered = parseFloat(profile.totalWagered);
    const profit = parseFloat(profile.netProfit);
    const roi = wagered > 0 ? (profit / wagered) * 100 : 0;
    const roiScore = Math.min(100, Math.max(0, roi + 50)); // shift so 0% roi = 50

    // Dimension 3: Volume — log scale of total bets
    const volumeScore = Math.min(100, (Math.log10(Math.max(1, profile.totalBets)) / Math.log10(200)) * 100);

    // Dimension 4: Streak Power — best streak / 20 × 100
    const streakScore = Math.min(100, (profile.longestWinStreak / 15) * 100);

    // Dimension 5: Consistency — low variance = high score
    const pls = settled.map(b => getBetPL(b));
    const avgPL = pls.reduce((s, v) => s + v, 0) / pls.length;
    const variance = pls.reduce((s, v) => s + (v - avgPL) ** 2, 0) / pls.length;
    const stdDev = Math.sqrt(variance);
    const consistencyScore = Math.min(100, Math.max(0, 100 - stdDev * 500));

    // Dimension 6: Odds Mastery — average odds on winning bets (higher = better reads)
    const wonBets = bets.filter(b => b.status === 1);
    const avgWinOdds = wonBets.length > 0
      ? wonBets.reduce((s, b) => s + parseFloat(b.odds), 0) / wonBets.length
      : 1;
    const oddsMasteryScore = Math.min(100, ((avgWinOdds - 1) / 4) * 100);

    return [
      { dimension: 'Win Rate', value: Math.round(winRateScore), fullMark: 100 },
      { dimension: 'ROI', value: Math.round(roiScore), fullMark: 100 },
      { dimension: 'Volume', value: Math.round(volumeScore), fullMark: 100 },
      { dimension: 'Streak', value: Math.round(streakScore), fullMark: 100 },
      { dimension: 'Consistency', value: Math.round(consistencyScore), fullMark: 100 },
      { dimension: 'Odds Read', value: Math.round(oddsMasteryScore), fullMark: 100 },
    ];
  }, [profile, bets]);

  if (data.length === 0) return null;

  const overallScore = Math.round(data.reduce((s, d) => s + d.value, 0) / data.length);

  return (
    <div className="arcade-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase flex items-center gap-2">
          <Radar size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
          Bettor Skill Profile
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 uppercase">Power</span>
          <span className={clsx(
            'font-mono text-sm font-bold',
            overallScore >= 60 ? 'text-arcade-green' :
            overallScore >= 35 ? 'text-arcade-gold' :
            'text-red-400',
          )}>
            {overallScore}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#333" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: '#888', fontSize: 10 }} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown) => [`${value}/100`, 'Score']}
          />
          <RechartsRadar
            name="Skill"
            dataKey="value"
            stroke={CHART_COLORS.purple}
            fill={CHART_COLORS.purple}
            fillOpacity={0.25}
            strokeWidth={2}
          />
        </RadarChart>
      </ResponsiveContainer>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {data.map(d => (
          <div key={d.dimension} className="text-center">
            <div className="text-[9px] text-gray-500 uppercase">{d.dimension}</div>
            <div className={clsx(
              'text-xs font-mono font-bold',
              d.value >= 60 ? 'text-arcade-green' :
              d.value >= 35 ? 'text-arcade-gold' :
              'text-red-400',
            )}>
              {d.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ROI Trend Line ────────────────────────────────────────────────────

function ROITrendChart({ bets }: { bets: Bet[] }) {
  const data = useMemo(() => {
    const settled = [...bets]
      .filter(b => b.status === 1 || b.status === 2)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (settled.length < 3) return [];

    let totalWagered = 0;
    let totalPL = 0;
    return settled.map((b, idx) => {
      const pl = getBetPL(b);
      totalPL += pl;
      totalWagered += parseFloat(b.amount);
      const roi = totalWagered > 0 ? (totalPL / totalWagered) * 100 : 0;
      return {
        index: idx + 1,
        roi: parseFloat(roi.toFixed(2)),
      };
    });
  }, [bets]);

  if (data.length < 3) return null;

  const currentROI = data[data.length - 1]?.roi ?? 0;

  return (
    <div className="arcade-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-300 tracking-wider uppercase flex items-center gap-2">
          <Percent size={14} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
          ROI Trend
        </h3>
        <span className={clsx(
          'font-mono text-sm font-bold',
          currentROI >= 0 ? 'text-arcade-green' : 'text-red-400',
        )}>
          {currentROI >= 0 ? '+' : ''}{currentROI.toFixed(1)}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
          <CartesianGrid {...GRID_STYLE} />
          <XAxis dataKey="index" {...AXIS_STYLE} tickFormatter={(v: unknown) => `#${v}`} />
          <YAxis {...AXIS_STYLE} tickFormatter={(v: unknown) => `${v}%`} />
          <Tooltip
            {...TOOLTIP_STYLE}
            formatter={(value: unknown) => [`${Number(value).toFixed(2)}%`, 'ROI']}
            labelFormatter={(label: unknown) => `After bet #${label}`}
          />
          {/* Zero reference line */}
          <Line
            type="monotone"
            dataKey={() => 0}
            stroke="#555"
            strokeDasharray="4 4"
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="roi"
            stroke={currentROI >= 0 ? CHART_COLORS.green : CHART_COLORS.red}
            strokeWidth={2}
            dot={false}
            animationDuration={800}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────

export function BettorProfilePage() {
  const { address } = useParams<{ address: string }>();
  const fetchMyProfile = useBettingStore((s) => s.fetchMyProfile);
  const fetchMyBets = useBettingStore((s) => s.fetchMyBets);
  const myBettorProfile = useBettingStore((s) => s.myBettorProfile);
  const userBets = useBettingStore((s) => s.userBets);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    Promise.all([fetchMyProfile(address), fetchMyBets(address)]).finally(() => setLoading(false));
  }, [address, fetchMyProfile, fetchMyBets]);

  if (!address) {
    return (
      <div className="arcade-card p-12 text-center">
        <p className="text-gray-400">No address provided</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Breadcrumbs crumbs={[
          { label: 'Spectator', to: '/spectator/leaderboard' },
          { label: truncateAddress(address) },
        ]} />
        <div className="animate-pulse space-y-6">
          {/* Heading skeleton */}
          <div className="h-8 bg-surface-1 rounded-lg w-1/3" />
          {/* Hero stats skeleton */}
          <div className="arcade-card p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-surface-2 rounded-full" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-surface-2 rounded w-1/4" />
                <div className="h-3 bg-surface-2 rounded w-1/3" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-surface-2 rounded-lg p-3 space-y-2">
                  <div className="h-3 bg-surface-3 rounded w-1/2 mx-auto" />
                  <div className="h-6 bg-surface-3 rounded w-2/3 mx-auto" />
                </div>
              ))}
            </div>
          </div>
          {/* Charts skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 arcade-card p-4">
              <div className="h-4 bg-surface-2 rounded w-1/4 mb-4" />
              <div className="h-48 bg-surface-2 rounded" />
            </div>
            <div className="arcade-card p-4">
              <div className="h-4 bg-surface-2 rounded w-1/3 mb-4" />
              <div className="h-48 bg-surface-2 rounded-full w-32 mx-auto" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[
        { label: 'Spectator', to: '/spectator/leaderboard' },
        { label: truncateAddress(address) },
      ]} />

      {/* Page heading */}
      <RetroHeading color="gold" subtitle="Betting performance and history">
        BETTOR PROFILE
      </RetroHeading>

      {/* Hero stats */}
      <ProfileHero profile={myBettorProfile} address={address} />

      {/* Charts row */}
      {userBets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <PLChart bets={userBets} />
          </div>
          <OutcomeDistribution bets={userBets} />
        </div>
      )}

      {/* Bettor Radar + ROI Trend */}
      {userBets.length > 0 && myBettorProfile && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BettorRadar profile={myBettorProfile} bets={userBets} />
          <ROITrendChart bets={userBets} />
        </div>
      )}

      {/* Best/Worst bets highlight */}
      {userBets.length > 0 && <HighlightBets bets={userBets} />}

      {/* Full history */}
      <BettorBetHistory bets={userBets} />
    </div>
  );
}

// ── Best/Worst Bets ────────────────────────────────────────────────────

function HighlightBets({ bets }: { bets: Bet[] }) {
  const settled = bets.filter((b) => b.status === 1 || b.status === 2);
  if (settled.length === 0) return null;

  const sorted = [...settled].sort((a, b) => getBetPL(b) - getBetPL(a));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  if (!best || !worst) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <HighlightCard bet={best} label="Best Bet" icon={Trophy} color="arcade-green" />
      <HighlightCard bet={worst} label="Worst Bet" icon={TrendingDown} color="red-400" />
    </div>
  );
}

function HighlightCard({
  bet,
  label,
  icon: Icon,
  color,
}: {
  bet: Bet;
  label: string;
  icon: typeof Trophy;
  color: string;
}) {
  const pl = getBetPL(bet);

  return (
    <div className="arcade-card p-4 transition-all duration-200 hover:scale-[1.02]">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className={`text-${color}`} style={{ filter: 'drop-shadow(0 0 3px currentColor)' }} />
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Link
            to={`/match/${bet.matchId}`}
            className="text-sm text-white hover:text-arcade-cyan transition-colors"
          >
            Match #{bet.matchId}
          </Link>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {parseFloat(bet.amount).toFixed(4)} ETH @ {parseFloat(bet.odds).toFixed(2)}x
          </div>
        </div>
        <span
          className={clsx(
            'font-mono text-lg font-bold',
            pl >= 0 ? 'text-arcade-green' : 'text-red-400',
          )}
          style={{ textShadow: pl >= 0 ? '0 0 6px rgba(105,240,174,0.3)' : '0 0 6px rgba(248,113,113,0.3)' }}
        >
          {pl >= 0 ? '+' : ''}
          {pl.toFixed(4)}
        </span>
      </div>
    </div>
  );
}
