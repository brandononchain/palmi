import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/tokens';

import { Button } from './Button';

export type UpgradeVariant =
  | 'circles-cap'
  | 'recap-history'
  | 'memory-search'
  | 'reflection'
  | 'themes'
  | 'circle-paid';

interface UpgradeSheetProps {
  visible: boolean;
  variant: UpgradeVariant;
  onClose: () => void;
  onUpgrade: () => void | Promise<void>;
  loading?: boolean;
}

const COPY: Record<
  UpgradeVariant,
  { eyebrow: string; headline: string; body: string; cta: string }
> = {
  'circles-cap': {
    eyebrow: 'two circles is the free tier',
    headline: 'need room for a few more?',
    body: 'palmi premium raises the cap to ten, keeps your recaps forever, and unlocks a quiet monthly look back. four dollars a month.',
    cta: 'upgrade to premium · $4/mo',
  },
  'recap-history': {
    eyebrow: 'older recaps are premium',
    headline: 'every month you&rsquo;ve had together.',
    body: 'premium keeps the full history, lets you search your own answers across every circle, and exports a yearbook when you want one.',
    cta: 'unlock history · $4/mo',
  },
  'memory-search': {
    eyebrow: 'memory search is premium',
    headline: 'remember what you said.',
    body: 'premium lets you search every answer and post you&rsquo;ve ever written across your circles, and export it all when you&rsquo;re ready.',
    cta: 'upgrade to premium · $4/mo',
  },
  reflection: {
    eyebrow: 'monthly reflection is premium',
    headline: 'a quiet look back, just for you.',
    body: 'once a month, palmi reads what you shared and writes a short private paragraph. yours alone. $4 a month.',
    cta: 'upgrade to premium · $4/mo',
  },
  themes: {
    eyebrow: 'themes are a premium touch',
    headline: 'make this circle feel like yours.',
    body: 'paper, evening, forest, garden. premium owners can change the feel of any circle they host.',
    cta: 'upgrade to premium · $4/mo',
  },
  'circle-paid': {
    eyebrow: 'make this circle paid',
    headline: 'a place that remembers better.',
    body: 'weekly recaps, a co-host, participation insights, pinned memories, custom onboarding. fifteen a month, host pays, members stay free.',
    cta: 'upgrade this circle · $15/mo',
  },
};

/**
 * Calm upgrade bottom sheet. Serif headline, one sentence, one CTA.
 * Never an interstitial; always dismissible via backdrop or the close affordance.
 */
export function UpgradeSheet({
  visible,
  variant,
  onClose,
  onUpgrade,
  loading,
}: UpgradeSheetProps): ReactNode {
  const copy = COPY[variant];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="close">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.eyebrow}>{copy.eyebrow}</Text>
            <Text style={styles.headline}>{copy.headline.replace(/&rsquo;/g, '\u2019')}</Text>
            <Text style={styles.body}>{copy.body}</Text>

            <View style={styles.ctaWrap}>
              <Button onPress={() => void onUpgrade()} loading={loading}>
                {copy.cta}
              </Button>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={styles.dismiss}
                accessibilityRole="button"
                accessibilityLabel="not now"
              >
                <Text style={styles.dismissLabel}>not now</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26, 26, 26, 0.32)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.lg,
  },
  eyebrow: {
    fontFamily: typography.fontSans,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.inkFaint,
    textTransform: 'lowercase',
    marginBottom: spacing.sm,
  },
  headline: {
    fontFamily: typography.fontSerif,
    fontSize: 30,
    lineHeight: 36,
    color: colors.ink,
    letterSpacing: -0.3,
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body + 1,
    lineHeight: 25,
    color: colors.inkMuted,
    marginBottom: spacing.xl,
  },
  ctaWrap: {
    gap: spacing.md,
    alignItems: 'center',
  },
  dismiss: {
    paddingVertical: spacing.sm,
  },
  dismissLabel: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
});
