import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { ProgressBar } from '@/components/arcade/ProgressBar';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import type { EvolutionMetrics } from '@/types/arena';

const behaviorColors = {
  conservative: 'cyan',
  moderate: 'purple',
  aggressive: 'pink',
} as const;

// ---------------------------------------------------------------------------
// Mini SVG radar chart for evolution metrics
// ---------------------------------------------------------------------------
function MetricsRadar({ metrics }: { metrics: EvolutionMetrics }) {
  const radarData = useMemo(() => {
    const stratEntries = Object.values(metrics.strategyDistribution);
    const diversity = stratEntries.length > 1
      ? Math.min(1, 1 - Math.max(...stratEntries)) // higher when more evenly distributed
      : 0;

    const behaviorScore = metrics.averageStakeBehavior === 'aggressive' ? 1
      : metrics.averageStakeBehavior === 'moderate' ? 0.5
      : 0.2;

    const dimensions = [
      { label: 'DUR', value: Math.min(1, metrics.averageMatchDuration / 30) }, // normalize to 30s
      { label: 'DRAW', value: metrics.drawRate },
      { label: 'DIV', value: diversity },
      { label: 'AGG', value: behaviorScore },
      { label: 'STR', value: stratEntries.length > 0 ? Math.max(...stratEntries) : 0 },
    ];

    const size = 100;
    const cx = size / 2;
    const cy = size / 2;
    const r = 36;
    const angleStep = (2 * Math.PI) / dimensions.length;
    const offset = -Math.PI / 2; // start from top

    const points = dimensions.map((d, i) => {
      const angle = offset + i * angleStep;
      const val = d.value * r;
      return {
        x: cx + Math.cos(angle) * val,
        y: cy + Math.sin(angle) * val,
        lx: cx + Math.cos(angle) * (r + 10),
        ly: cy + Math.sin(angle) * (r + 10),
        label: d.label,
      };
    });

    const polygon = points.map(p => `${p.x},${p.y}`).join(' ');

    // Grid rings
    const rings = [0.33, 0.66, 1].map(scale => {
      const ringPoints = dimensions.map((_, i) => {
        const angle = offset + i * angleStep;
        return `${cx + Math.cos(angle) * r * scale},${cy + Math.sin(angle) * r * scale}`;
      });
      return ringPoints.join(' ');
    });

    return { size, cx, cy, r, points, polygon, rings, offset, angleStep, dimensions };
  }, [metrics]);

  return (
    <div className="flex flex-col items-center">
      <p className="text-[10px] text-gray-500 mb-1">METRICS PROFILE</p>
      <svg width={radarData.size} height={radarData.size} className="flex-shrink-0">
        {/* Grid rings */}
        {radarData.rings.map((ring, i) => (
          <polygon
            key={i}
            points={ring}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
        ))}
        {/* Axes */}
        {radarData.points.map((_, i) => (
          <line
            key={`axis-${i}`}
            x1={radarData.cx} y1={radarData.cy}
            x2={radarData.cx + Math.cos(-Math.PI / 2 + i * radarData.angleStep) * radarData.r}
            y2={radarData.cy + Math.sin(-Math.PI / 2 + i * radarData.angleStep) * radarData.r}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
        ))}
        {/* Data polygon */}
        <polygon
          points={radarData.polygon}
          fill="rgba(0,229,255,0.15)"
          stroke="#00e5ff"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {/* Data points */}
        {radarData.points.map((p, i) => (
          <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={2} fill="#00e5ff" />
        ))}
        {/* Labels */}
        {radarData.points.map((p, i) => (
          <text
            key={`label-${i}`}
            x={p.lx} y={p.ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#666"
            fontSize={7}
            fontFamily="monospace"
          >
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

interface MetricsPanelProps {
  metrics: EvolutionMetrics;
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  return (
    <div className="arcade-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-arcade-cyan" />
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          METRICS
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-[10px] text-gray-500">Dominant Strategy</p>
          <p className="text-xs font-semibold text-white">{metrics.dominantStrategy}</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Draw Rate</p>
          <p className="text-xs font-mono text-white">{(metrics.drawRate * 100).toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Avg Duration</p>
          <p className="text-xs font-mono text-white">{metrics.averageMatchDuration}s</p>
        </div>
        <div>
          <p className="text-[10px] text-gray-500">Stake Behavior</p>
          <GlowBadge
            color={behaviorColors[metrics.averageStakeBehavior]}
            label={metrics.averageStakeBehavior}
          />
        </div>
      </div>

      {/* Metrics radar + Strategy distribution side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
        {/* Mini radar chart */}
        <MetricsRadar metrics={metrics} />

        {/* Strategy distribution */}
        <div>
          <p className="text-[10px] text-gray-500 mb-2">STRATEGY DISTRIBUTION</p>
          <div className="space-y-2">
            {Object.entries(metrics.strategyDistribution).map(([strategy, pct]) => (
              <div key={strategy} className="flex items-center gap-3">
                <span className="text-[10px] text-gray-400 w-24 truncate">{strategy}</span>
                <ProgressBar value={pct * 100} color="purple" className="flex-1" />
                <span className="text-[10px] font-mono text-gray-300 w-10 text-right">
                  {(pct * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
