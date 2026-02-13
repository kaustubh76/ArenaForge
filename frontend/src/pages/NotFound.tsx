import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { NeonButton } from '@/components/arcade/NeonButton';

export function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <Gamepad2 size={48} className="text-gray-700 mb-6" />

      <h1 className="font-pixel text-4xl neon-text-pink animate-neon-flicker mb-4">
        404
      </h1>

      <p className="font-pixel text-sm text-gray-500 mb-2">GAME OVER</p>
      <p className="text-sm text-gray-600 mb-8">Page not found in the arena</p>

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
