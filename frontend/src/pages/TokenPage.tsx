import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, ExternalLink, Users, ArrowDownCircle, ArrowUpCircle, Loader2, Radio, Activity, Coins, BarChart3 } from 'lucide-react';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { NeonButton } from '@/components/arcade/NeonButton';

import { useWallet } from '@/hooks/useWallet';

// --- Types ---

interface TokenMetrics {
  address: string;
  name: string;
  symbol: string;
  price: string;
  marketCap: string;
  volume24h: string;
  holders: number;
  bondingCurveProgress: number;
  graduated: boolean;
  locked: boolean;
}

interface DiscoveredAgent {
  address: string;
  discoveredAt: number;
  fromTournament: number;
  matchesPlayed: number;
  elo: number;
}

// --- Hooks ---

const gqlUrl = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:4000/graphql';

function useArenaToken() {
  const [token, setToken] = useState<TokenMetrics | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchToken = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ arenaToken { address name symbol price marketCap volume24h holders bondingCurveProgress graduated locked } }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data?.arenaToken) {
          setToken(json.data.arenaToken);
        }
      } catch { /* silent */ }
    };
    fetchToken();
    const interval = setInterval(fetchToken, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return token;
}

function useDiscoveredAgents() {
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const fetchAgents = async () => {
      try {
        const res = await fetch(gqlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `{ discoveredAgents { address discoveredAt fromTournament matchesPlayed elo } discoveredAgentCount }`,
          }),
        });
        const json = await res.json();
        if (mounted && json.data) {
          setAgents(json.data.discoveredAgents || []);
          setCount(json.data.discoveredAgentCount || 0);
        }
      } catch { /* silent */ }
    };
    fetchAgents();
    const interval = setInterval(fetchAgents, 30_000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return { agents, count };
}

// --- Helpers ---

function formatPrice(weiStr: string): string {
  const wei = BigInt(weiStr || '0');
  const whole = wei / BigInt(1e18);
  const frac = (wei % BigInt(1e18)) / BigInt(1e14);
  if (whole > BigInt(0)) {
    return frac === BigInt(0) ? `${whole}` : `${whole}.${frac.toString().padStart(4, '0').slice(0, 2)}`;
  }
  const microMon = wei / BigInt(1e12);
  if (microMon > BigInt(0)) return `0.${microMon.toString().padStart(6, '0')}`;
  return '0';
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// --- Components ---

function TradePanel({
  type,
}: {
  type: 'buy' | 'sell';
}) {
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isConnected, balance } = useWallet();

  const isBuy = type === 'buy';
  const mutationName = isBuy ? 'buyArenaToken' : 'sellArenaToken';
  const paramName = isBuy ? 'amountMON' : 'amountTokens';

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    setError(null);
    setTxHash(null);

    try {
      const res = await fetch(gqlUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation($amount: String!) { ${mutationName}(${paramName}: $amount) { txHash success } }`,
          variables: { amount },
        }),
      });
      const json = await res.json();
      if (json.errors) {
        throw new Error(json.errors[0]?.message || `${type} failed`);
      }
      setTxHash(json.data[mutationName].txHash);
      setAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="arcade-card p-5">
      <div className="flex items-center gap-2 mb-4">
        {isBuy ? (
          <ArrowDownCircle size={18} className="text-arcade-green" />
        ) : (
          <ArrowUpCircle size={18} className="text-arcade-pink" />
        )}
        <h3 className="font-bold text-white">
          {isBuy ? 'Buy ARENA' : 'Sell ARENA'}
        </h3>
      </div>

      <div className="mb-3">
        <label className="text-[10px] text-gray-500 uppercase block mb-1">
          {isBuy ? 'Amount (MON)' : 'Amount (ARENA tokens)'}
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder={isBuy ? '0.1' : '100'}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-surface-1 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-arcade-gold/50"
          disabled={loading}
        />
        {isBuy && isConnected && (
          <p className="text-[10px] text-gray-500 mt-1">
            Balance: {balance || '0'} MON
          </p>
        )}
      </div>

      <NeonButton
        color={isBuy ? 'green' : 'pink'}
        onClick={handleTrade}
        disabled={loading || !amount || parseFloat(amount) <= 0}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Processing...
          </span>
        ) : (
          isBuy ? 'BUY ARENA' : 'SELL ARENA'
        )}
      </NeonButton>

      {txHash && (
        <div className="mt-3 p-2 bg-arcade-green/10 border border-arcade-green/20 rounded-lg">
          <p className="text-[10px] text-arcade-green font-pixel">SUCCESS</p>
          <a
            href={`https://testnet.monadexplorer.com/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-arcade-green/80 hover:text-arcade-green flex items-center gap-1 break-all"
          >
            {shortAddr(txHash)} <ExternalLink size={10} />
          </a>
        </div>
      )}

      {error && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}

// --- Token Analytics Components ---

function BondingCurveRing({ progress, graduated }: { progress: number; graduated: boolean }) {
  const size = 160;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillPct = graduated ? 100 : Math.min(progress, 100);
  const dashOffset = circumference - (fillPct / 100) * circumference;

  return (
    <div className="arcade-card p-4 flex flex-col items-center justify-center">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
        <Activity size={12} /> Bonding Curve
      </h3>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id="bondingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={graduated ? '#69f0ae' : '#ffd740'} />
              <stop offset="100%" stopColor={graduated ? '#00e5ff' : '#ffab40'} />
            </linearGradient>
          </defs>
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#bondingGrad)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: 'stroke-dashoffset 1s ease-out' }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {graduated ? (
            <>
              <span className="text-lg font-bold text-arcade-green">100%</span>
              <span className="text-[9px] text-arcade-green font-pixel mt-0.5">GRADUATED</span>
            </>
          ) : (
            <>
              <span className="text-lg font-bold text-arcade-gold">{progress.toFixed(1)}%</span>
              <span className="text-[9px] text-gray-500 font-pixel mt-0.5">PROGRESS</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const METRIC_CONFIGS = [
  { key: 'price' as const, label: 'Price', icon: TrendingUp, gradient: 'from-arcade-gold to-arcade-orange' },
  { key: 'marketCap' as const, label: 'Market Cap', icon: Coins, gradient: 'from-arcade-purple to-arcade-cyan' },
  { key: 'volume' as const, label: '24h Volume', icon: BarChart3, gradient: 'from-arcade-green to-arcade-cyan' },
  { key: 'holders' as const, label: 'Holders', icon: Users, gradient: 'from-arcade-pink to-arcade-purple' },
];

function TokenMetricsGrid({ token }: { token: TokenMetrics }) {
  const priceVal = parseFloat(formatPrice(token.price));
  const mcapVal = parseFloat(formatPrice(token.marketCap));
  const volVal = parseFloat(formatPrice(token.volume24h));
  const holdersVal = token.holders;

  const values: Record<string, { display: string; pct: number }> = {
    price: { display: `${formatPrice(token.price)} MON`, pct: Math.min(priceVal * 100, 100) },
    marketCap: { display: `${formatPrice(token.marketCap)} MON`, pct: mcapVal > 0 ? Math.min(mcapVal / 10, 100) : 0 },
    volume: { display: `${formatPrice(token.volume24h)} MON`, pct: mcapVal > 0 ? Math.min((volVal / Math.max(mcapVal, 0.01)) * 100, 100) : 0 },
    holders: { display: String(holdersVal), pct: Math.min(holdersVal * 5, 100) },
  };

  return (
    <div className="arcade-card p-4">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-1.5">
        <BarChart3 size={12} /> Token Metrics
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {METRIC_CONFIGS.map(({ key, label, icon: Icon, gradient }) => {
          const { display, pct } = values[key];
          return (
            <div key={key} className="bg-surface-1 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={12} className="text-gray-400" />
                <p className="text-[10px] text-gray-500 uppercase">{label}</p>
              </div>
              <p className="text-sm font-bold text-white mb-2">{display}</p>
              <div className="w-full h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
                  style={{ width: `${Math.max(pct, 2)}%`, transition: 'width 0.8s ease-out' }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HoldersVsVolume({ holders, volume, marketCap }: { holders: number; volume: string; marketCap: string }) {
  const volVal = parseFloat(formatPrice(volume));
  const mcapVal = parseFloat(formatPrice(marketCap));
  const ratio = mcapVal > 0 ? (volVal / mcapVal) * 100 : 0;

  const health = ratio > 10 ? { label: 'HIGH ACTIVITY', color: 'text-arcade-green', bg: 'bg-arcade-green' }
    : ratio > 1 ? { label: 'MODERATE', color: 'text-arcade-purple', bg: 'bg-arcade-purple' }
    : { label: 'LOW', color: 'text-gray-500', bg: 'bg-gray-500' };

  const dotsCount = Math.min(holders, 50);

  return (
    <div className="arcade-card p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
          <Activity size={12} /> Market Health
        </h3>
        <span className={`text-[10px] font-pixel ${health.color}`}>{health.label}</span>
      </div>

      {/* Volume / Market Cap Ratio */}
      <div className="mb-4">
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>Vol / MCap Ratio</span>
          <span className={health.color}>{ratio.toFixed(2)}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={`h-full rounded-full ${health.bg}`}
            style={{ width: `${Math.min(ratio, 100)}%`, opacity: 0.7, transition: 'width 0.8s ease-out' }}
          />
        </div>
      </div>

      {/* Holders visualization */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-2">
          <span>Holders</span>
          <span className="text-white font-bold">{holders}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: dotsCount }).map((_, i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-arcade-cyan"
              style={{ opacity: 0.3 + (i / dotsCount) * 0.7 }}
            />
          ))}
          {holders > 50 && (
            <span className="text-[9px] text-gray-500 self-center ml-1">+{holders - 50}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function DiscoveredAgentsPanel({ agents, count }: { agents: DiscoveredAgent[]; count: number }) {
  return (
    <div className="arcade-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-arcade-cyan" />
          <h3 className="font-bold text-white">A2A Agent Discovery</h3>
        </div>
        <span className="text-xs text-arcade-cyan font-pixel">{count} FOUND</span>
      </div>

      {count === 0 ? (
        <p className="text-sm text-gray-500 mb-4">
          No agents discovered yet. The scheduler scans on-chain tournaments to find other agents.
        </p>
      ) : (
        <div className="space-y-2 mb-4">
          {agents.slice(0, 5).map((agent) => (
            <div
              key={agent.address}
              className="flex items-center justify-between bg-surface-1 rounded-lg px-3 py-2"
            >
              <div>
                <p className="text-xs font-mono text-white">{shortAddr(agent.address)}</p>
                <p className="text-[10px] text-gray-500">ELO {agent.elo} · {agent.matchesPlayed} matches</p>
              </div>
            </div>
          ))}
          {count > 5 && (
            <p className="text-[10px] text-gray-500 text-center">+{count - 5} more agents</p>
          )}
        </div>
      )}

      <Link
        to="/a2a"
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-arcade-cyan/10 border border-arcade-cyan/30 text-arcade-cyan text-xs font-bold tracking-wider hover:bg-arcade-cyan/20 transition-colors"
      >
        <Radio size={14} />
        OPEN A2A COMMAND CENTER
      </Link>
    </div>
  );
}

// --- Main Page ---

export function TokenPage() {
  const token = useArenaToken();
  const { agents, count } = useDiscoveredAgents();

  return (
    <div className="max-w-4xl mx-auto">
      <RetroHeading>ARENA TOKEN</RetroHeading>

      {!token ? (
        <div className="arcade-card p-8 text-center mb-6">
          <TrendingUp size={40} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">
            ARENA token not launched yet. Set <code className="text-arcade-gold">AUTO_LAUNCH_TOKEN=true</code> to launch on startup.
          </p>
        </div>
      ) : (
        <>
          {/* Token Analytics Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="md:col-span-2">
              <TokenMetricsGrid token={token} />
            </div>
            <BondingCurveRing progress={token.bondingCurveProgress} graduated={token.graduated} />
          </div>

          <HoldersVsVolume holders={token.holders} volume={token.volume24h} marketCap={token.marketCap} />

          {/* Trade on nad.fun link */}
          <a
            href={`https://nad.fun/token/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-arcade-gold hover:text-arcade-gold/80 transition-colors mb-6"
          >
            Trade on nad.fun <ExternalLink size={12} />
          </a>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <TradePanel type="buy" />
            <TradePanel type="sell" />
          </div>
        </>
      )}

      <DiscoveredAgentsPanel agents={agents} count={count} />
    </div>
  );
}
