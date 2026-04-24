import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { UpgradeSheet } from '@/components/UpgradeSheet';
import { useAuth, isPremium } from '@/hooks/useAuth';
import { startCheckout } from '@/lib/billing';
import { supabase } from '@/lib/supabase';
import type { Recap } from '@/lib/database.types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

// Free users see only recaps whose period_start is within the last 30 days
// (i.e. the current / most recent month). Older ones are visible as locked
// rows that open the upgrade sheet instead.
const FREE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export default function RecapsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useAuth((s) => s.profile);
  const premium = isPremium(profile);

  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Recap | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('recaps')
      .select('*')
      .eq('circle_id', id)
      .order('period_start', { ascending: false });
    setRecaps((data ?? []) as Recap[]);
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      await startCheckout({ kind: 'individual', tier: 'premium' });
      setShowUpgrade(false);
    } catch {
      // swallow; user can retry
    } finally {
      setUpgrading(false);
    }
  };

  const isLocked = (r: Recap): boolean => {
    if (premium) return false;
    const start = new Date(r.period_start).getTime();
    return Date.now() - start > FREE_WINDOW_MS;
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.inkMuted} />
        </View>
      </Screen>
    );
  }

  if (open) {
    return (
      <Screen padded={false}>
        <View style={styles.header}>
          <Pressable onPress={() => setOpen(null)} hitSlop={12} style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {formatPeriod(open.period_start)}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.readerContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.readerLabel}>a note from the month</Text>
          <Text style={styles.readerBody}>{open.body}</Text>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>recaps</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={recaps}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={
          !premium && recaps.some(isLocked) ? (
            <Pressable
              onPress={() => setShowUpgrade(true)}
              style={({ pressed }) => [styles.banner, pressed && styles.rowPressed]}
            >
              <Text style={styles.bannerLabel}>keep every month</Text>
              <Text style={styles.bannerBody}>
                free circles keep the current month. premium unlocks every recap, forever.
              </Text>
              <Text style={styles.bannerCta}>upgrade · $4/mo</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => {
          const locked = isLocked(item);
          return (
            <RecapRow
              recap={item}
              locked={locked}
              onOpen={() => (locked ? setShowUpgrade(true) : setOpen(item))}
            />
          );
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={colors.inkMuted}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              No recaps yet. The first one arrives on the 1st of next month.
            </Text>
          </View>
        }
      />

      <UpgradeSheet
        visible={showUpgrade}
        variant="recap-history"
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        loading={upgrading}
      />
    </Screen>
  );
}

function RecapRow({
  recap,
  locked,
  onOpen,
}: {
  recap: Recap;
  locked: boolean;
  onOpen: () => void;
}) {
  const preview = recap.body.length > 140 ? recap.body.slice(0, 140).trimEnd() + '…' : recap.body;
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        locked && styles.rowLocked,
        pressed && styles.rowPressed,
      ]}
    >
      <Text style={styles.rowLabel}>{formatPeriod(recap.period_start).toUpperCase()}</Text>
      {locked ? (
        <Text style={styles.rowLockedHint}>
          part of the history your circle built together. unlock with premium.
        </Text>
      ) : (
        <>
          <Text style={styles.rowPreview} numberOfLines={3}>
            {preview}
          </Text>
          <Text style={styles.rowHint}>tap to read</Text>
        </>
      )}
    </Pressable>
  );
}

// "2026-04-01" → "April 2026"
function formatPeriod(periodStart: string): string {
  const [y, m] = periodStart.split('-').map((s) => parseInt(s, 10));
  if (!y || !m) return periodStart;
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 32,
    color: colors.ink,
    fontWeight: '300',
    lineHeight: 32,
  },
  headerTitle: {
    flex: 1,
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  gap: {
    height: spacing.md,
  },
  row: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.bgPanel,
  },
  rowLocked: {
    backgroundColor: colors.bgPanel,
  },
  rowLockedHint: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  banner: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  bannerLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  bannerBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  bannerCta: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
    marginTop: spacing.xxs,
  },
  rowLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  rowPreview: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body + 1,
    color: colors.ink,
    lineHeight: (typography.body + 1) * typography.lineRelaxed,
  },
  rowHint: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    marginTop: spacing.xxs,
  },
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  readerContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxxl,
  },
  readerLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    marginBottom: spacing.md,
  },
  readerBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    lineHeight: typography.subtitle * typography.lineRelaxed,
    letterSpacing: -0.1,
  },
});
