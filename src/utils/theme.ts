/**
 * OpenQ Design Language
 * Centralized theme tokens — colors, typography, spacing, radii
 */

export const colors = {
  // Navy (Primary)
  navy900: '#1A2B4A',
  navy700: '#2D4A7A',
  navy400: '#4A7AB5',
  navy100: '#C8DAF0',
  navy50: '#EDF2F9',

  // Coral (Accent)
  coral500: '#E8734A',
  coral300: '#F4A882',
  coral50: '#FDEEE7',

  // Green (Success)
  green500: '#1B9E6D',
  green50: '#E5F5EE',

  // Ink (Neutral)
  ink900: '#111318',
  ink600: '#4A4D57',
  ink400: '#8C8F99',
  ink200: '#D4D5DA',
  ink50: '#F5F5F7',

  // Static
  white: '#FFFFFF',

  // Semantic badge text colors
  greenDark: '#0F6E56',
  coralDark: '#993C1D',
} as const;

export const typography = {
  display:    { fontSize: 28, fontWeight: '500' as const, lineHeight: 34 },
  heading:    { fontSize: 20, fontWeight: '500' as const, lineHeight: 26 },
  subheading: { fontSize: 16, fontWeight: '500' as const, lineHeight: 22 },
  body:       { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  caption:    { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  label:      { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  small:      { fontSize: 11, fontWeight: '500' as const, lineHeight: 13 },
  tabLabel:   { fontSize: 10, fontWeight: '500' as const },
} as const;

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
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// Badge configs keyed by status
export const badgeStyles = {
  'wants-to-apply': { bg: colors.green50, text: colors.greenDark },
  'browsing':       { bg: colors.navy50, text: colors.navy700 },
  'not-interested': { bg: colors.coral50, text: colors.coralDark },
  'pending':        { bg: colors.ink50, text: colors.ink400 },
  'live-now':       { bg: colors.green50, text: colors.greenDark },
  'upcoming':       { bg: colors.navy50, text: colors.navy700 },
  'ended':          { bg: colors.ink50, text: colors.ink400 },
  // Waitlist statuses
  'waiting':        { bg: colors.navy50, text: colors.navy700 },
  'touring':        { bg: colors.green50, text: colors.greenDark },
  'completed':      { bg: colors.ink50, text: colors.ink400 },
  'skipped':        { bg: colors.coral50, text: colors.coralDark },
  'no-show':        { bg: colors.coral50, text: colors.coralDark },
} as const;

// Avatar color rotation — assigned by hashing name
const avatarColors = [colors.navy400, colors.coral500, colors.green500, colors.navy700, colors.ink400];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
