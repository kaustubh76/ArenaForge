// Shared chart colors and styling for recharts in the arcade theme

export const CHART_COLORS = {
  cyan: '#00e5ff',
  pink: '#ff4081',
  purple: '#b388ff',
  gold: '#ffd740',
  green: '#69f0ae',
  red: '#ff5252',
  orange: '#ffab40',
  gray: '#9e9e9e',
} as const;

// Game type color mapping
export const GAME_TYPE_COLORS: Record<string, string> = {
  ORACLE_DUEL: CHART_COLORS.gold,
  STRATEGY_ARENA: CHART_COLORS.cyan,
  AUCTION_WARS: CHART_COLORS.pink,
  QUIZ_BOWL: CHART_COLORS.purple,
};

// Tooltip styling for dark backgrounds
export const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#e0e0e0',
  },
  itemStyle: {
    color: '#e0e0e0',
  },
  labelStyle: {
    color: '#9e9e9e',
    fontWeight: 600,
    fontSize: '11px',
  },
} as const;

// Axis styling for dark backgrounds
export const AXIS_STYLE = {
  tick: { fill: '#666', fontSize: 11 },
  axisLine: { stroke: '#333' },
  tickLine: { stroke: '#333' },
} as const;

// Grid styling
export const GRID_STYLE = {
  strokeDasharray: '3 3',
  stroke: '#333',
} as const;

// Format duration in seconds to human-readable
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

// Game type label mapping
export const GAME_TYPE_LABELS: Record<string, string> = {
  ORACLE_DUEL: 'Oracle Duel',
  STRATEGY_ARENA: 'Strategy Arena',
  AUCTION_WARS: 'Auction Wars',
  QUIZ_BOWL: 'Quiz Bowl',
};
