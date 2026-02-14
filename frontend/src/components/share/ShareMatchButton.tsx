import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { GAME_TYPE_CONFIG } from '@/constants/game';
import { GameType, MatchStatus } from '@/types/arena';
import { useToastStore } from '@/stores/toastStore';

interface ShareMatchButtonProps {
  matchId: number;
  className?: string;
  size?: 'sm' | 'md';
}

export function ShareMatchButton({ matchId, className, size = 'md' }: ShareMatchButtonProps) {
  const addToast = useToastStore(s => s.addToast);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const match = useArenaStore(s => s.allMatches.find(m => m.id === matchId));
  const getAgent = useAgentStore(s => s.getAgentByAddress);

  const matchUrl = `${window.location.origin}/match/${matchId}`;
  const p1Agent = match ? getAgent(match.player1) : undefined;
  const p2Agent = match ? getAgent(match.player2) : undefined;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const p1Name = match ? (getAgent(match.player1)?.moltbookHandle ?? match.player1.slice(0, 8)) : '???';
  const p2Name = match ? (getAgent(match.player2)?.moltbookHandle ?? match.player2.slice(0, 8)) : '???';
  const gameLabel = match?.gameType !== undefined
    ? GAME_TYPE_CONFIG[match.gameType as GameType]?.label ?? 'Match'
    : 'Match';
  const isComplete = match?.status === MatchStatus.Completed;
  const winnerName = match?.winner
    ? (getAgent(match.winner)?.moltbookHandle ?? match.winner.slice(0, 8))
    : null;

  const shareText = isComplete && winnerName
    ? `${winnerName} won ${gameLabel} Match #${matchId} on ArenaForge! ${p1Name} vs ${p2Name}`
    : `${p1Name} vs ${p2Name} — ${gameLabel} Match #${matchId} on ArenaForge!`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(matchUrl);
      setCopied(true);
      addToast('Match link copied to clipboard');
      setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
    } catch {
      // Fallback for insecure contexts
      const ta = document.createElement('textarea');
      ta.value = matchUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
    }
  };

  const handleShareTwitter = () => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(matchUrl)}`;
    window.open(url, '_blank', 'width=600,height=400');
    setOpen(false);
  };

  const handleNativeShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({
        title: `ArenaForge Match #${matchId}`,
        text: shareText,
        url: matchUrl,
      });
    } catch {
      // User cancelled
    }
    setOpen(false);
  };

  const sizeClasses = size === 'sm'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-1.5';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'inline-flex items-center rounded-md font-medium transition-all',
          'bg-surface-3 hover:bg-surface-4 text-text-secondary hover:text-text-primary',
          'border border-white/10 hover:border-arcade-purple/50 hover:shadow-sm hover:shadow-arcade-purple/10',
          'active:scale-95 hover:scale-105',
          sizeClasses,
          className
        )}
        title="Share match link"
      >
        <ShareIcon className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />
        <span>Share</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-white/10 bg-surface-2 shadow-xl shadow-black/40 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Match preview card */}
          <div className="p-3 border-b border-white/5 bg-surface-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                Match #{matchId}
              </span>
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded font-bold uppercase',
                isComplete ? 'bg-gray-600/30 text-gray-400' : 'bg-arcade-green/20 text-arcade-green'
              )}>
                {isComplete ? 'Completed' : 'Live'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="flex-1 text-right">
                <span className={clsx(
                  'font-semibold truncate',
                  match?.winner === match?.player1 ? 'text-arcade-green' : 'text-arcade-cyan'
                )}>{p1Name}</span>
                {p1Agent && (
                  <span className="text-[9px] font-mono text-gray-600 ml-1">{p1Agent.elo}</span>
                )}
              </div>
              <span className="text-gray-500 text-xs">vs</span>
              <div className="flex-1">
                {p2Agent && (
                  <span className="text-[9px] font-mono text-gray-600 mr-1">{p2Agent.elo}</span>
                )}
                <span className={clsx(
                  'font-semibold truncate',
                  match?.winner === match?.player2 ? 'text-arcade-green' : 'text-arcade-pink'
                )}>{p2Name}</span>
              </div>
            </div>
            {/* ELO comparison bar */}
            {p1Agent && p2Agent && (() => {
              const total = p1Agent.elo + p2Agent.elo;
              const p1Pct = total > 0 ? (p1Agent.elo / total) * 100 : 50;
              return (
                <div className="mt-2 flex items-center gap-1">
                  <div className="flex-1 h-1 bg-surface-0 rounded-full overflow-hidden flex" style={{ boxShadow: '0 0 4px rgba(0,229,255,0.1)' }}>
                    <div className="h-full bg-arcade-cyan/60 rounded-l-full transition-all duration-300" style={{ width: `${p1Pct}%` }} />
                    <div className="h-full bg-arcade-pink/60 rounded-r-full transition-all duration-300" style={{ width: `${100 - p1Pct}%` }} />
                  </div>
                </div>
              );
            })()}
            {isComplete && winnerName && (
              <div className="text-center mt-1.5">
                <span className="text-[10px] text-arcade-green font-bold">
                  Winner: {winnerName}
                </span>
              </div>
            )}
            <div className="text-center mt-1">
              <span className="text-[10px] text-gray-500">{gameLabel}</span>
            </div>
          </div>

          {/* Share options */}
          <div className="p-1.5 space-y-0.5">
            <ShareOption
              icon={copied ? <CheckIcon className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
              label={copied ? 'Copied!' : 'Copy Link'}
              sublabel={matchUrl}
              onClick={handleCopyLink}
              highlight={copied}
            />
            <ShareOption
              icon={<XIcon className="w-4 h-4" />}
              label="Share on X"
              sublabel="Post to your timeline"
              onClick={handleShareTwitter}
            />
            {typeof navigator.share === 'function' && (
              <ShareOption
                icon={<ShareIcon className="w-4 h-4" />}
                label="More Options"
                sublabel="System share sheet"
                onClick={handleNativeShare}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ShareOption({
  icon,
  label,
  sublabel,
  onClick,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-150',
        highlight
          ? 'bg-arcade-green/10 text-arcade-green scale-[1.02]'
          : 'hover:bg-surface-3 text-gray-300 hover:text-white active:scale-[0.98]'
      )}
      style={highlight ? { boxShadow: '0 0 8px rgba(105,240,174,0.15)' } : undefined}
    >
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {sublabel && (
          <div className="text-[10px] text-gray-500 truncate">{sublabel}</div>
        )}
      </div>
    </button>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
