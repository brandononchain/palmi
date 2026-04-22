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
import { supabase } from '@/lib/supabase';
import type { Recap } from '@/lib/database.types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function RecapsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<Recap | null>(null);

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
        <ScrollView contentContainerStyle={styles.readerContent}>
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
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        renderItem={({ item }) => <RecapRow recap={item} onOpen={() => setOpen(item)} />}
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
    </Screen>
  );
}

function RecapRow({ recap, onOpen }: { recap: Recap; onOpen: () => void }) {
  const preview = recap.body.length > 140 ? recap.body.slice(0, 140).trimEnd() + '…' : recap.body;
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowLabel}>{formatPeriod(recap.period_start).toUpperCase()}</Text>
      <Text style={styles.rowPreview} numberOfLines={3}>
        {preview}
      </Text>
      <Text style={styles.rowHint}>tap to read</Text>
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
