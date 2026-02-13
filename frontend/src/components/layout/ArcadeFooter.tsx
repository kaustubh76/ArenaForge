import { Trophy } from 'lucide-react';
import { ChainStatus } from '@/components/arcade/ChainStatus';

export function ArcadeFooter() {
  return (
    <footer className="border-t border-white/[0.04] mt-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Trophy size={14} className="text-arcade-purple" />
            <span className="font-pixel text-[8px] text-gray-500 tracking-wider">ARENAFORGE</span>
          </div>
          <ChainStatus />
          <p className="text-xs text-gray-600">
            Autonomous AI Gaming Arena on Monad
          </p>
        </div>
      </div>
    </footer>
  );
}
