import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth, tierFromProfile } from '@/hooks/useAuth';
import {
  openBillingPortal,
  PREMIUM_PLUS_PRICE_LABEL,
  PREMIUM_PRICE_LABEL,
  startCheckout,
  tierLabel,
} from '@/lib/billing';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function MembershipScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const tier = tierFromProfile(profile);
  const [busy, setBusy] = useState<null | 'premium' | 'premium_plus' | 'portal'>(null);

  const renewal = profile?.current_period_end
    ? new Date(profile.current_period_end).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const handleStart = async (which: 'premium' | 'premium_plus') => {
    setBusy(which);
    try {
      await startCheckout({ kind: 'individual', tier: which });
    } catch (e) {
      Alert.alert(
        'Could not open checkout',
        e instanceof Error ? e.message : 'Please try again in a moment.'
      );
    } finally {
      setBusy(null);
    }
  };

  const handlePortal = async () => {
    setBusy('portal');
    try {
      await openBillingPortal();
    } catch (e) {
      Alert.alert(
        'Could not open billing',
        e instanceof Error ? e.message : 'Please try again in a moment.'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>membership</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>your plan</Text>
          <Text style={styles.tierName}>{tierLabel(tier)}</Text>
          {renewal ? (
            <Text style={styles.tierMeta}>
              {profile?.subscription_status === 'canceled'
                ? `ends ${renewal}`
                : `renews ${renewal}`}
            </Text>
          ) : (
            <Text style={styles.tierMeta}>free forever, no card required</Text>
          )}
        </View>

        {tier === 'free' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>premium</Text>
              <Text style={styles.cardPrice}>{PREMIUM_PRICE_LABEL}</Text>
              <View style={styles.cardList}>
                <Bullet>up to 10 circles</Bullet>
                <Bullet>every recap, every month, forever</Bullet>
                <Bullet>search your own memory across circles</Bullet>
                <Bullet>yearbook export (pdf)</Bullet>
                <Bullet>a quiet monthly reflection, just for you</Bullet>
                <Bullet>circle themes for circles you own</Bullet>
              </View>
              <Button onPress={() => void handleStart('premium')} loading={busy === 'premium'}>
                upgrade to premium
              </Button>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>premium+</Text>
              <Text style={styles.cardPrice}>{PREMIUM_PLUS_PRICE_LABEL}</Text>
              <View style={styles.cardList}>
                <Bullet>everything in premium</Bullet>
                <Bullet>unlimited circle discovery</Bullet>
                <Bullet>ai &ldquo;why this fits&rdquo; on every match</Bullet>
                <Bullet>priority access to new circles</Bullet>
              </View>
              <Button
                variant="secondary"
                onPress={() => void handleStart('premium_plus')}
                loading={busy === 'premium_plus'}
              >
                upgrade to premium+
              </Button>
            </View>

            <Text style={styles.footnote}>
              checkout happens in your browser. you can cancel anytime, from here.
            </Text>
          </>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>manage your plan</Text>
              <Text style={styles.cardBody}>
                update your card, switch plans, or cancel. it all happens in the secure billing
                portal.
              </Text>
              <Button onPress={() => void handlePortal()} loading={busy === 'portal'}>
                open billing portal
              </Button>
            </View>
            <Text style={styles.footnote}>
              thank you for supporting palmi. you keep it free of ads, for everyone.
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletDot}>·</Text>
      <Text style={styles.bulletText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    textAlign: 'center',
  },
  headerSpacer: { width: 44 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.xs,
  },
  eyebrow: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tierName: {
    fontFamily: typography.fontSerif,
    fontSize: 34,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  tierMeta: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.body,
    color: colors.inkMuted,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  cardPrice: {
    fontFamily: typography.fontSerif,
    fontSize: 22,
    color: colors.ink,
  },
  cardBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body + 1,
    color: colors.inkMuted,
    lineHeight: (typography.body + 1) * typography.lineRelaxed,
  },
  cardList: {
    gap: spacing.xs,
    marginTop: spacing.xxs,
    marginBottom: spacing.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  bulletDot: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body + 2,
    color: colors.accent,
    width: 12,
    lineHeight: (typography.body + 1) * typography.lineRelaxed,
  },
  bulletText: {
    flex: 1,
    fontFamily: typography.fontSans,
    fontSize: typography.caption + 1,
    color: colors.inkMuted,
    lineHeight: (typography.caption + 1) * typography.lineRelaxed,
  },
  footnote: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.caption,
    color: colors.inkFaint,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
});
