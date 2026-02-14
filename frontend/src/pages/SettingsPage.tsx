import { useState } from 'react';
import clsx from 'clsx';
import {
  Palette, Bell, BellOff, BellRing, Volume2, VolumeX,
  Star, UserCheck, Trash2, Download, Upload, Shield, Monitor, Keyboard,
} from 'lucide-react';
import { RetroHeading } from '@/components/arcade/RetroHeading';
import { NeonButton } from '@/components/arcade/NeonButton';
import { GlowBadge } from '@/components/arcade/GlowBadge';
import { Breadcrumbs } from '@/components/arcade/Breadcrumbs';
import { useThemeStore } from '@/stores/themeStore';
import { useFavoritesStore } from '@/stores/favoritesStore';
import { useFollowingStore } from '@/stores/followingStore';
import { useActivityFeedStore } from '@/stores/activityFeedStore';
import { useQuestStore } from '@/stores/questStore';
import { usePredictionsStore } from '@/stores/predictionsStore';
import { useNotifications } from '@/hooks/useNotifications';

type Theme = 'dark' | 'light' | 'arcade';

const themes: { value: Theme; label: string; desc: string }[] = [
  { value: 'arcade', label: 'Arcade', desc: 'Neon & retro gaming vibes' },
  { value: 'dark', label: 'Dark', desc: 'Clean dark interface' },
  { value: 'light', label: 'Light', desc: 'Light background theme' },
];

// ── Section wrapper ──────────────────────────────────────────────────────

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="arcade-card p-5 mb-5">
      <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-4 flex items-center gap-2">
        <Icon size={15} className="text-arcade-purple" style={{ filter: 'drop-shadow(0 0 3px rgba(168,85,247,0.4))' }} />
        {title}
      </h2>
      {children}
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-white font-medium">{label}</div>
        {description && <div className="text-[10px] text-gray-500 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0 ml-4">{children}</div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

export function SettingsPage() {
  // ── Stores ──
  const { theme, setTheme } = useThemeStore();
  const { favoriteAgents, clearFavorites } = useFavoritesStore();
  const { followingAgents, clearFollowing } = useFollowingStore();
  const { soundEnabled, toggleSound } = useActivityFeedStore();
  const { totalXP, level } = useQuestStore();
  const predictions = usePredictionsStore(s => s.predictions);
  const clearOld = usePredictionsStore(s => s.clearOld);
  const { permission, isSupported, requestPermission } = useNotifications();

  const [confirmClear, setConfirmClear] = useState<string | null>(null);

  // ── Data export / import ──
  const exportData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      theme,
      favorites: favoriteAgents,
      following: followingAgents,
      soundEnabled,
      questStore: localStorage.getItem('quest-store'),
      predictionsStore: localStorage.getItem('predictions-store'),
      templates: localStorage.getItem('arenaforge-tournament-templates'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arenaforge-settings-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string);
          if (data.theme) setTheme(data.theme);
          if (data.questStore) localStorage.setItem('quest-store', data.questStore);
          if (data.predictionsStore) localStorage.setItem('predictions-store', data.predictionsStore);
          if (data.templates) localStorage.setItem('arenaforge-tournament-templates', data.templates);
          alert('Settings imported! Reload the page for all changes to take effect.');
        } catch {
          alert('Invalid settings file.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClear = (key: string, action: () => void) => {
    if (confirmClear === key) {
      action();
      setConfirmClear(null);
    } else {
      setConfirmClear(key);
      setTimeout(() => setConfirmClear(null), 3000);
    }
  };

  // ── Keyboard shortcuts ──
  const shortcuts = [
    { keys: '⌘ K', desc: 'Open command palette' },
    { keys: '?', desc: 'Show keyboard shortcuts' },
    { keys: 'Esc', desc: 'Close modals & drawers' },
  ];

  return (
    <div>
      <Breadcrumbs crumbs={[{ label: 'Settings' }]} />
      <RetroHeading level={1} color="purple" subtitle="Manage your ArenaForge experience">
        SETTINGS
      </RetroHeading>

      {/* ── Appearance ── */}
      <Section icon={Palette} title="Appearance">
        <SettingRow label="Theme" description="Choose your visual theme">
          <div className="flex gap-2">
            {themes.map(t => (
              <button
                key={t.value}
                onClick={() => setTheme(t.value)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  theme === t.value
                    ? 'bg-arcade-purple/20 text-arcade-purple border border-arcade-purple/40'
                    : 'bg-surface-2 text-gray-400 border border-white/[0.04] hover:text-white',
                )}
                title={t.desc}
              >
                {t.label.toUpperCase()}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      {/* ── Notifications ── */}
      <Section icon={Bell} title="Notifications">
        <SettingRow
          label="Browser Notifications"
          description={
            !isSupported ? 'Not supported in this browser' :
            permission === 'granted' ? 'You\'ll receive alerts for match events' :
            permission === 'denied' ? 'Blocked — update in browser settings' :
            'Enable to get match & tournament alerts'
          }
        >
          {!isSupported ? (
            <GlowBadge color="red" label="UNSUPPORTED" />
          ) : permission === 'granted' ? (
            <div className="flex items-center gap-2">
              <BellRing size={14} className="text-arcade-green" />
              <GlowBadge color="green" label="ENABLED" />
            </div>
          ) : permission === 'denied' ? (
            <div className="flex items-center gap-2">
              <BellOff size={14} className="text-red-400" />
              <GlowBadge color="red" label="BLOCKED" />
            </div>
          ) : (
            <NeonButton variant="neon" color="purple" onClick={requestPermission} className="text-[10px] px-3 py-1">
              ENABLE
            </NeonButton>
          )}
        </SettingRow>

        <SettingRow label="Activity Feed Sound" description="Play a sound when new events arrive">
          <button
            onClick={toggleSound}
            className={clsx(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              soundEnabled
                ? 'bg-arcade-green/10 text-arcade-green border border-arcade-green/30'
                : 'bg-surface-2 text-gray-500 border border-white/[0.04]',
            )}
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </SettingRow>
      </Section>

      {/* ── Social ── */}
      <Section icon={UserCheck} title="Social Data">
        <SettingRow
          label="Favorites"
          description={`${favoriteAgents.length} agent${favoriteAgents.length !== 1 ? 's' : ''} saved`}
        >
          <button
            onClick={() => handleClear('favorites', clearFavorites)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              confirmClear === 'favorites'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-surface-2 text-gray-400 border border-white/[0.04] hover:text-red-400',
            )}
            disabled={favoriteAgents.length === 0}
          >
            <Trash2 size={12} />
            {confirmClear === 'favorites' ? 'CONFIRM?' : 'CLEAR'}
          </button>
        </SettingRow>

        <SettingRow
          label="Following"
          description={`${followingAgents.length} agent${followingAgents.length !== 1 ? 's' : ''} followed`}
        >
          <button
            onClick={() => handleClear('following', clearFollowing)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              confirmClear === 'following'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-surface-2 text-gray-400 border border-white/[0.04] hover:text-red-400',
            )}
            disabled={followingAgents.length === 0}
          >
            <Trash2 size={12} />
            {confirmClear === 'following' ? 'CONFIRM?' : 'CLEAR'}
          </button>
        </SettingRow>
      </Section>

      {/* ── Progress ── */}
      <Section icon={Star} title="Progress & Stats">
        <SettingRow label="Quest Level" description={`${totalXP} total XP earned`}>
          <GlowBadge color="gold" label={`LVL ${level}`} />
        </SettingRow>
        <SettingRow label="Predictions" description={`${predictions.length} predictions made`}>
          <button
            onClick={() => handleClear('predictions', clearOld)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
              confirmClear === 'predictions'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-surface-2 text-gray-400 border border-white/[0.04] hover:text-red-400',
            )}
            disabled={predictions.length === 0}
          >
            <Trash2 size={12} />
            {confirmClear === 'predictions' ? 'CONFIRM?' : 'CLEAR OLD'}
          </button>
        </SettingRow>
      </Section>

      {/* ── Data Management ── */}
      <Section icon={Shield} title="Data Management">
        <SettingRow label="Export Settings" description="Download all settings & progress as JSON">
          <NeonButton variant="neon" color="cyan" onClick={exportData} className="text-[10px] px-3 py-1">
            <span className="flex items-center gap-1">
              <Download size={12} />
              EXPORT
            </span>
          </NeonButton>
        </SettingRow>
        <SettingRow label="Import Settings" description="Restore from a previously exported file">
          <NeonButton variant="neon" color="purple" onClick={importData} className="text-[10px] px-3 py-1">
            <span className="flex items-center gap-1">
              <Upload size={12} />
              IMPORT
            </span>
          </NeonButton>
        </SettingRow>
      </Section>

      {/* ── Keyboard Shortcuts ── */}
      <Section icon={Keyboard} title="Keyboard Shortcuts">
        {shortcuts.map(s => (
          <SettingRow key={s.keys} label={s.desc}>
            <kbd className="px-2 py-0.5 bg-surface-2 border border-white/[0.08] rounded text-[10px] font-mono text-gray-400">
              {s.keys}
            </kbd>
          </SettingRow>
        ))}
      </Section>

      {/* ── About ── */}
      <Section icon={Monitor} title="About">
        <SettingRow label="ArenaForge" description="Autonomous AI Gaming Arena on Monad">
          <GlowBadge color="purple" label="v1.0" />
        </SettingRow>
        <SettingRow label="Storage Used" description="Local data stored in your browser">
          <span className="text-xs font-mono text-gray-400">
            {(() => {
              let total = 0;
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) total += (localStorage.getItem(key) ?? '').length;
              }
              return total > 1024 ? `${(total / 1024).toFixed(1)} KB` : `${total} B`;
            })()}
          </span>
        </SettingRow>
      </Section>
    </div>
  );
}
