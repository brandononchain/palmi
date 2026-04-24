import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, typography } from '../theme/tokens';

/**
 * palmi brand marks — the circular ring+dot is rendered as SVG so it stays
 * crisp at any size. The wordmark is a layout composition so it uses the
 * already-loaded Fraunces font (text inside react-native-svg does not
 * render custom fonts reliably across iOS/Android).
 *
 * Keep them quiet. No drop shadows, no gradients.
 */

interface MarkProps {
  size?: number;
  /** Override the dot color. Defaults to theme accent. */
  accent?: string;
  /** Override the ring color. Defaults to theme ink. */
  ring?: string;
  style?: ViewStyle;
}

/** Circular brand mark — ring with a warm rose dot. */
export function PalmiMark({
  size = 28,
  accent = colors.accent,
  ring = colors.ink,
  style,
}: MarkProps) {
  const strokeWidth = (size / 120) * 6;
  return (
    <View style={style} accessibilityRole="image" accessibilityLabel="palmi">
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={40} fill="none" stroke={ring} strokeWidth={strokeWidth} />
        <Circle cx={60} cy={60} r={20} fill={accent} />
      </Svg>
    </View>
  );
}

interface WordmarkProps {
  /** Wordmark type size. Mark scales to match. */
  size?: number;
  accent?: string;
  ink?: string;
  /** Show the mark on the left. Defaults to true. */
  withMark?: boolean;
  style?: ViewStyle;
}

/** Full palmi wordmark: circular mark + "palmi" set in Fraunces. */
export function PalmiWordmark({
  size = 36,
  accent = colors.accent,
  ink = colors.ink,
  withMark = true,
  style,
}: WordmarkProps) {
  const markSize = Math.round(size * 1.05);
  return (
    <View style={[styles.wordmark, style]}>
      {withMark ? <PalmiMark size={markSize} accent={accent} ring={ink} /> : null}
      <Text
        style={{
          fontFamily: typography.fontSerif,
          fontSize: size,
          color: ink,
          letterSpacing: -size * 0.03,
          lineHeight: size * 1.05,
          includeFontPadding: false,
        }}
      >
        palmi
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
