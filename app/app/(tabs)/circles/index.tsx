import { useCallback, useState } from 'react';
import { StyleSheet, Text, View, FlatList, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Circle } from '@/lib/database.types';
import { colors, spacing, typography } from '@/theme/tokens';

export default function CirclesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Only show circles the current user is a member of.
    const { data, error } = await supabase
      .from('memberships')
      .select('joined_at, circles(*)')
      .eq('user_id', user.id)
      .is('left_at', null)
      .order('joined_at', { ascending: false });

    if (!error && data) {
      const myCircles: Circle[] = (data as any[])
        .map((m) => m.circles)
        .filter((c): c is Circle => !!c && !c.deleted_at);
      setCircles(myCircles);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const hasCircles = circles.length > 0;

  return (
    <Screen padded={false}>
      <FlatList
        data={circles}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CircleRow circle={item} onPress={() => router.push(`/circles/${item.id}`)} />
        )}
        contentContainerStyle={!hasCircles && !loading ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.inkMuted}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>
              your <Text style={styles.titleItalic}>circles</Text>
            </Text>
            {hasCircles && (
              <Text style={styles.count}>
                {circles.length} {circles.length === 1 ? 'circle' : 'circles'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              onCreate={() => router.push('/circles/new')}
              onJoin={() => router.push('/circles/join')}
              onFind={() => router.push('/circles/find')}
            />
          )
        }
        ListFooterComponent={
          hasCircles ? (
            <View style={styles.footerActions}>
              <Button variant="secondary" onPress={() => router.push('/circles/new')}>
                Start a new circle
              </Button>
              <Button variant="ghost" onPress={() => router.push('/circles/join')}>
                Join with a code
              </Button>
              <Pressable
                onPress={() => router.push('/circles/find')}
                style={({ pressed }) => [styles.findPill, pressed && styles.findPillPressed]}
                hitSlop={8}
              >
                <Text style={styles.findPillText}>or find a circle</Text>
              </Pressable>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </Screen>
  );
}

const DOT_PALETTE = ['#E8C5A0', '#B8B0D8', '#C9D8B8', '#E6B8B8', '#B8D1E0', '#D8C4A0'];

function dotColorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DOT_PALETTE[h % DOT_PALETTE.length] ?? DOT_PALETTE[0] ?? '#E8C5A0';
}

function CircleRow({ circle, onPress }: { circle: Circle; onPress: () => void }) {
  const count = circle.member_count ?? 1;
  const meta =
    count <= 1 ? 'just you — invite someone' : `${count} ${count === 1 ? 'person' : 'people'}`;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.rowDot, { backgroundColor: dotColorFor(circle.id) }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {circle.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={styles.rowArrow}>
        <Text style={styles.rowArrowText}>›</Text>
      </View>
    </Pressable>
  );
}

function EmptyState({
  onCreate,
  onJoin,
  onFind,
}: {
  onCreate: () => void;
  onJoin: () => void;
  onFind: () => void;
}) {
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
        <Pressable
          onPress={onFind}
          hitSlop={8}
          style={({ pressed }) => [styles.findPill, pressed && styles.findPillPressed]}
        >
          <Text style={styles.findPillText}>or find a circle</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display + 4,
    color: colors.ink,
    lineHeight: (typography.display + 4) * 1.15,
    letterSpacing: typography.trackTight,
  },
  titleItalic: {
    fontFamily: typography.fontSerifItalic,
    color: colors.accent,
  },
  count: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  list: {
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.bgPanel,
  },
  rowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
    marginHorizontal: spacing.lg,
  },
  footerActions: {
    gap: spacing.sm,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
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
  findPill: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  findPillPressed: {
    opacity: 0.6,
  },
  findPillText: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
});
