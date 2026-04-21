/**
 * palmi design tokens
 *
 * Calm, chronological, quiet. Every choice here should ladder up to:
 *   "Would this look noisy on a Sunday morning?"
 *
 * Rules we're holding to:
 *   - No gradients. Ever.
 *   - No shadows on surfaces. Use 1px borders instead.
 *   - One accent color. Warm rose. Used sparingly.
 *   - Generous whitespace. Silence is the feature.
 *   - Motion: fade-up only, 80ms stagger, 300ms duration, spring easing.
 */

export const colors = {
  // Backgrounds
  bg: '#FAF9F6',          // off-white warm base
  bgPanel: '#F4F1EB',     // subtle panel for question card backgrounds
  bgCard: '#FFFFFF',      // post cards

  // Text
  ink: '#1A1A1A',         // near-black, never pure #000
  inkMuted: '#6B6760',    // secondary text
  inkFaint: '#A5A099',    // timestamps, metadata

  // Borders
  border: '#E8E4DE',      // default divider
  borderStrong: '#D8D3CB', // emphasized divider (hover/focus)

  // Accent
  accent: '#D65745',      // warm rose. Used for: accepted actions, owner badges.
  accentHover: '#BE4A38',

  // Semantic
  danger: '#D14343',
  success: '#5A8F5A',

  // Reaction colors (muted, not vivid)
  reactionHeart: '#D65745',
  reactionLaugh: '#C4A55C',
  reactionWow: '#8B7FB8',
  reactionSupport: '#6B9178',
} as const;

export const typography = {
  // Font families - load via expo-font in _layout.tsx
  // Display: a warm editorial serif (Fraunces variable)
  // Body:    Inter for clarity at small sizes
  fontSerif: 'Fraunces_400Regular',
  fontSerifItalic: 'Fraunces_400Regular_Italic',
  fontSans: 'Inter_400Regular',
  fontSansMedium: 'Inter_500Medium',

  // Sizes (rn doesn't respect rem)
  display: 34,       // H1 / hero
  title: 24,         // section headers
  subtitle: 18,      // subtitles, card titles
  body: 16,          // default text
  caption: 14,       // secondary
  micro: 12,         // timestamps, labels

  // Line heights (multipliers of size)
  lineTight: 1.1,
  lineNormal: 1.4,
  lineRelaxed: 1.55,

  // Tracking (letter-spacing)
  trackTight: -0.5,  // display
  trackNormal: 0,
  trackWide: 0.5,    // ALL CAPS labels (rarely used)
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,    // default card
  xl: 28,    // hero surfaces
  full: 999, // pills
} as const;

export const motion = {
  // Only two durations in the entire app.
  duration: 300,
  durationLong: 600,

  // One easing. Spring physics feel better than eased cubic but reanimated
  // springs take config, so we define the canonical one here.
  spring: {
    damping: 18,
    stiffness: 140,
    mass: 1,
  },

  // Stagger between list items on mount
  stagger: 80,
} as const;

export type ColorKey = keyof typeof colors;
