import { Trophy } from 'lucide-react';
import { ChainStatus } from '@/components/arcade/ChainStatus';

export function ArcadeFooter() {
  return (
    <footer className="relative border-t border-white/[0.04] mt-auto">
      {/* Gradient top border */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-arcade-purple/20 to-transparent" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 group cursor-default">
            <Trophy size={14} className="text-arcade-purple group-hover:drop-shadow-lg transition-all duration-200" style={{ filter: 'drop-shadow(0 0 2px rgba(168,85,247,0.3))' }} />
            <span className="font-pixel text-[8px] text-gray-500 tracking-wider group-hover:text-arcade-purple/70 transition-colors">ARENAFORGE</span>
            <span className="text-[8px] font-mono text-gray-700 hidden sm:inline">v1.0</span>
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
