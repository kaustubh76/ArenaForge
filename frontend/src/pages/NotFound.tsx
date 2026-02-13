import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { NeonButton } from '@/components/arcade/NeonButton';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="animate-float mb-6 relative">
        <Gamepad2 size={48} className="text-arcade-purple/60" style={{ filter: 'drop-shadow(0 0 8px rgba(168,85,247,0.3))' }} />
        {/* Glow ring behind gamepad */}
        <div className="absolute inset-0 -m-3 rounded-full bg-arcade-purple/5 animate-pulse" />
      </div>

      <h1
        className="font-pixel text-5xl neon-text-pink animate-neon-flicker mb-4"
        style={{ textShadow: '0 0 20px rgba(236,72,153,0.4), 0 0 40px rgba(236,72,153,0.15)' }}
      >
        404
      </h1>

      <p className="font-pixel text-sm text-gray-500 mb-1 tracking-widest">GAME OVER</p>
      <p className="text-sm text-gray-600 mb-2">Page not found in the arena</p>
      <div className="flex items-center gap-2 mb-8">
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-gray-700" />
        <span className="font-mono text-[10px] text-gray-700">SCORE: 000000</span>
        <span className="h-px w-8 bg-gradient-to-l from-transparent to-gray-700" />
      </div>

      <div className="flex gap-4">
        <Link to="/">
          <NeonButton variant="insert-coin" className="text-[9px]">
            INSERT COIN
          </NeonButton>
        </Link>
        <Link to="/leaderboard">
          <NeonButton variant="neon" color="cyan">
            HIGH SCORES
          </NeonButton>
        </Link>
      </div>
    </div>
  );
}
