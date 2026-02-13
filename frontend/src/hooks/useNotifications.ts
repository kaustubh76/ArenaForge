import { useState, useEffect, useCallback } from 'react';
import { Match, MatchStatus } from '@/types/arena';

interface NotificationPermissionState {
  permission: NotificationPermission;
  isSupported: boolean;
}

interface UseNotificationsReturn {
  permission: NotificationPermission;
  isSupported: boolean;
  requestPermission: () => Promise<NotificationPermission>;
  notifyMatchComplete: (match: Match, winnerHandle: string) => void;
  notifyMatchStarting: (tournamentName: string, matchId: number) => void;
  notifyTournamentComplete: (tournamentName: string, winnerHandle: string) => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [state, setState] = useState<NotificationPermissionState>({
    permission: 'default',
    isSupported: false,
  });

  useEffect(() => {
    const isSupported = 'Notification' in window;
    setState({
      permission: isSupported ? Notification.permission : 'denied',
      isSupported,
    });
  }, []);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!state.isSupported) {
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      setState((prev) => ({ ...prev, permission }));
      return permission;
    } catch (err) {
      console.error('Failed to request notification permission:', err);
      return 'denied';
    }
  }, [state.isSupported]);

  const showNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (!state.isSupported || state.permission !== 'granted') {
        return;
      }

      try {
        const notification = new Notification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...options,
        });

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);

        // Handle click - focus window
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      } catch (err) {
        console.error('Failed to show notification:', err);
      }
    },
    [state.isSupported, state.permission]
  );

  const notifyMatchComplete = useCallback(
    (match: Match, winnerHandle: string) => {
      if (match.status !== MatchStatus.Completed) return;

      const isDraw = !match.winner;
      const title = isDraw ? 'Match Ended in Draw' : 'Match Complete';
      const body = isDraw
        ? `Match #${match.id} ended in a draw!`
        : `${winnerHandle} won Match #${match.id}!`;

      showNotification(title, {
        body,
        tag: `match-${match.id}`,
      });
    },
    [showNotification]
  );

  const notifyMatchStarting = useCallback(
    (tournamentName: string, matchId: number) => {
      showNotification('Match Starting', {
        body: `Your match in ${tournamentName} is about to begin!`,
        tag: `match-start-${matchId}`,
        requireInteraction: true,
      });
    },
    [showNotification]
  );

  const notifyTournamentComplete = useCallback(
    (tournamentName: string, winnerHandle: string) => {
      showNotification('Tournament Complete', {
        body: `${winnerHandle} won ${tournamentName}!`,
        tag: `tournament-complete-${tournamentName}`,
      });
    },
    [showNotification]
  );

  return {
    permission: state.permission,
    isSupported: state.isSupported,
    requestPermission,
    notifyMatchComplete,
    notifyMatchStarting,
    notifyTournamentComplete,
  };
}

// Hook to track matches and auto-notify on completion
export function useMatchNotifications(
  matches: Match[],
  getAgentHandle: (address: string) => string
) {
  const { permission, notifyMatchComplete } = useNotifications();
  const [notifiedMatches, setNotifiedMatches] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (permission !== 'granted') return;

    const completedMatches = matches.filter(
      (m) => m.status === MatchStatus.Completed && !notifiedMatches.has(m.id)
    );

    for (const match of completedMatches) {
      const winnerHandle = match.winner ? getAgentHandle(match.winner) : 'Draw';
      notifyMatchComplete(match, winnerHandle);
      setNotifiedMatches((prev) => new Set(prev).add(match.id));
    }
  }, [matches, permission, notifiedMatches, notifyMatchComplete, getAgentHandle]);
}
