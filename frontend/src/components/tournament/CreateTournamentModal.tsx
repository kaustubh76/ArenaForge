import { useState, useMemo } from 'react';
import { Loader2, AlertCircle, Coins, Users, Layers, Swords, Trophy, Clock, Zap, Lock, Globe, Save, FolderOpen } from 'lucide-react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { GameType, TournamentFormat } from '@/types/arena';
import { GAME_TYPE_CONFIG, FORMAT_LABELS } from '@/constants/game';
import { useWallet } from '@/hooks/useWallet';
import { ArcadeModal } from '@/components/arcade/ArcadeModal';
import { NeonButton } from '@/components/arcade/NeonButton';
import { GameTypeIcon } from '@/components/arcade/GameTypeIcon';
import clsx from 'clsx';

export interface CreateTournamentInput {
  name: string;
  gameType: GameType;
  format: TournamentFormat;
  entryStake: string;
  maxParticipants: number;
  roundCount: number;
  isPrivate?: boolean;
  accessCode?: string;
}

// Tournament template saved to localStorage
interface TournamentTemplate {
  id: string;
  label: string;
  gameType: GameType;
  format: TournamentFormat;
  entryStake: string;
  maxParticipants: number;
  roundCount: number;
}

const TEMPLATES_KEY = 'arenaforge-tournament-templates';

interface CreateTournamentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTournamentInput) => Promise<void>;
}

const PARTICIPANT_OPTIONS = [4, 8, 16, 32];
const ROUND_OPTIONS = [3, 5, 7, 10];
const STAKE_OPTIONS = ['0.1', '1', '5', '10', '50'];

const gameTypes = [
  GameType.OracleDuel,
  GameType.StrategyArena,
  GameType.AuctionWars,
  GameType.QuizBowl,
];

const formats = [
  TournamentFormat.SwissSystem,
  TournamentFormat.SingleElimination,
  TournamentFormat.DoubleElimination,
  TournamentFormat.RoundRobin,
  TournamentFormat.BestOfN,
  TournamentFormat.RoyalRumble,
];

export function CreateTournamentModal({ open, onClose, onSubmit }: CreateTournamentModalProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [gameType, setGameType] = useState<GameType>(GameType.StrategyArena);
  const [format, setFormat] = useState<TournamentFormat>(TournamentFormat.SingleElimination);
  const [entryStake, setEntryStake] = useState('1');
  const [customStake, setCustomStake] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [roundCount, setRoundCount] = useState(5);
  const [isPrivate, setIsPrivate] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tournament templates
  const [templates, setTemplates] = useState<TournamentTemplate[]>(() => {
    try {
      const stored = localStorage.getItem(TEMPLATES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const { isConnected, isCorrectChain } = useWallet();
  const { openConnectModal } = useConnectModal();

  const effectiveStake = customStake || entryStake;
  const stakeNum = parseFloat(effectiveStake);
  const prizePool = (stakeNum * maxParticipants * 0.95).toFixed(2);

  const canProceed = () => {
    if (step === 0) return name.trim().length >= 3;
    if (step === 1) return true; // game type always selected
    if (step === 2) return true; // format always selected
    if (step === 3) return stakeNum > 0 && maxParticipants >= 4;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        gameType,
        format,
        entryStake: effectiveStake,
        maxParticipants,
        roundCount,
        isPrivate,
        accessCode: isPrivate ? accessCode : undefined,
      });
      // Reset form
      setStep(0);
      setName('');
      setGameType(GameType.StrategyArena);
      setFormat(TournamentFormat.SingleElimination);
      setEntryStake('1');
      setCustomStake('');
      setMaxParticipants(8);
      setRoundCount(5);
      setIsPrivate(false);
      setAccessCode('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setError(null);
    onClose();
  };

  return (
    <ArcadeModal open={open} title="CREATE TOURNAMENT" onClose={handleClose}>
      <div className="space-y-6">
        {/* Progress indicators */}
        <div className="flex items-center gap-1">
          {['NAME', 'GAME', 'FORMAT', 'CONFIG', 'REVIEW'].map((label, i) => (
            <div key={label} className="flex-1">
              <div
                className={clsx(
                  'h-1 rounded-full transition-all duration-300',
                  i <= step ? 'bg-arcade-purple' : 'bg-surface-1'
                )}
                style={i === step ? { boxShadow: '0 0 6px rgba(168,85,247,0.4)' } : undefined}
              />
              <span className={clsx(
                'text-[8px] mt-1 block text-center',
                i <= step ? 'text-arcade-purple' : 'text-gray-600'
              )}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Step 0: Name */}
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Tournament Name</h3>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter tournament name..."
              maxLength={48}
              className="w-full px-4 py-3 rounded-lg bg-surface-1 border border-white/[0.08] text-white text-sm placeholder-gray-500 focus:border-arcade-purple/50 focus:outline-none transition-colors"
              autoFocus
            />
            <p className="text-[10px] text-gray-500">{name.length}/48 characters</p>

            {/* Templates */}
            {templates.length > 0 && (
              <div>
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-arcade-cyan transition-colors"
                >
                  <FolderOpen size={12} />
                  {showTemplates ? 'HIDE TEMPLATES' : `LOAD TEMPLATE (${templates.length})`}
                </button>
                {showTemplates && (
                  <div className="mt-2 space-y-1.5">
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setGameType(t.gameType);
                          setFormat(t.format);
                          setEntryStake(t.entryStake);
                          setMaxParticipants(t.maxParticipants);
                          setRoundCount(t.roundCount);
                          setShowTemplates(false);
                        }}
                        className="w-full flex items-center justify-between p-2 rounded-lg bg-surface-1 border border-white/[0.06] hover:border-arcade-cyan/30 transition-all text-left group"
                      >
                        <div>
                          <span className="text-xs font-bold text-white">{t.label}</span>
                          <span className="text-[9px] text-gray-500 ml-2">
                            {GAME_TYPE_CONFIG[t.gameType]?.arcadeLabel} &middot; {FORMAT_LABELS[t.format]} &middot; {t.entryStake} MON
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const updated = templates.filter(x => x.id !== t.id);
                            setTemplates(updated);
                            localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
                          }}
                          className="text-gray-600 hover:text-arcade-red transition-colors text-xs opacity-0 group-hover:opacity-100"
                          title="Delete template"
                        >
                          &times;
                        </button>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 1: Game Type */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Game Type</h3>
            <div className="grid grid-cols-2 gap-3">
              {gameTypes.map(gt => {
                const cfg = GAME_TYPE_CONFIG[gt];
                const selected = gameType === gt;
                return (
                  <button
                    key={gt}
                    onClick={() => setGameType(gt)}
                    className={clsx(
                      'p-4 rounded-lg border-2 transition-all text-left duration-200 hover:scale-[1.03]',
                      selected
                        ? 'border-arcade-purple bg-arcade-purple/10'
                        : 'border-white/[0.08] bg-surface-1 hover:border-white/[0.16]'
                    )}
                    style={selected ? { boxShadow: '0 0 12px rgba(168,85,247,0.15)' } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <GameTypeIcon gameType={gt} size={16} />
                      <span className="font-pixel text-[9px] text-white">{cfg.arcadeLabel}</span>
                    </div>
                    <p className="text-[10px] text-gray-400">{cfg.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 2: Format */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Tournament Format</h3>
            <div className="grid grid-cols-2 gap-3">
              {formats.map(f => {
                const selected = format === f;
                return (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={clsx(
                      'p-3 rounded-lg border-2 transition-all text-left duration-200 hover:scale-[1.03]',
                      selected
                        ? 'border-arcade-cyan bg-arcade-cyan/10'
                        : 'border-white/[0.08] bg-surface-1 hover:border-white/[0.16]'
                    )}
                    style={selected ? { boxShadow: '0 0 12px rgba(0,229,255,0.15)' } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Layers size={12} className={selected ? 'text-arcade-cyan' : 'text-gray-400'} />
                      <span className={clsx('text-xs font-bold', selected ? 'text-arcade-cyan' : 'text-white')}>
                        {FORMAT_LABELS[f]}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Configuration */}
        {step === 3 && (
          <div className="space-y-5">
            <h3 className="text-sm font-bold text-white">Configuration</h3>

            {/* Entry Stake */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block flex items-center gap-1">
                <Coins size={12} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
                Entry Stake (MON)
              </label>
              <div className="flex flex-wrap gap-2">
                {STAKE_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => { setEntryStake(s); setCustomStake(''); }}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-xs font-mono border transition-all',
                      entryStake === s && !customStake
                        ? 'bg-arcade-gold/15 text-arcade-gold border-arcade-gold/40'
                        : 'text-gray-400 border-white/[0.06] hover:border-white/[0.12]'
                    )}
                  >
                    {s}
                  </button>
                ))}
                <input
                  type="number"
                  value={customStake}
                  onChange={e => setCustomStake(e.target.value)}
                  placeholder="Custom"
                  min="0.01"
                  step="0.01"
                  className="w-20 px-2 py-1.5 rounded-lg bg-surface-1 border border-white/[0.08] text-white text-xs font-mono placeholder-gray-500 focus:border-arcade-gold/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Max Participants */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block flex items-center gap-1">
                <Users size={12} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
                Max Participants
              </label>
              <div className="flex gap-2">
                {PARTICIPANT_OPTIONS.map(p => (
                  <button
                    key={p}
                    onClick={() => setMaxParticipants(p)}
                    className={clsx(
                      'px-4 py-2 rounded-lg text-sm font-mono border transition-all',
                      maxParticipants === p
                        ? 'bg-arcade-cyan/15 text-arcade-cyan border-arcade-cyan/40'
                        : 'text-gray-400 border-white/[0.06] hover:border-white/[0.12]'
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Round Count */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block flex items-center gap-1">
                <Swords size={12} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
                Rounds
              </label>
              <div className="flex gap-2">
                {ROUND_OPTIONS.map(r => (
                  <button
                    key={r}
                    onClick={() => setRoundCount(r)}
                    className={clsx(
                      'px-4 py-2 rounded-lg text-sm font-mono border transition-all',
                      roundCount === r
                        ? 'bg-arcade-purple/15 text-arcade-purple border-arcade-purple/40'
                        : 'text-gray-400 border-white/[0.06] hover:border-white/[0.12]'
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy Toggle */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block flex items-center gap-1">
                <Lock size={12} className="text-arcade-pink" style={{ filter: 'drop-shadow(0 0 3px rgba(255,64,129,0.4))' }} />
                Tournament Access
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setIsPrivate(false); setAccessCode(''); }}
                  className={clsx(
                    'flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all',
                    !isPrivate
                      ? 'bg-arcade-green/15 text-arcade-green border-arcade-green/40'
                      : 'text-gray-400 border-white/[0.06] hover:border-white/[0.12]'
                  )}
                >
                  <Globe size={14} />
                  PUBLIC
                </button>
                <button
                  onClick={() => setIsPrivate(true)}
                  className={clsx(
                    'flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all',
                    isPrivate
                      ? 'bg-arcade-pink/15 text-arcade-pink border-arcade-pink/40'
                      : 'text-gray-400 border-white/[0.06] hover:border-white/[0.12]'
                  )}
                >
                  <Lock size={14} />
                  PRIVATE
                </button>
              </div>
              {isPrivate && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={accessCode}
                    onChange={e => setAccessCode(e.target.value.toUpperCase())}
                    placeholder="ACCESS CODE (optional)"
                    maxLength={12}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-white/[0.08] text-white text-xs font-mono placeholder-gray-600 focus:border-arcade-pink/50 focus:outline-none uppercase tracking-widest"
                  />
                  <p className="text-[9px] text-gray-600 mt-1">
                    Share this code with invited participants. Leave empty for invite-link only.
                  </p>
                </div>
              )}
            </div>

            {/* Prize pool estimate */}
            <div className="p-3 rounded-lg bg-surface-1 border border-white/[0.04]">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Estimated Prize Pool</span>
                <div className="flex items-center gap-1">
                  <Trophy size={12} className="text-arcade-gold" />
                  <span className="font-mono text-sm font-bold text-arcade-gold" style={{ textShadow: '0 0 8px rgba(255,215,0,0.3)' }}>{prizePool} MON</span>
                </div>
              </div>
              <p className="text-[9px] text-gray-600 mt-1">
                {maxParticipants} players × {effectiveStake} MON - 5% fee
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Review Tournament</h3>

            <div className="space-y-3">
              <ReviewRow label="Name" value={name} />
              <ReviewRow label="Game Type" value={GAME_TYPE_CONFIG[gameType].arcadeLabel} />
              <ReviewRow label="Format" value={FORMAT_LABELS[format]} />
              <ReviewRow label="Entry Stake" value={`${effectiveStake} MON`} />
              <ReviewRow label="Max Players" value={String(maxParticipants)} />
              <ReviewRow label="Rounds" value={String(roundCount)} />
              <ReviewRow label="Access" value={isPrivate ? `PRIVATE${accessCode ? ` (${accessCode})` : ''}` : 'PUBLIC'} />
              <ReviewRow label="Prize Pool" value={`~${prizePool} MON`} highlight />
            </div>

            {/* Tournament Blueprint Preview */}
            <TournamentBlueprint
              format={format}
              maxParticipants={maxParticipants}
              roundCount={roundCount}
              prizePool={prizePool}
            />

            {/* Save as Template */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="Template name..."
                maxLength={24}
                className="flex-1 px-3 py-2 rounded-lg bg-surface-1 border border-white/[0.08] text-white text-xs placeholder-gray-600 focus:border-arcade-cyan/50 focus:outline-none"
              />
              <button
                onClick={() => {
                  const label = templateName.trim() || `${GAME_TYPE_CONFIG[gameType]?.arcadeLabel} ${FORMAT_LABELS[format]}`;
                  const newTemplate: TournamentTemplate = {
                    id: Date.now().toString(36),
                    label,
                    gameType,
                    format,
                    entryStake: effectiveStake,
                    maxParticipants,
                    roundCount,
                  };
                  const updated = [...templates, newTemplate];
                  setTemplates(updated);
                  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(updated));
                  setTemplateName('');
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-1 border border-white/[0.06] hover:border-arcade-cyan/30 text-xs text-gray-400 hover:text-arcade-cyan transition-all"
              >
                <Save size={12} />
                SAVE TEMPLATE
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-arcade-red/10 border border-arcade-red/30 rounded-lg">
            <AlertCircle size={16} className="text-arcade-red flex-shrink-0" />
            <span className="text-xs text-arcade-red">{error}</span>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <NeonButton
              variant="neon"
              color="purple"
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
            >
              NEXT
            </NeonButton>
          ) : !isConnected ? (
            <NeonButton variant="neon" color="purple" onClick={() => openConnectModal?.()}>
              CONNECT WALLET
            </NeonButton>
          ) : !isCorrectChain ? (
            <NeonButton variant="secondary" disabled>
              SWITCH NETWORK
            </NeonButton>
          ) : (
            <NeonButton
              variant="insert-coin"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  CREATING...
                </span>
              ) : (
                'CREATE TOURNAMENT'
              )}
            </NeonButton>
          )}
        </div>
      </div>
    </ArcadeModal>
  );
}

// ---------------------------------------------------------------------------
// Tournament Blueprint — bracket flow + prize bars + match stats
// ---------------------------------------------------------------------------
function TournamentBlueprint({ format, maxParticipants, roundCount, prizePool }: {
  format: TournamentFormat;
  maxParticipants: number;
  roundCount: number;
  prizePool: string;
}) {
  const blueprint = useMemo(() => {
    // Calculate bracket flow based on format
    let flow: number[] = [];
    let totalMatches = 0;

    switch (format) {
      case TournamentFormat.SingleElimination: {
        let n = maxParticipants;
        while (n > 1) { flow.push(n); totalMatches += Math.floor(n / 2); n = Math.ceil(n / 2); }
        flow.push(1);
        break;
      }
      case TournamentFormat.DoubleElimination: {
        let n = maxParticipants;
        while (n > 1) { flow.push(n); totalMatches += Math.floor(n / 2); n = Math.ceil(n / 2); }
        flow.push(1);
        totalMatches = Math.floor(totalMatches * 1.8); // losers bracket adds ~80% more
        break;
      }
      case TournamentFormat.SwissSystem:
        for (let i = 0; i < roundCount; i++) flow.push(maxParticipants);
        flow.push(1);
        totalMatches = Math.floor(maxParticipants / 2) * roundCount;
        break;
      case TournamentFormat.RoundRobin:
        flow = [maxParticipants, Math.floor(maxParticipants * (maxParticipants - 1) / 2), 1];
        totalMatches = Math.floor(maxParticipants * (maxParticipants - 1) / 2);
        break;
      case TournamentFormat.BestOfN:
        for (let i = 0; i < roundCount; i++) flow.push(2);
        flow.push(1);
        totalMatches = roundCount;
        break;
      case TournamentFormat.RoyalRumble: {
        let n = maxParticipants;
        while (n > 1) { flow.push(n); n = Math.max(Math.ceil(n * 0.6), 1); totalMatches += Math.floor(n / 2) + 1; }
        if (flow[flow.length - 1] !== 1) flow.push(1);
        break;
      }
      default:
        for (let i = 0; i < roundCount; i++) flow.push(maxParticipants);
        flow.push(1);
        totalMatches = Math.floor(maxParticipants / 2) * roundCount;
    }

    const estDuration = totalMatches * 5; // ~5 min per match
    const matchesPerRound = totalMatches > 0 && flow.length > 1 ? Math.ceil(totalMatches / (flow.length - 1)) : 0;
    const pool = parseFloat(prizePool);

    return { flow, totalMatches, estDuration, matchesPerRound, pool };
  }, [format, maxParticipants, roundCount, prizePool]);

  const svgW = 280;
  const svgH = 48;
  const nodeR = 12;
  const padX = 20;

  return (
    <div className="space-y-3">
      {/* Bracket Flow */}
      <div className="rounded-lg bg-surface-1 border border-white/[0.04] p-3">
        <span className="text-[9px] font-pixel text-gray-500 tracking-wider block mb-2">BRACKET FLOW</span>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
          <defs>
            <filter id="nodeGlow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {blueprint.flow.map((count, i) => {
            const x = padX + (i / Math.max(blueprint.flow.length - 1, 1)) * (svgW - padX * 2);
            const y = svgH / 2;
            const isLast = i === blueprint.flow.length - 1;
            const nextX = i < blueprint.flow.length - 1
              ? padX + ((i + 1) / Math.max(blueprint.flow.length - 1, 1)) * (svgW - padX * 2)
              : 0;

            return (
              <g key={i}>
                {/* Connecting line */}
                {i < blueprint.flow.length - 1 && (
                  <line
                    x1={x + nodeR} y1={y}
                    x2={nextX - nodeR} y2={y}
                    stroke={isLast ? '#ffd740' : '#b388ff'}
                    strokeWidth={1.5}
                    strokeDasharray={format === TournamentFormat.SwissSystem ? '4 2' : 'none'}
                  />
                )}
                {/* Node circle */}
                <circle
                  cx={x} cy={y} r={nodeR}
                  fill={isLast ? 'rgba(255,215,64,0.15)' : 'rgba(0,229,255,0.1)'}
                  stroke={isLast ? '#ffd740' : '#00e5ff'}
                  strokeWidth={1.5}
                  filter="url(#nodeGlow)"
                />
                {/* Count text */}
                <text
                  x={x} y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isLast ? '#ffd740' : '#e0e0e0'}
                  fontSize={count >= 100 ? 7 : 9}
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {isLast ? '🏆' : count}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Prize Distribution + Stats */}
      <div className="grid grid-cols-2 gap-3">
        {/* Prize Bars */}
        <div className="rounded-lg bg-surface-1 border border-white/[0.04] p-3">
          <span className="text-[9px] font-pixel text-gray-500 tracking-wider block mb-2">PRIZES</span>
          <div className="space-y-1.5">
            {[
              { place: '1st', pct: 60, color: '#ffd740' },
              { place: '2nd', pct: 25, color: '#bdbdbd' },
              { place: '3rd', pct: 15, color: '#ffab40' },
            ].map(p => (
              <div key={p.place} className="flex items-center gap-2">
                <span className="text-[9px] text-gray-400 w-6">{p.place}</span>
                <div className="flex-1 h-2 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${p.pct}%`, backgroundColor: p.color, opacity: 0.7 }}
                  />
                </div>
                <span className="text-[9px] font-mono text-gray-300 w-14 text-right">
                  {(blueprint.pool * p.pct / 100).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Match Stats */}
        <div className="rounded-lg bg-surface-1 border border-white/[0.04] p-3">
          <span className="text-[9px] font-pixel text-gray-500 tracking-wider block mb-2">STATS</span>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Swords size={10} className="text-arcade-cyan" style={{ filter: 'drop-shadow(0 0 3px rgba(0,229,255,0.4))' }} />
              <span className="text-[10px] text-gray-400">Matches</span>
              <span className="text-[10px] font-mono font-bold text-white ml-auto">{blueprint.totalMatches}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={10} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
              <span className="text-[10px] text-gray-400">Est. Time</span>
              <span className="text-[10px] font-mono font-bold text-white ml-auto">
                {blueprint.estDuration >= 60 ? `${Math.floor(blueprint.estDuration / 60)}h ${blueprint.estDuration % 60}m` : `${blueprint.estDuration}m`}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap size={10} className="text-arcade-gold" style={{ filter: 'drop-shadow(0 0 3px rgba(255,215,0,0.4))' }} />
              <span className="text-[10px] text-gray-400">Per Round</span>
              <span className="text-[10px] font-mono font-bold text-white ml-auto">{blueprint.matchesPerRound}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 bg-surface-1 rounded-lg transition-all duration-200 hover:bg-surface-2">
      <span className="text-xs text-gray-400">{label}</span>
      <span
        className={clsx(
          'text-sm font-mono',
          highlight ? 'text-arcade-gold font-bold' : 'text-white'
        )}
        style={highlight ? { textShadow: '0 0 8px rgba(255,215,0,0.3)' } : undefined}
      >
        {value}
      </span>
    </div>
  );
}
