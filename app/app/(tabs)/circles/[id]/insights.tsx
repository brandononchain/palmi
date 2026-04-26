import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import type { CircleParticipationSnapshot } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function CircleInsightsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [snapshot, setSnapshot] = useState<CircleParticipationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      const { data } = await supabase.rpc('get_circle_participation_snapshot', {
        p_circle_id: id,
        p_days: 28,
      });
      setSnapshot(((data ?? [])[0] ?? null) as CircleParticipationSnapshot | null);
      setLoading(false);
    };
    void load();
  }, [id]);

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>participation</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>paid circle insights</Text>
        <Text style={styles.title}>see the shape, not the scoreboard.</Text>
        <Text style={styles.lede}>
          these are quiet participation signals for owners and co-hosts. enough to notice rhythm,
          not enough to turn the room into a leaderboard.
        </Text>

        {loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.inkMuted} />
          </View>
        ) : !snapshot ? (
          <View style={styles.card}>
            <Text style={styles.metricLabel}>no signal yet</Text>
            <Text style={styles.metricValue}>check back after a little more activity.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            <MetricCard label="active members / day" value={fmt(snapshot.active_members_avg)} />
            <MetricCard label="posting members / day" value={fmt(snapshot.posting_members_avg)} />
            <MetricCard label="answer rate" value={fmtPercent(snapshot.answer_rate_avg)} />
            <MetricCard label="posts in 28 days" value={String(snapshot.posts_total)} />
            <MetricCard label="answers in 28 days" value={String(snapshot.answers_total)} />
            <MetricCard label="reactions in 28 days" value={String(snapshot.reactions_total)} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function fmt(value: number | null) {
  if (value === null || value === undefined) return '—';
  return value.toFixed(1).replace(/\.0$/, '');
}

function fmtPercent(value: number | null) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value * 100)}%`;
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
    letterSpacing: 1.2,
    textTransform: 'uppercase',
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
  grid: { gap: spacing.md },
  card: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  metricLabel: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricValue: { fontFamily: typography.fontSerif, fontSize: typography.title, color: colors.ink },
});
