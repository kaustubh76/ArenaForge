import { useCallback } from 'react';
import { useArenaStore } from '@/stores/arenaStore';
import { useAgentStore } from '@/stores/agentStore';
import { useMatchNotifications } from '@/hooks/useNotifications';
import { truncateAddress } from '@/constants/ui';

/**
 * Invisible component that wires browser notifications to match completion events.
 * Mount once in Layout so notifications fire regardless of which page is active.
 */
export function GlobalNotifications() {
  const allMatches = useArenaStore(s => s.allMatches);
  const getAgentByAddress = useAgentStore(s => s.getAgentByAddress);

  const getHandle = useCallback(
    (address: string) =>
      getAgentByAddress(address)?.moltbookHandle ?? truncateAddress(address),
    [getAgentByAddress],
  );

  useMatchNotifications(allMatches, getHandle);

  return null;
}
