import { Filter, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import clsx from 'clsx';

type FilterMode = 'all' | 'rivals' | 'allies';

interface GraphControlsProps {
  filter: FilterMode;
  onFilterChange: (filter: FilterMode) => void;
  minElo: number;
  onMinEloChange: (elo: number) => void;
  onResetLayout: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  nodeCount?: number;
}

const FILTER_OPTIONS: { value: FilterMode; label: string; color: string; glowColor: string }[] = [
  { value: 'all', label: 'ALL', color: 'text-gray-300', glowColor: '0 0 6px rgba(255,255,255,0.15)' },
  { value: 'rivals', label: 'RIVALS', color: 'text-red-400', glowColor: '0 0 8px rgba(248,113,113,0.3)' },
  { value: 'allies', label: 'ALLIES', color: 'text-green-400', glowColor: '0 0 8px rgba(74,222,128,0.3)' },
];

export function GraphControls({
  filter,
  onFilterChange,
  minElo,
  onMinEloChange,
  onResetLayout,
  onZoomIn,
  onZoomOut,
  nodeCount,
}: GraphControlsProps) {
  const eloPercent = ((minElo - 800) / (2000 - 800)) * 100;

  return (
    <div className="arcade-card p-3 flex flex-wrap items-center gap-3">
      {/* Filter */}
      <div className="flex items-center gap-1">
        <Filter size={12} className="text-gray-500 mr-1" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onFilterChange(opt.value)}
            className={clsx(
              'px-2 py-1 rounded text-[10px] font-bold tracking-wider transition-all',
              filter === opt.value
                ? 'bg-white/10 border border-white/20'
                : 'text-gray-500 hover:text-gray-300'
            )}
            style={filter === opt.value ? { boxShadow: opt.glowColor } : undefined}
          >
            <span className={filter === opt.value ? opt.color : undefined}>
              {opt.label}
            </span>
          </button>
        ))}
      </div>

      {/* ELO slider with visual bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500">MIN ELO</span>
        <div className="flex flex-col gap-0.5">
          <input
            type="range"
            min={800}
            max={2000}
            step={50}
            value={minElo}
            onChange={(e) => onMinEloChange(Number(e.target.value))}
            className="w-20 h-1 accent-arcade-cyan"
          />
          <div className="w-20 h-0.5 bg-surface-0 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-arcade-cyan/40 to-arcade-cyan transition-all duration-200"
              style={{ width: `${eloPercent}%` }}
            />
          </div>
        </div>
        <span className="text-[10px] text-arcade-cyan font-mono w-8">{minElo}</span>
        {nodeCount !== undefined && (
          <span className="text-[8px] text-gray-600 font-mono">{nodeCount} nodes</span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={onZoomOut}
          className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-surface-2 transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={onZoomIn}
          className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-surface-2 transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={onResetLayout}
          className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-surface-2 transition-colors"
          title="Reset layout"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </div>
  );
}
