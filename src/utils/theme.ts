/**
 * Shared design tokens
 */
import type { PropertyLabel } from '../types/gmail';

export const colors = {
  white: '#ffffff',
  navy50: '#eff6ff',
  navy400: '#60a5fa',
  navy700: '#1d4ed8',
  navy900: '#1e3a5f',
  ink50: '#f8fafc',
  ink200: '#e2e8f0',
  ink400: '#94a3b8',
  ink600: '#64748b',
  ink900: '#1e293b',
  coral500: '#f97066',
  coral50: '#fef2f2',
  green50: '#ecfdf5',
  green500: '#22c55e',
  greenDark: '#15803d',
  amber500: '#eab308',
  amber50: '#fefce8',
  amberDark: '#a16207',
};

export function labelColor(l: PropertyLabel): string {
  switch (l) {
    case 'available': return colors.green500;
    case 'processing': return colors.amber500;
    case 'rented': return colors.coral500;
    case 'none': return colors.ink200;
  }
}

export function labelTint(l: PropertyLabel): { bg: string; fg: string } {
  switch (l) {
    case 'available': return { bg: colors.green50, fg: colors.greenDark };
    case 'processing': return { bg: colors.amber50, fg: colors.amberDark };
    case 'rented': return { bg: colors.coral50, fg: colors.coral500 };
    case 'none': return { bg: colors.ink50, fg: colors.ink600 };
  }
}

export const typography = {
  heading: { fontSize: 20 as const, fontWeight: '600' as const },
  subheading: { fontSize: 16 as const, fontWeight: '600' as const },
  body: { fontSize: 16 as const, fontWeight: '400' as const },
  caption: { fontSize: 14 as const, fontWeight: '400' as const, lineHeight: 20 as const },
  small: { fontSize: 12 as const, fontWeight: '600' as const },
  label: { fontSize: 12 as const, fontWeight: '500' as const },
  tabLabel: { fontSize: 10 as const, fontWeight: '500' as const },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const radii = {
  sm: 6,
  md: 8,
  lg: 12,
} as const;

export const badgeStyles = {
  'live-now': { bg: colors.green50, text: colors.greenDark },
  upcoming: { bg: colors.navy50, text: colors.navy700 },
  'wants-to-apply': { bg: colors.green50, text: colors.greenDark },
  waiting: { bg: colors.ink50, text: colors.ink600 },
  touring: { bg: colors.green50, text: colors.greenDark },
} as const;

const avatarColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#0ea5e9', '#e11d48', '#7c3aed'];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
