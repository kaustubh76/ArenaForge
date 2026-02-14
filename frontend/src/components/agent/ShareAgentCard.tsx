import { useCallback, useRef, useState } from 'react';
import { Download, Share2, Check } from 'lucide-react';
import { NeonButton } from '@/components/arcade/NeonButton';
import { GameType } from '@/types/arena';
import { GAME_TYPE_CONFIG } from '@/constants/game';

interface AgentCardData {
  handle: string;
  address: string;
  elo: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number;
  streak: number;
  peakElo?: number;
  longestWinStreak?: number;
  tournamentsWon?: number;
  avatarUrl?: string;
  gameTypeStats?: Array<{ gameType: string; wins: number; winRate: number }>;
}

// Map game type string to config for icon/label
function gtLabel(gt: string): string {
  const map: Record<string, GameType> = {
    ORACLE_DUEL: GameType.OracleDuel,
    STRATEGY_ARENA: GameType.StrategyArena,
    AUCTION_WARS: GameType.AuctionWars,
    QUIZ_BOWL: GameType.QuizBowl,
  };
  const num = map[gt];
  return num !== undefined ? GAME_TYPE_CONFIG[num]?.arcadeLabel ?? gt : gt;
}

// Tier from ELO
function getTier(elo: number): { name: string; color: string } {
  if (elo >= 2000) return { name: 'DIAMOND', color: '#a855f7' };
  if (elo >= 1700) return { name: 'PLATINUM', color: '#22d3ee' };
  if (elo >= 1400) return { name: 'GOLD', color: '#ffd700' };
  if (elo >= 1100) return { name: 'SILVER', color: '#c0c0c0' };
  if (elo >= 800) return { name: 'BRONZE', color: '#cd7f32' };
  return { name: 'IRON', color: '#666' };
}

function drawCard(
  canvas: HTMLCanvasElement,
  data: AgentCardData,
) {
  const ctx = canvas.getContext('2d')!;
  const w = 600;
  const h = 340;
  canvas.width = w;
  canvas.height = h;

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0a0a1a');
  grad.addColorStop(0.5, '#111128');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Grid pattern overlay
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 20) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Border
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  // Inner border
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  // Corner accents
  const cornerLen = 20;
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 2;
  // Top-left
  ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(4 + cornerLen, 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(4, 4 + cornerLen); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(w - 4, 4); ctx.lineTo(w - 4 - cornerLen, 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - 4, 4); ctx.lineTo(w - 4, 4 + cornerLen); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(4, h - 4); ctx.lineTo(4 + cornerLen, h - 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, h - 4); ctx.lineTo(4, h - 4 - cornerLen); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(w - 4, h - 4); ctx.lineTo(w - 4 - cornerLen, h - 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w - 4, h - 4); ctx.lineTo(w - 4, h - 4 - cornerLen); ctx.stroke();

  // Tier info
  const tier = getTier(data.elo);

  // Avatar circle placeholder
  const avatarX = 50;
  const avatarY = 55;
  const avatarR = 32;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
  ctx.fill();
  ctx.strokeStyle = tier.color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Avatar initials
  const initials = data.handle.slice(0, 2).toUpperCase();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, avatarX, avatarY);

  // Handle
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px monospace';
  ctx.fillStyle = '#fff';
  ctx.fillText(data.handle, 95, 45);

  // Address
  ctx.font = '11px monospace';
  ctx.fillStyle = '#666';
  ctx.fillText(data.address.slice(0, 6) + '...' + data.address.slice(-4), 95, 68);

  // Tier badge
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = tier.color;
  const tierText = `${tier.name}`;
  const tierWidth = ctx.measureText(tierText).width + 16;
  const tierX = 95;
  const tierY = 78;
  ctx.fillStyle = tier.color + '20';
  roundRect(ctx, tierX, tierY, tierWidth, 18, 4);
  ctx.fill();
  ctx.fillStyle = tier.color;
  ctx.fillText(tierText, tierX + 8, tierY + 13);

  // Divider
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, 110);
  ctx.lineTo(w - 20, 110);
  ctx.stroke();

  // Stats grid — ELO, Win Rate, W/L, Matches, Streak, Peak
  const stats = [
    { label: 'ELO', value: String(data.elo), color: '#ffd700' },
    { label: 'WIN RATE', value: `${data.winRate.toFixed(1)}%`, color: '#22c55e' },
    { label: 'W / L', value: `${data.wins} / ${data.losses}`, color: '#22d3ee' },
    { label: 'MATCHES', value: String(data.matchesPlayed), color: '#a855f7' },
    { label: 'STREAK', value: `${data.streak > 0 ? '+' : ''}${data.streak}`, color: data.streak > 0 ? '#22c55e' : data.streak < 0 ? '#f43f5e' : '#888' },
    { label: 'PEAK ELO', value: String(data.peakElo ?? data.elo), color: '#ffd700' },
  ];

  const statY = 125;
  const colW = (w - 40) / 3;
  stats.forEach((stat, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const sx = 20 + col * colW + colW / 2;
    const sy = statY + row * 55;

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = stat.color;
    ctx.textAlign = 'center';
    ctx.fillText(stat.value, sx, sy + 18);

    ctx.font = '9px monospace';
    ctx.fillStyle = '#666';
    ctx.fillText(stat.label, sx, sy + 34);
  });

  // Divider
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.2)';
  ctx.beginPath();
  ctx.moveTo(20, 240);
  ctx.lineTo(w - 20, 240);
  ctx.stroke();

  // Game type breakdown (bottom section)
  if (data.gameTypeStats && data.gameTypeStats.length > 0) {
    ctx.font = '9px monospace';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText('GAME PERFORMANCE', 20, 258);

    const barY = 268;
    const barH = 14;
    const barMaxW = (w - 60) / data.gameTypeStats.length - 10;

    data.gameTypeStats.forEach((gt, i) => {
      const bx = 20 + i * (barMaxW + 10);
      // Label
      ctx.font = '8px monospace';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'left';
      ctx.fillText(gtLabel(gt.gameType), bx, barY - 2);

      // Bar background
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      roundRect(ctx, bx, barY, barMaxW, barH, 3);
      ctx.fill();

      // Bar fill
      const fillW = barMaxW * gt.winRate;
      const barColor = gt.winRate >= 0.6 ? '#22c55e' : gt.winRate >= 0.4 ? '#a855f7' : '#f43f5e';
      ctx.fillStyle = barColor;
      if (fillW > 0) {
        roundRect(ctx, bx, barY, Math.max(fillW, 6), barH, 3);
        ctx.fill();
      }

      // Win count
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(`${gt.wins}W`, bx + 4, barY + 11);
    });
  }

  // Footer branding
  ctx.font = '9px monospace';
  ctx.fillStyle = '#444';
  ctx.textAlign = 'left';
  ctx.fillText('ARENAFORGE', 20, h - 18);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#333';
  ctx.fillText('arenaforge.io', w - 20, h - 18);

  // Glow accent line at top
  const glowGrad = ctx.createLinearGradient(0, 0, w, 0);
  glowGrad.addColorStop(0, 'transparent');
  glowGrad.addColorStop(0.3, '#a855f7');
  glowGrad.addColorStop(0.7, '#22d3ee');
  glowGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = glowGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function ShareAgentCard({ data }: { data: AgentCardData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generateCard = useCallback(() => {
    if (!canvasRef.current) return;
    drawCard(canvasRef.current, data);
    setGenerated(true);
  }, [data]);

  const downloadCard = useCallback(() => {
    if (!canvasRef.current) return;
    if (!generated) {
      drawCard(canvasRef.current, data);
      setGenerated(true);
    }
    const link = document.createElement('a');
    link.download = `arenaforge-${data.handle}-card.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  }, [data, generated]);

  const copyCard = useCallback(async () => {
    if (!canvasRef.current) return;
    if (!generated) {
      drawCard(canvasRef.current, data);
      setGenerated(true);
    }
    try {
      const blob = await new Promise<Blob | null>(resolve =>
        canvasRef.current!.toBlob(resolve, 'image/png')
      );
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Fallback: download instead
      downloadCard();
    }
  }, [data, generated, downloadCard]);

  return (
    <div className="arcade-card p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
        <Share2 size={14} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
        Agent Card
      </h2>

      <div className="space-y-3">
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border border-white/[0.08] bg-surface-1"
          style={{ aspectRatio: '600/340', display: generated ? 'block' : 'none' }}
        />

        {!generated && (
          <div
            className="w-full rounded-lg border border-white/[0.08] bg-surface-1 flex items-center justify-center cursor-pointer hover:border-arcade-purple/30 transition-colors"
            style={{ aspectRatio: '600/340' }}
            onClick={generateCard}
          >
            <div className="text-center">
              <Share2 size={24} className="mx-auto text-gray-600 mb-2" />
              <span className="text-xs text-gray-500">Click to generate card</span>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <NeonButton variant="neon" color="purple" onClick={downloadCard} className="flex-1">
            <span className="flex items-center gap-1.5 justify-center text-xs">
              <Download size={12} />
              DOWNLOAD PNG
            </span>
          </NeonButton>
          <NeonButton variant="neon" color="cyan" onClick={copyCard} className="flex-1">
            <span className="flex items-center gap-1.5 justify-center text-xs">
              {copied ? <Check size={12} /> : <Share2 size={12} />}
              {copied ? 'COPIED!' : 'COPY TO CLIPBOARD'}
            </span>
          </NeonButton>
        </div>
      </div>
    </div>
  );
}
