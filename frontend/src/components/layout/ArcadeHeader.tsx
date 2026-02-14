import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Gamepad2, Trophy, Crown, Dna, Eye, BarChart3, Award, Coins, Radio, Menu, X, Activity, Medal, Star, Search } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import clsx from 'clsx';
import { ChainStatus } from '@/components/arcade/ChainStatus';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ActivityBellButton } from '@/components/activity/ActivityBellButton';
import { NotificationSettings } from '@/components/notifications/NotificationSettings';

const navItems = [
  { path: '/', label: 'LOBBY', icon: Gamepad2 },
  { path: '/dashboard', label: 'DASHBOARD', icon: Activity },
  { path: '/spectator', label: 'SPECTATOR', icon: Eye },
  { path: '/leaderboard', label: 'RANKINGS', icon: Crown },
  { path: '/evolution', label: 'EVOLUTION', icon: Dna },
  { path: '/analytics', label: 'ANALYTICS', icon: BarChart3 },
  { path: '/token', label: 'TOKEN', icon: Coins },
  { path: '/a2a', label: 'A2A', icon: Radio },
  { path: '/season', label: 'SEASON', icon: Medal },
  { path: '/favorites', label: 'FAVORITES', icon: Star },
  { path: '/achievements', label: 'ACHIEVEMENTS', icon: Award },
];

export function ArcadeHeader() {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header
        className={clsx(
          'sticky top-0 z-40 transition-all duration-300 relative',
          scrolled ? 'bg-surface-0/80 backdrop-blur-xl border-b border-white/[0.04]' : 'bg-transparent',
        )}
      >
        {/* Scroll progress bar */}
        {scrollProgress > 0 && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-transparent z-50">
            <div
              className="h-full transition-[width] duration-100 ease-out"
              style={{
                width: `${scrollProgress}%`,
                background: 'linear-gradient(to right, #a855f7, #22d3ee)',
              }}
            />
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <Trophy size={22} className="text-arcade-purple group-hover:animate-bounce-subtle" style={{ filter: 'drop-shadow(0 0 4px rgba(168,85,247,0.5))' }} />
              <span className="font-pixel text-sm neon-text-purple tracking-wider">
                ARENAFORGE
              </span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                      'relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold tracking-wider transition-all duration-300',
                      isActive
                        ? 'text-arcade-purple bg-arcade-purple/10 border border-arcade-purple/30'
                        : 'text-gray-400 hover:text-white hover:bg-surface-3',
                    )}
                  >
                    <item.icon size={14} />
                    {item.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-arcade-purple rounded-full" style={{ boxShadow: '0 0 4px rgba(168,85,247,0.5)' }} />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right side */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-gray-400 hover:text-arcade-purple transition-colors rounded-lg hover:bg-surface-3 border border-white/[0.06]"
                title="Search (⌘K)"
                aria-label="Open search"
              >
                <Search size={13} />
                <span className="text-[10px] font-mono text-gray-600">⌘K</span>
              </button>
              <NotificationSettings compact />
              <ActivityBellButton />
              <ThemeToggle />
              <ChainStatus />
              <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  openAccountModal,
                  openChainModal,
                  openConnectModal,
                  mounted,
                }) => {
                  const ready = mounted;
                  const connected = ready && account && chain;

                  return (
                    <div
                      {...(!ready && {
                        'aria-hidden': true,
                        style: {
                          opacity: 0,
                          pointerEvents: 'none',
                          userSelect: 'none',
                        },
                      })}
                    >
                      {(() => {
                        if (!connected) {
                          return (
                            <button
                              onClick={openConnectModal}
                              className="btn-neon btn-neon-purple text-xs px-4 py-2"
                            >
                              PRESS START
                            </button>
                          );
                        }

                        if (chain.unsupported) {
                          return (
                            <button
                              onClick={openChainModal}
                              className="btn-neon btn-neon-red text-xs px-4 py-2"
                            >
                              WRONG NETWORK
                            </button>
                          );
                        }

                        return (
                          <button
                            onClick={openAccountModal}
                            className="btn-neon btn-neon-green text-xs px-4 py-2 flex items-center gap-2"
                          >
                            <span className="w-2 h-2 rounded-full bg-arcade-green animate-pulse" style={{ boxShadow: '0 0 4px rgba(105,240,174,0.6)' }} />
                            {account.displayName}
                          </button>
                        );
                      })()}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-gray-400 hover:text-white p-2"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Mobile nav */}
          {mobileOpen && (
            <nav className="md:hidden pb-4 pt-2 border-t border-white/[0.06] animate-fade-in-down">
              {navItems.map((item) => {
                const isActive = item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={clsx(
                      'flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-colors',
                      isActive ? 'text-arcade-purple bg-arcade-purple/10' : 'text-gray-400',
                    )}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.04] mt-2">
                <ChainStatus />
                <div className="flex items-center gap-2">
                  <NotificationSettings compact />
                  <ActivityBellButton />
                  <ThemeToggle />
                </div>
              </div>
              <div className="px-4 mt-2">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    mounted,
                  }) => {
                    const ready = mounted;
                    const connected = ready && account && chain;

                    return (
                      <div
                        {...(!ready && {
                          'aria-hidden': true,
                          style: {
                            opacity: 0,
                            pointerEvents: 'none',
                            userSelect: 'none',
                          },
                        })}
                      >
                        {(() => {
                          if (!connected) {
                            return (
                              <button
                                onClick={() => { setMobileOpen(false); openConnectModal(); }}
                                className="w-full btn-neon btn-neon-purple text-xs px-4 py-3"
                              >
                                PRESS START
                              </button>
                            );
                          }

                          if (chain.unsupported) {
                            return (
                              <button
                                onClick={openChainModal}
                                className="w-full btn-neon btn-neon-red text-xs px-4 py-3"
                              >
                                WRONG NETWORK
                              </button>
                            );
                          }

                          return (
                            <button
                              onClick={openAccountModal}
                              className="w-full btn-neon btn-neon-green text-xs px-4 py-3 flex items-center justify-center gap-2"
                            >
                              <span className="w-2 h-2 rounded-full bg-arcade-green animate-pulse" style={{ boxShadow: '0 0 4px rgba(105,240,174,0.6)' }} />
                              {account.displayName}
                            </button>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </nav>
          )}
        </div>
      </header>
    </>
  );
}
