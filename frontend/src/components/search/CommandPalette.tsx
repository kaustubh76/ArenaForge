import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, CornerDownLeft, User, Trophy, Swords,
  Gamepad2, BarChart3, Crown, Dna, Eye, Coins, Radio,
  Medal, Star, Award, Activity,
} from 'lucide-react';
import clsx from 'clsx';
import { useAgentStore } from '@/stores/agentStore';
import { useArenaStore } from '@/stores/arenaStore';
import { truncateAddress } from '@/constants/ui';

// ---------- Types ----------

type ResultCategory = 'page' | 'agent' | 'tournament' | 'match';

interface SearchResult {
  id: string;
  category: ResultCategory;
  label: string;
  sublabel?: string;
  path: string;
  icon?: React.ReactNode;
}

// ---------- Static page data ----------

const PAGE_RESULTS: SearchResult[] = [
  { id: 'p-lobby', category: 'page', label: 'Arena Lobby', sublabel: 'Home', path: '/', icon: <Gamepad2 size={14} /> },
  { id: 'p-dashboard', category: 'page', label: 'Dashboard', sublabel: 'Live overview', path: '/dashboard', icon: <Activity size={14} /> },
  { id: 'p-spectator', category: 'page', label: 'Spectator Hub', sublabel: 'Watch & bet', path: '/spectator', icon: <Eye size={14} /> },
  { id: 'p-leaderboard', category: 'page', label: 'Rankings', sublabel: 'Leaderboard', path: '/leaderboard', icon: <Crown size={14} /> },
  { id: 'p-evolution', category: 'page', label: 'Evolution', sublabel: 'Parameter mutations', path: '/evolution', icon: <Dna size={14} /> },
  { id: 'p-analytics', category: 'page', label: 'Analytics', sublabel: 'Stats & charts', path: '/analytics', icon: <BarChart3 size={14} /> },
  { id: 'p-token', category: 'page', label: 'Token', sublabel: '$ARENA token', path: '/token', icon: <Coins size={14} /> },
  { id: 'p-a2a', category: 'page', label: 'A2A Command Center', sublabel: 'Agent-to-Agent', path: '/a2a', icon: <Radio size={14} /> },
  { id: 'p-season', category: 'page', label: 'Season', sublabel: 'Seasonal rankings', path: '/season', icon: <Medal size={14} /> },
  { id: 'p-favorites', category: 'page', label: 'Favorites', sublabel: 'Saved agents', path: '/favorites', icon: <Star size={14} /> },
  { id: 'p-achievements', category: 'page', label: 'Achievements', sublabel: 'Progress tracking', path: '/achievements', icon: <Award size={14} /> },
];

// ---------- Helpers ----------

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-arcade-purple/30 text-arcade-purple rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ---------- Component ----------

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const agents = useAgentStore(s => s.agents);
  const tournaments = useArenaStore(s => s.tournaments);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Build results
  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase();

    if (!q) return PAGE_RESULTS;

    const out: SearchResult[] = [];

    // Pages
    const matchedPages = PAGE_RESULTS.filter(
      p => p.label.toLowerCase().includes(q) || (p.sublabel?.toLowerCase().includes(q))
    );
    out.push(...matchedPages);

    // Agents
    const matchedAgents = agents
      .filter(a =>
        a.moltbookHandle.toLowerCase().includes(q) ||
        a.agentAddress.toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map(a => ({
        id: `a-${a.agentAddress}`,
        category: 'agent' as ResultCategory,
        label: a.moltbookHandle,
        sublabel: `ELO ${a.elo} · ${truncateAddress(a.agentAddress)}`,
        path: `/agent/${a.agentAddress}`,
        icon: <User size={14} />,
      }));
    out.push(...matchedAgents);

    // Tournaments
    const matchedTournaments = tournaments
      .filter(t =>
        t.name.toLowerCase().includes(q) ||
        String(t.id) === q
      )
      .slice(0, 5)
      .map(t => ({
        id: `t-${t.id}`,
        category: 'tournament' as ResultCategory,
        label: t.name,
        sublabel: `Tournament #${t.id}`,
        path: `/tournament/${t.id}`,
        icon: <Trophy size={14} />,
      }));
    out.push(...matchedTournaments);

    // Match by ID
    if (/^\d+$/.test(q)) {
      out.push({
        id: `m-${q}`,
        category: 'match',
        label: `Go to Match #${q}`,
        sublabel: 'Navigate to match',
        path: `/match/${q}`,
        icon: <Swords size={14} />,
      });
    }

    return out;
  }, [query, agents, tournaments]);

  // Reset index on query change
  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Navigate to result
  const goToResult = useCallback((result: SearchResult) => {
    navigate(result.path);
    onClose();
  }, [navigate, onClose]);

  // Keyboard handling
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => (i + 1) % Math.max(results.length, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => (i - 1 + results.length) % Math.max(results.length, 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) goToResult(results[selectedIndex]);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, results, selectedIndex, goToResult, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!open) return null;

  // Group results by category for rendering
  const grouped = new Map<ResultCategory, SearchResult[]>();
  for (const r of results) {
    const arr = grouped.get(r.category) ?? [];
    arr.push(r);
    grouped.set(r.category, arr);
  }

  const categoryLabels: Record<ResultCategory, string> = {
    page: 'PAGES',
    agent: 'AGENTS',
    tournament: 'TOURNAMENTS',
    match: 'MATCHES',
  };

  const categoryColors: Record<ResultCategory, string> = {
    page: 'text-arcade-purple',
    agent: 'text-arcade-cyan',
    tournament: 'text-arcade-gold',
    match: 'text-arcade-pink',
  };

  const categoryGlow: Record<ResultCategory, string> = {
    page: '0 0 8px rgba(168,85,247,0.25)',
    agent: '0 0 8px rgba(34,211,238,0.25)',
    tournament: '0 0 8px rgba(255,215,0,0.25)',
    match: '0 0 8px rgba(236,72,153,0.25)',
  };

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative flex justify-center items-start pt-[18vh] px-4">
        <div className="w-full max-w-lg bg-surface-1 border border-arcade-purple/30 rounded-xl shadow-2xl overflow-hidden animate-scale-in">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
            <Search size={16} className="text-arcade-purple shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents, tournaments, pages..."
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none font-mono"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-gray-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-2">
            {results.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Search size={24} className="mx-auto text-gray-600 mb-2" />
                <p className="text-sm text-gray-500">No results for "{query}"</p>
              </div>
            ) : (
              Array.from(grouped.entries()).map(([category, items]) => (
                <div key={category}>
                  <div className="px-4 py-1.5 flex items-center gap-2">
                    <span className={clsx('font-pixel text-[9px] tracking-wider', categoryColors[category])}>
                      {categoryLabels[category]}
                    </span>
                    <span className="text-[9px] text-gray-700 font-mono">{items.length}</span>
                  </div>
                  {items.map((item) => {
                    const isSelected = flatIdx === selectedIndex;
                    const idx = flatIdx;
                    flatIdx++;
                    return (
                      <button
                        key={item.id}
                        data-selected={isSelected}
                        onClick={() => goToResult(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={clsx(
                          'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          isSelected
                            ? 'bg-arcade-purple/10'
                            : 'hover:bg-surface-3',
                        )}
                      >
                        <span className={clsx(
                          'shrink-0',
                          isSelected ? 'text-arcade-purple' : 'text-gray-500',
                        )}>
                          {item.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate">
                            {highlightMatch(item.label, query)}
                          </div>
                          {item.sublabel && (
                            <div className="text-[11px] text-gray-500 truncate">
                              {item.sublabel}
                            </div>
                          )}
                        </div>
                        {isSelected && (
                          <CornerDownLeft size={12} className="text-gray-500 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Footer with keyboard hints */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-white/[0.06] text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface-3 border border-white/[0.08] rounded font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface-3 border border-white/[0.08] rounded font-mono">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface-3 border border-white/[0.08] rounded font-mono">esc</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
