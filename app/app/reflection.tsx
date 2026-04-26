import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { UpgradeSheet } from '@/components/UpgradeSheet';
import { useAuth, isPremium } from '@/hooks/useAuth';
import { startCheckout } from '@/lib/billing';
import type { PersonalReflection } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function ReflectionScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const premium = isPremium(profile);
  const [rows, setRows] = useState<PersonalReflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!premium) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('personal_reflections')
        .select('*')
        .order('period_start', { ascending: false })
        .limit(12);
      setRows((data ?? []) as PersonalReflection[]);
      setLoading(false);
    };
    void load();
  }, [premium]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      await startCheckout({ kind: 'individual', tier: 'premium' });
      setShowUpgrade(false);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>reflection</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>quiet monthly reflection</Text>
        <Text style={styles.title}>a private look back, just for you.</Text>
        <Text style={styles.lede}>
          once a month, palmi turns your own words into a short private paragraph. it is not for the
          feed, and it is not for anyone else.
        </Text>

        {!premium ? (
          <Pressable style={styles.emptyCard} onPress={() => setShowUpgrade(true)}>
            <Text style={styles.emptyTitle}>premium keeps this private room open.</Text>
            <Text style={styles.emptyBody}>
              the reflection is there when you want a softer, more personal way to remember.
            </Text>
          </Pressable>
        ) : loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.inkMuted} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>nothing written yet.</Text>
            <Text style={styles.emptyBody}>
              your first reflection arrives after a full month of being here.
            </Text>
          </View>
        ) : (
          rows.map((row) => (
            <View key={row.id} style={styles.card}>
              <Text style={styles.cardLabel}>{formatPeriod(row.period_start)}</Text>
              <Text style={styles.cardBody}>{row.body}</Text>
            </View>
          ))
        )}
      </ScrollView>

      <UpgradeSheet
        visible={showUpgrade}
        variant="reflection"
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        loading={upgrading}
      />
    </Screen>
  );
}

function formatPeriod(periodStart: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${periodStart}T00:00:00.000Z`));
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
  backText: { fontSize: 32, color: colors.ink, fontWeight: '300', lineHeight: 32 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
  },
  headerSpacer: { width: 44, height: 44 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  eyebrow: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    color: colors.ink,
    lineHeight: typography.display * typography.lineTight,
  },
  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  loader: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { fontFamily: typography.fontSerif, fontSize: typography.title, color: colors.ink },
  emptyBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body + 1,
    color: colors.ink,
    lineHeight: (typography.body + 1) * typography.lineRelaxed,
  },
});
