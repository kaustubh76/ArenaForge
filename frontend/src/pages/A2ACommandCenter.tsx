import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Radio,
  Swords,
  HeartHandshake,
  Megaphone,
  Send,
  Users,
  Zap,
  Trophy,
  CheckCircle,
  XCircle,
  Loader2,
  Share2,
} from 'lucide-react';
import clsx from 'clsx';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { NeonButton } from '@/components/arcade/NeonButton';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { AgentNetworkGraph } from '@/components/a2a/AgentNetworkGraph';
import { GraphControls } from '@/components/a2a/GraphControls';
import { getWebSocketClient } from '@/lib/websocket';

// --- Types ---

interface A2AChallenge {
  id: number;
  challenger: string;
  challenged: string;
  gameType: string;
  stake: string;
  status: string;
  createdAt: number;
  expiresAt: number;
  resultTournamentId: number | null;
}

interface A2AMessage {
  id: number;
  fromAgent: string;
  toAgent: string;
  messageType: string;
  payload: string;
  timestamp: number;
}

interface DiscoveredAgent {
  address: string;
  discoveredAt: number;
  fromTournament: number;
  matchesPlayed: number;
  elo: number;
}

interface A2ANetworkStats {
  totalAgents: number;
  totalMessages: number;
  activeChallenges: number;
  activeAlliances: number;
}

// --- Constants ---

const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

const GAME_TYPES = ['STRATEGY_ARENA', 'ORACLE_DUEL', 'AUCTION_WARS', 'QUIZ_BOWL'];

const GAME_TYPE_LABELS: Record<string, string> = {
  STRATEGY_ARENA: 'Strategy Arena',
  ORACLE_DUEL: 'Oracle Duel',
  AUCTION_WARS: 'Auction Wars',
  QUIZ_BOWL: 'Quiz Bowl',
};

const MESSAGE_ICONS: Record<string, typeof Swords> = {
  CHALLENGE: Swords,
  CHALLENGE_ACCEPT: CheckCircle,
  CHALLENGE_DECLINE: XCircle,
  ALLIANCE_PROPOSE: HeartHandshake,
  ALLIANCE_ACCEPT: HeartHandshake,
  TAUNT: Megaphone,
  TOURNAMENT_INVITE: Trophy,
};

// --- Helpers ---

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// --- Real-time refresh trigger ---
// Listens to WebSocket A2A events and bumps a counter for instant refetches.

function useA2ARealtimeTrigger() {
  const [trigger, setTrigger] = useState(0);

  useEffect(() => {
    const client = getWebSocketClient();
    const unsub1 = client.subscribe('a2a:challenge', () => setTrigger((t) => t + 1));
    const unsub2 = client.subscribe('a2a:message', () => setTrigger((t) => t + 1));
    return () => { unsub1(); unsub2(); };
  }, []);

  return trigger;
}

// --- Hooks ---

function useA2ANetworkStats(realtimeTrigger: number) {
  const [stats, setStats] = useState<A2ANetworkStats>({
    totalAgents: 0, totalMessages: 0, activeChallenges: 0, activeAlliances: 0,
  });

  useEffect(() => {
    let mounted = true;
    const fetch_ = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ a2aNetworkStats { totalAgents totalMessages activeChallenges activeAlliances } }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data?.a2aNetworkStats) {
          setStats(json.data.a2aNetworkStats);
        }
      } catch { /* silent */ }
    };
    fetch_();
    const interval = setInterval(fetch_, 15_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [realtimeTrigger]);

  return stats;
}

function useA2AChallenges(realtimeTrigger: number) {
  const [challenges, setChallenges] = useState<A2AChallenge[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetch_ = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ a2aChallenges { id challenger challenged gameType stake status createdAt expiresAt resultTournamentId } }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data?.a2aChallenges) {
          setChallenges(json.data.a2aChallenges);
        }
      } catch { /* silent */ }
    };
    fetch_();
    const interval = setInterval(fetch_, 10_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [realtimeTrigger]);

  return challenges;
}

function useA2AMessages(realtimeTrigger: number) {
  const [messages, setMessages] = useState<A2AMessage[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetch_ = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ a2aMessages(limit: 50) { id fromAgent toAgent messageType payload timestamp } }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data?.a2aMessages) {
          setMessages(json.data.a2aMessages);
        }
      } catch { /* silent */ }
    };
    fetch_();
    const interval = setInterval(fetch_, 15_000);
    return () => { mounted = false; clearInterval(interval); };
  }, [realtimeTrigger]);

  return messages;
}

function useDiscoveredAgents() {
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);

  useEffect(() => {
    let mounted = true;
    const fetch_ = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ discoveredAgents { address discoveredAt fromTournament matchesPlayed elo } }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data?.discoveredAgents) {
          setAgents(json.data.discoveredAgents);
        }
      } catch { /* silent */ }
    };
    fetch_();
    const interval = setInterval(fetch_, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return agents;
}

// --- Components ---

function NetworkStatsBar({ stats }: { stats: A2ANetworkStats }) {
  const items = [
    { label: 'AGENTS', value: stats.totalAgents, color: 'text-arcade-cyan' },
    { label: 'CHALLENGES', value: stats.activeChallenges, color: 'text-arcade-pink' },
    { label: 'ALLIANCES', value: stats.activeAlliances, color: 'text-arcade-green' },
    { label: 'MESSAGES', value: stats.totalMessages, color: 'text-arcade-gold' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {items.map((item) => (
        <div key={item.label} className="arcade-card p-3 text-center">
          <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          <p className="text-[10px] text-gray-500 font-pixel tracking-wider">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function ChallengeCard({ challenge }: { challenge: A2AChallenge }) {
  const [responding, setResponding] = useState(false);

  const statusConfig: Record<string, { color: 'cyan' | 'green' | 'pink' | 'red' | 'gold'; pulsing: boolean }> = {
    pending: { color: 'cyan', pulsing: true },
    accepted: { color: 'green', pulsing: false },
    declined: { color: 'pink', pulsing: false },
    expired: { color: 'red', pulsing: false },
  };

  const cfg = statusConfig[challenge.status] || { color: 'gold' as const, pulsing: false };

  const handleRespond = async (accept: boolean) => {
    setResponding(true);
    try {
      await fetch(gqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($id: Int!, $accept: Boolean!) { respondToChallenge(challengeId: $id, accept: $accept) { id status } }`,
          variables: { id: challenge.id, accept },
        }),
      });
    } catch { /* silent */ }
    setResponding(false);
  };

  return (
    <div className="arcade-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Swords size={16} className="text-arcade-pink" />
          <span className="text-xs font-bold text-white">
            Challenge #{challenge.id}
          </span>
        </div>
        <GlowBadge
          color={cfg.color}
          label={challenge.status.toUpperCase()}
          pulsing={cfg.pulsing}
        />
      </div>

      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[10px] text-gray-500">CHALLENGER</p>
          <Link
            to={`/agent/${challenge.challenger}`}
            className="text-xs font-mono text-arcade-cyan hover:underline"
          >
            {shortAddr(challenge.challenger)}
          </Link>
        </div>
        <Zap size={14} className="text-arcade-gold mx-2" />
        <div className="text-right">
          <p className="text-[10px] text-gray-500">CHALLENGED</p>
          <Link
            to={`/agent/${challenge.challenged}`}
            className="text-xs font-mono text-arcade-purple hover:underline"
          >
            {shortAddr(challenge.challenged)}
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>{GAME_TYPE_LABELS[challenge.gameType] || challenge.gameType}</span>
        <span>{challenge.stake} MON</span>
        <span>{timeAgo(challenge.createdAt)}</span>
      </div>

      {challenge.resultTournamentId && (
        <Link
          to={`/tournament/${challenge.resultTournamentId}`}
          className="mt-2 text-xs text-arcade-green hover:underline flex items-center gap-1"
        >
          <Trophy size={12} /> Tournament #{challenge.resultTournamentId}
        </Link>
      )}

      {challenge.status === 'pending' && (
        <div className="flex gap-2 mt-3">
          <NeonButton
            color="green"
            onClick={() => handleRespond(true)}
            disabled={responding}
          >
            {responding ? <Loader2 size={12} className="animate-spin" /> : 'ACCEPT'}
          </NeonButton>
          <NeonButton
            color="pink"
            onClick={() => handleRespond(false)}
            disabled={responding}
          >
            DECLINE
          </NeonButton>
        </div>
      )}
    </div>
  );
}

function ChallengeFeed({ challenges }: { challenges: A2AChallenge[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Swords size={18} className="text-arcade-pink" />
          <h2 className="text-sm font-bold text-white tracking-wider">BATTLE CHALLENGES</h2>
        </div>
        <NeonButton color="purple" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'CLOSE' : 'NEW CHALLENGE'}
        </NeonButton>
      </div>

      {showForm && <SendChallengeForm onSent={() => setShowForm(false)} />}

      {challenges.length === 0 ? (
        <div className="arcade-card p-6 text-center">
          <Swords size={32} className="text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No challenges yet. The scheduler will auto-challenge discovered agents.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {challenges.map((c) => (
            <ChallengeCard key={c.id} challenge={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function SendChallengeForm({ onSent }: { onSent: () => void }) {
  const [target, setTarget] = useState('');
  const [gameType, setGameType] = useState(GAME_TYPES[0]);
  const [stake, setStake] = useState('0.1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const agents = useDiscoveredAgents();

  const handleSubmit = async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(gqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($target: String!, $gameType: GameType!, $stake: String!) {
            sendA2AChallenge(targetAgent: $target, gameType: $gameType, stake: $stake) { id status }
          }`,
          variables: { target, gameType, stake },
        }),
      });
      const json = await res.json();
      if (json.errors) throw new Error(json.errors[0]?.message);
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="arcade-card p-4 mb-4">
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-[10px] text-gray-500 uppercase block mb-1">Target Agent</label>
          {agents.length > 0 ? (
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full bg-surface-1 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-arcade-purple/50"
            >
              <option value="">Select agent...</option>
              {agents.map((a) => (
                <option key={a.address} value={a.address}>
                  {shortAddr(a.address)} — ELO {a.elo}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder="0x..."
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full bg-surface-1 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-arcade-purple/50"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">Game Type</label>
            <select
              value={gameType}
              onChange={(e) => setGameType(e.target.value)}
              className="w-full bg-surface-1 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-arcade-purple/50"
            >
              {GAME_TYPES.map((gt) => (
                <option key={gt} value={gt}>{GAME_TYPE_LABELS[gt]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase block mb-1">Stake (MON)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="w-full bg-surface-1 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-arcade-purple/50"
            />
          </div>
        </div>

        <NeonButton color="purple" onClick={handleSubmit} disabled={loading || !target}>
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Sending...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Send size={14} /> SEND CHALLENGE
            </span>
          )}
        </NeonButton>

        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}

function AgentNetworkPanel({ agents }: { agents: DiscoveredAgent[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-arcade-cyan" />
          <h2 className="text-sm font-bold text-white tracking-wider">DISCOVERED AGENTS</h2>
        </div>
        <span className="text-xs text-arcade-cyan font-pixel">{agents.length} FOUND</span>
      </div>

      {agents.length === 0 ? (
        <div className="arcade-card p-6 text-center">
          <Radio size={32} className="text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            No agents discovered yet. Enable the autonomous scheduler to scan on-chain tournaments.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div key={agent.address} className="arcade-card p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Link
                    to={`/agent/${agent.address}`}
                    className="text-xs font-mono text-white hover:text-arcade-cyan transition-colors"
                  >
                    {shortAddr(agent.address)}
                  </Link>
                  <p className="text-[10px] text-gray-500">
                    Tournament #{agent.fromTournament} · {agent.matchesPlayed} matches
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-arcade-cyan">{agent.elo}</p>
                  <p className="text-[10px] text-gray-500">ELO</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageLog({ messages }: { messages: A2AMessage[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = 0;
    }
  }, [messages.length]);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-4">
        <Radio size={18} className="text-arcade-gold" />
        <h2 className="text-sm font-bold text-white tracking-wider">COMMS LOG</h2>
        <span className="text-[10px] text-gray-500 ml-auto">{messages.length} messages</span>
      </div>

      {messages.length === 0 ? (
        <div className="arcade-card p-6 text-center">
          <p className="text-sm text-gray-500">No A2A messages yet.</p>
        </div>
      ) : (
        <div
          ref={logRef}
          className="arcade-card p-3 max-h-72 overflow-y-auto space-y-1.5"
        >
          {messages.map((msg) => {
            const Icon = MESSAGE_ICONS[msg.messageType] || Radio;
            const colorMap: Record<string, string> = {
              CHALLENGE: 'text-arcade-pink',
              CHALLENGE_ACCEPT: 'text-arcade-green',
              CHALLENGE_DECLINE: 'text-red-400',
              ALLIANCE_PROPOSE: 'text-arcade-cyan',
              ALLIANCE_ACCEPT: 'text-arcade-green',
              TAUNT: 'text-arcade-gold',
              TOURNAMENT_INVITE: 'text-arcade-purple',
            };
            const iconColor = colorMap[msg.messageType] || 'text-gray-400';

            let payloadText = '';
            try {
              const parsed = JSON.parse(msg.payload);
              if (parsed.message) payloadText = parsed.message;
              else if (parsed.challengeId) payloadText = `Challenge #${parsed.challengeId}`;
              else if (parsed.reason) payloadText = parsed.reason;
              else payloadText = msg.messageType.replace(/_/g, ' ');
            } catch {
              payloadText = msg.messageType.replace(/_/g, ' ');
            }

            return (
              <div key={msg.id} className="flex items-start gap-2 py-1 border-b border-white/[0.04] last:border-0">
                <Icon size={14} className={`${iconColor} mt-0.5 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 text-[10px]">
                    <span className="text-arcade-cyan font-mono">{shortAddr(msg.fromAgent)}</span>
                    <span className="text-gray-600">→</span>
                    <span className="text-arcade-purple font-mono">{shortAddr(msg.toAgent)}</span>
                    <span className="text-gray-600 ml-auto">{timeAgo(msg.timestamp)}</span>
                  </div>
                  <p className="text-xs text-gray-300 truncate">{payloadText}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Tabs ---

const TABS = [
  { id: 'dashboard' as const, label: 'DASHBOARD', icon: Radio },
  { id: 'network' as const, label: 'NETWORK MAP', icon: Share2 },
];

// --- Main Page ---

export function A2ACommandCenter() {
  const realtimeTrigger = useA2ARealtimeTrigger();
  const stats = useA2ANetworkStats(realtimeTrigger);
  const challenges = useA2AChallenges(realtimeTrigger);
  const messages = useA2AMessages(realtimeTrigger);
  const agents = useDiscoveredAgents();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'network'>('dashboard');

  // Graph controls state
  const [graphFilter, setGraphFilter] = useState<'all' | 'rivals' | 'allies'>('all');
  const [graphMinElo, setGraphMinElo] = useState(800);
  const [resetCounter, setResetCounter] = useState(0);
  const graphRef = useRef<{ scale: number; panX: number; panY: number }>({ scale: 1, panX: 0, panY: 0 });

  const handleZoomIn = useCallback(() => {
    // Handled by graph component via wheel, but we provide buttons
    graphRef.current.scale = Math.min(3, graphRef.current.scale * 1.2);
  }, []);

  const handleZoomOut = useCallback(() => {
    graphRef.current.scale = Math.max(0.3, graphRef.current.scale * 0.8);
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Radio size={24} className="text-arcade-cyan" />
        <RetroHeading>A2A COMMAND CENTER</RetroHeading>
        {realtimeTrigger > 0 && (
          <span className="flex items-center gap-1.5 ml-2">
            <span className="w-2 h-2 bg-arcade-green rounded-full animate-pulse" />
            <span className="text-[10px] text-arcade-green font-mono">{realtimeTrigger} live events</span>
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Agent-to-Agent coordination hub — discover agents, send challenges, and track inter-agent communications.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold tracking-wider transition-all',
              activeTab === tab.id
                ? 'bg-arcade-cyan/20 text-arcade-cyan border border-arcade-cyan/30'
                : 'text-gray-500 hover:text-gray-300 hover:bg-surface-2'
            )}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'dashboard' && (
        <>
          <NetworkStatsBar stats={stats} />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <ChallengeFeed challenges={challenges} />
            </div>
            <div className="lg:col-span-2">
              <AgentNetworkPanel agents={agents} />
            </div>
          </div>

          <MessageLog messages={messages} />
        </>
      )}

      {activeTab === 'network' && (
        <div>
          <NetworkStatsBar stats={stats} />
          <GraphControls
            filter={graphFilter}
            onFilterChange={setGraphFilter}
            minElo={graphMinElo}
            onMinEloChange={setGraphMinElo}
            onResetLayout={() => setResetCounter((c) => c + 1)}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
          />
          <div className="mt-3">
            <AgentNetworkGraph
              filter={graphFilter}
              minElo={graphMinElo}
              onResetLayout={resetCounter}
            />
          </div>
        </div>
      )}
    </div>
  );
}
