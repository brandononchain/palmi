import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { PalmiWordmark } from '@/components/Brand';
import { colors, spacing, typography } from '@/theme/tokens';

// A quiet, interactive constellation. 7 dots drift gently.
// Tapping one makes it pulse and briefly nudge neighbors — a tiny
// metaphor for the 2–15 people in a circle.
const DOT_COLORS = ['#E8C5A0', '#B8B0D8', '#C9D8B8', '#E6B8B8', '#B8D1E0', '#D8C4A0', '#D65745'];
// Normalized positions (−1..1) arranged as a loose ring with one off-center.
const DOT_POSITIONS: { x: number; y: number; size: number }[] = [
  { x: 0, y: -1, size: 22 },
  { x: 0.9, y: -0.35, size: 16 },
  { x: 0.7, y: 0.7, size: 20 },
  { x: -0.1, y: 1, size: 14 },
  { x: -0.85, y: 0.55, size: 18 },
  { x: -0.95, y: -0.45, size: 14 },
  { x: 0.15, y: 0.05, size: 28 }, // center-ish anchor
];

function Constellation() {
  const drifts = useRef(DOT_POSITIONS.map(() => new Animated.Value(0))).current;
  const pulses = useRef(DOT_POSITIONS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    const loops = drifts.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 3200 + i * 280,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 3200 + i * 280,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [drifts]);

  const onTap = (i: number) => {
    const pulse = pulses[i];
    if (!pulse) return;
    Animated.sequence([
      Animated.spring(pulse, {
        toValue: 1.35,
        useNativeDriver: true,
        speed: 24,
        bounciness: 10,
      }),
      Animated.spring(pulse, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 8 }),
    ]).start();
  };

  // Canvas is 220×180; dots are absolutely positioned from the center.
  const W = 240;
  const H = 180;

  return (
    <View style={styles.canvas}>
      <View style={{ width: W, height: H }}>
        {DOT_POSITIONS.map((p, i) => {
          const driftValue = drifts[i];
          const pulseValue = pulses[i];
          if (!driftValue || !pulseValue) return null;
          const drift = driftValue.interpolate({
            inputRange: [0, 1],
            outputRange: [-4, 4],
          });
          const driftX = driftValue.interpolate({
            inputRange: [0, 1],
            outputRange: [i % 2 === 0 ? -3 : 3, i % 2 === 0 ? 3 : -3],
          });
          const cx = W / 2 + p.x * (W / 2 - p.size);
          const cy = H / 2 + p.y * (H / 2 - p.size);
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: cx - p.size / 2,
                top: cy - p.size / 2,
                transform: [{ translateX: driftX }, { translateY: drift }, { scale: pulseValue }],
              }}
            >
              <Pressable onPress={() => onTap(i)} hitSlop={10}>
                <View
                  style={{
                    width: p.size,
                    height: p.size,
                    borderRadius: p.size / 2,
                    backgroundColor: DOT_COLORS[i % DOT_COLORS.length],
                  }}
                />
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.content}>
        <PalmiWordmark size={26} style={styles.wordmark} />

        <View style={styles.hero}>
          <Text style={styles.title}>
            a quiet place{'\n'}for your <Text style={styles.titleItalic}>people</Text>.
          </Text>
          <Text style={styles.lede}>
            palmi is a quiet place for the people who actually know you. 2–15 friends. no feeds, no
            followers, no performance.
          </Text>
        </View>

        <Constellation />

        <View style={styles.bottom}>
          <View style={styles.actions}>
            <Button
              onPress={() => router.push({ pathname: '/(auth)/phone', params: { mode: 'signup' } })}
            >
              Sign up
            </Button>
            <Button
              variant="secondary"
              onPress={() => router.push({ pathname: '/(auth)/phone', params: { mode: 'signin' } })}
            >
              Sign in
            </Button>
          </View>

          <Text style={styles.footer}>
            By continuing, you agree to our terms and privacy policy.{'\n'}
            No spam. Ever.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  wordmark: {
    marginBottom: spacing.xl,
  },
  hero: {
    gap: spacing.md,
  },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display + 10,
    color: colors.ink,
    lineHeight: (typography.display + 10) * typography.lineTight,
    letterSpacing: typography.trackTight,
  },
  titleItalic: {
    fontFamily: typography.fontSerifItalic,
    color: colors.accent,
  },
  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
    maxWidth: 320,
  },
  canvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    gap: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
  },
  footer: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: typography.micro * typography.lineRelaxed,
  },
});
