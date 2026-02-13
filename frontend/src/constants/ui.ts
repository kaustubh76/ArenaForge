export const ANIMATION_DELAY_BASE = 0.08;
export const ANIMATION_DELAY_STAGGER = 0.12;
export const COUNTDOWN_WARNING_THRESHOLD = 60;

export const ELO_DEFAULT = 1200;

export const ELO_TIERS = {
  bronze: { min: 1000, max: 1299, label: 'Bronze', cssClass: 'elo-bronze' },
  silver: { min: 1300, max: 1499, label: 'Silver', cssClass: 'elo-silver' },
  gold: { min: 1500, max: 1799, label: 'Gold', cssClass: 'elo-gold' },
  diamond: { min: 1800, max: 2099, label: 'Diamond', cssClass: 'elo-diamond' },
  master: { min: 2100, max: Infinity, label: 'Master', cssClass: 'elo-master' },
} as const;

export function getEloTier(elo: number) {
  if (elo >= ELO_TIERS.master.min) return ELO_TIERS.master;
  if (elo >= ELO_TIERS.diamond.min) return ELO_TIERS.diamond;
  if (elo >= ELO_TIERS.gold.min) return ELO_TIERS.gold;
  if (elo >= ELO_TIERS.silver.min) return ELO_TIERS.silver;
  return ELO_TIERS.bronze;
}

export const MONAD_EXPLORER_URL = 'https://explorer.monad.xyz';

export const PRIZE_DISTRIBUTION = {
  elimination: { first: 0.6, second: 0.25, third: 0.15 },
  arenaFee: 0.05,
} as const;

export function formatMON(amount: string): string {
  const num = parseFloat(amount);
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K MON`;
  return `${num.toFixed(2)} MON`;
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
