import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { isConfigured } from '@/lib/contracts';

export function ChainStatus() {
  const arenaLoading = useArenaStore(s => s.loading);
  const arenaError = useArenaStore(s => s.error);
  const agentLoading = useAgentStore(s => s.loading);
  const agentError = useAgentStore(s => s.error);

  const loading = arenaLoading || agentLoading;
  const error = arenaError || agentError;
  const configured = isConfigured();

  if (!configured) {
    return (
      <span className="inline-flex items-center gap-1.5" title="Running on mock data">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
        <span className="text-[9px] font-pixel text-gray-600 tracking-wider">MOCK</span>
      </span>
    );
  }

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5" title="Syncing with chain...">
        <span className="relative w-3.5 h-3.5 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="5.5" fill="none" stroke="rgba(34,211,238,0.2)" strokeWidth="1.5" />
            <path d="M7 1.5 A5.5 5.5 0 0 1 12.5 7" fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 2px rgba(34,211,238,0.5))' }} />
          </svg>
        </span>
        <span className="text-[9px] font-pixel text-arcade-cyan/60 tracking-wider">SYNCING</span>
      </span>
    );
  }

  if (error) {
    return (
      <span className="inline-flex items-center gap-1.5" title={error}>
        <span className="relative">
          <span className="w-1.5 h-1.5 rounded-full bg-arcade-orange block" />
          <span className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-arcade-orange animate-ping opacity-40" />
        </span>
        <span className="text-[9px] font-pixel text-arcade-orange/60 tracking-wider">OFFLINE</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5" title="Connected to chain">
      <span className="w-1.5 h-1.5 rounded-full bg-arcade-green" style={{ boxShadow: '0 0 4px rgba(105,240,174,0.6)' }} />
      <span className="text-[9px] font-pixel text-arcade-green/60 tracking-wider" style={{ textShadow: '0 0 4px rgba(105,240,174,0.3)' }}>ONCHAIN</span>
    </span>
  );
}
