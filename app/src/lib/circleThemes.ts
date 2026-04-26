import { colors } from '@/theme/tokens';

export type CircleThemeKey = 'paper' | 'evening' | 'forest' | 'garden';

export interface CircleThemeDefinition {
  key: CircleThemeKey;
  label: string;
  note: string;
  cardBg: string;
  accent: string;
  ink: string;
}

export const circleThemes: Record<CircleThemeKey, CircleThemeDefinition> = {
  paper: {
    key: 'paper',
    label: 'paper',
    note: 'warm, quiet, close to the default palmi feel',
    cardBg: '#F4F1EB',
    accent: colors.accent,
    ink: colors.ink,
  },
  evening: {
    key: 'evening',
    label: 'evening',
    note: 'inkier and softer for late-night groups',
    cardBg: '#ECE8E4',
    accent: '#8B6C63',
    ink: '#201A18',
  },
  forest: {
    key: 'forest',
    label: 'forest',
    note: 'cooler and steadier, good for routines',
    cardBg: '#EAF0E8',
    accent: '#5A7A61',
    ink: '#183020',
  },
  garden: {
    key: 'garden',
    label: 'garden',
    note: 'a lighter, brighter version for playful circles',
    cardBg: '#F4ECE3',
    accent: '#B96A4C',
    ink: '#35231C',
  },
};

export function getCircleTheme(key?: string | null): CircleThemeDefinition {
  if (!key) return circleThemes.paper;
  return circleThemes[(key as CircleThemeKey) ?? 'paper'] ?? circleThemes.paper;
}
