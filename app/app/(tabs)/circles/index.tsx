import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import type { Circle } from '@/lib/database.types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function CirclesScreen() {
  const router = useRouter();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('circles')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (!error && data) setCircles(data as Circle[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text style={styles.title}>
          your <Text style={styles.titleItalic}>circles</Text>
        </Text>
      </View>

      {loading ? null : circles.length === 0 ? (
        <EmptyState onCreate={() => router.push('/circles/new')} onJoin={() => router.push('/circles/join')} />
      ) : (
        <FlatList
          data={circles}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <CircleRow
              circle={item}
              onPress={() => router.push(`/circles/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.inkMuted}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={
            <View style={styles.footerActions}>
              <Button variant="secondary" onPress={() => router.push('/circles/new')}>
                Start a new circle
              </Button>
              <Button variant="ghost" onPress={() => router.push('/circles/join')}>
                Join with a code
              </Button>
            </View>
          }
        />
      )}
    </Screen>
  );
}

function CircleRow({ circle, onPress }: { circle: Circle; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{circle.name}</Text>
        <Text style={styles.rowMeta}>
          {circle.member_count} {circle.member_count === 1 ? 'person' : 'people'}
        </Text>
      </View>
      <View style={styles.rowArrow}>
        <Text style={styles.rowArrowText}>›</Text>
      </View>
    </Pressable>
  );
}

function EmptyState({ onCreate, onJoin }: { onCreate: () => void; onJoin: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyArt}>
        <View style={[styles.emptyDot, { backgroundColor: '#E8C5A0' }]} />
        <View style={[styles.emptyDot, { backgroundColor: '#B8B0D8' }]} />
        <View style={[styles.emptyDot, { backgroundColor: colors.accent }]} />
      </View>
      <Text style={styles.emptyTitle}>No circles yet.</Text>
      <Text style={styles.emptyLede}>
        A circle is a small group of friends, 2 to 15 people. Start one, or join one with a code.
      </Text>
      <View style={styles.emptyActions}>
        <Button onPress={onCreate}>Start a circle</Button>
        <Button variant="ghost" onPress={onJoin}>
          Join with a code
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    color: colors.ink,
    letterSpacing: typography.trackTight,
  },
  titleItalic: {
    fontFamily: typography.fontSerifItalic,
    color: colors.accent,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  rowPressed: {
    backgroundColor: colors.bgPanel,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  rowMeta: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  rowArrow: {
    paddingLeft: spacing.md,
  },
  rowArrowText: {
    fontSize: 28,
    color: colors.inkFaint,
    fontWeight: '300',
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  footerActions: {
    gap: spacing.sm,
    paddingTop: spacing.xl,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyArt: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  emptyDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  emptyTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  emptyLede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  emptyActions: {
    width: '100%',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
