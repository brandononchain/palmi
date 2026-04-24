import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography } from '@/theme/tokens';

interface CircleChip {
  id: string;
  name: string;
  member_count: number;
}

interface ActivityPost {
  id: string;
  body: string | null;
  created_at: string;
  circle_id: string;
  circle_name: string;
  author_name: string;
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `good ${time},\n${name}.`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [circles, setCircles] = useState<CircleChip[]>([]);
  const [posts, setPosts] = useState<ActivityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // 1. Get user's circles via memberships
    const { data: memberships } = await supabase
      .from('memberships')
      .select('circle_id, circles(id, name, member_count, deleted_at)')
      .eq('user_id', user.id)
      .is('left_at', null);

    const userCircles: CircleChip[] = ((memberships ?? []) as any[])
      .map((m) => m.circles)
      .filter((c) => c && !c.deleted_at)
      .map((c) => ({ id: c.id, name: c.name, member_count: c.member_count }));

    setCircles(userCircles);

    if (userCircles.length === 0) {
      setPosts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // 2. Get recent activity from those circles only. Use explicit FK hints
    // so PostgREST doesn't get confused about which relationship to use and
    // so we get a real author name instead of '...'.
    const circleIds = userCircles.map((c) => c.id);
    const { data: postsData, error: postsErr } = await supabase
      .from('posts')
      .select(
        `
        id,
        body,
        created_at,
        circle_id,
        circles:circle_id ( name ),
        author:profiles!posts_author_id_fkey ( display_name )
      `
      )
      .in('circle_id', circleIds)
      .is('deleted_at', null)
      .eq('moderation_status', 'ok')
      .order('created_at', { ascending: false })
      .limit(30);

    if (postsErr) {
      // Don't nuke the list on a transient error — keep whatever we had.
      console.warn('home feed load failed', postsErr.message);
    } else {
      const mapped: ActivityPost[] = ((postsData ?? []) as any[]).map((p) => ({
        id: p.id,
        body: p.body,
        created_at: p.created_at,
        circle_id: p.circle_id,
        circle_name: p.circles?.name ?? 'circle',
        author_name: p.author?.display_name ?? 'someone',
      }));
      setPosts(mapped);
    }

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Live-update the feed when any post is inserted/updated in the user's
  // circles. Without this, home only refreshes on tab focus, so posts made
  // elsewhere (or by circle-mates) don't appear until the user navigates.
  const channelRef = useRef<RealtimeChannel | null>(null);
  useEffect(() => {
    if (!user) return;
    const circleIds = circles.map((c) => c.id);
    if (circleIds.length === 0) return;

    // Filter server-side by circle_id so we don't get spammed by posts in
    // circles the user doesn't belong to.
    const filter = `circle_id=in.(${circleIds.join(',')})`;
    const channel = supabase
      .channel('home-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts', filter },
        () => void load()
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'posts', filter },
        () => void load()
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [user, circles, load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const greetingText = profile?.display_name ? greeting(profile.display_name) : 'welcome back.';

  const hasCircles = circles.length > 0;

  return (
    <Screen padded={false}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <PostCard item={item} onPress={() => router.push(`/(tabs)/circles/${item.circle_id}`)} />
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
          <View>
            <View style={styles.header}>
              <Text style={styles.greeting}>{greetingText}</Text>
            </View>
            {hasCircles && (
              <CircleStrip
                circles={circles}
                onPressCircle={(id) => router.push(`/(tabs)/circles/${id}`)}
                onSeeAll={() => router.push('/(tabs)/circles')}
              />
            )}
            {hasCircles && (
              <View style={styles.feedHeader}>
                <Text style={styles.feedTitle}>recent activity</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? null : !hasCircles ? (
            <EmptyCircles onPress={() => router.push('/(tabs)/circles')} />
          ) : (
            <EmptyActivity />
          )
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </Screen>
  );
}

function CircleStrip({
  circles,
  onPressCircle,
  onSeeAll,
}: {
  circles: CircleChip[];
  onPressCircle: (id: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <View style={styles.stripWrap}>
      <View style={styles.stripHeader}>
        <Text style={styles.stripLabel}>your circles</Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.stripSeeAll}>see all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContent}
      >
        {circles.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onPressCircle(c.id)}
            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
          >
            <Text style={styles.chipName} numberOfLines={1}>
              {c.name}
            </Text>
            <Text style={styles.chipMeta}>
              {c.member_count} {c.member_count === 1 ? 'person' : 'people'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function PostCard({ item, onPress }: { item: ActivityPost; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardMeta}>
        <Text style={styles.circlePill}>{item.circle_name}</Text>
        <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
      </View>
      {item.body ? (
        <Text style={styles.cardBody} numberOfLines={4}>
          {item.body}
        </Text>
      ) : (
        <Text style={styles.cardBodyMuted}>shared a photo</Text>
      )}
      <Text style={styles.authorName}>{item.author_name}</Text>
    </Pressable>
  );
}

function EmptyCircles({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>nothing yet.</Text>
      <Text style={styles.emptyLede}>
        start or join a circle to see what your people are up to.
      </Text>
      <Button variant="secondary" onPress={onPress} style={styles.emptyButton}>
        go to circles
      </Button>
    </View>
  );
}

function EmptyActivity() {
  return (
    <View style={styles.emptyActivity}>
      <Text style={styles.emptyActivityTitle}>all quiet.</Text>
      <Text style={styles.emptyActivityLede}>when your circles post, it'll show up here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  greeting: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display + 4,
    color: colors.ink,
    lineHeight: (typography.display + 4) * 1.15,
    letterSpacing: typography.trackTight,
  },

  // Circle strip
  stripWrap: {
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  stripLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  stripSeeAll: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  stripContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    minWidth: 130,
    maxWidth: 180,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 2,
  },
  chipPressed: {
    backgroundColor: colors.bgPanel,
  },
  chipName: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body + 1,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  chipMeta: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },

  // Feed header
  feedHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  feedTitle: {
    fontFamily: typography.fontSansMedium,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },

  // Post card
  card: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  cardPressed: {
    backgroundColor: colors.bgPanel,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  circlePill: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
    textTransform: 'lowercase',
    letterSpacing: 0.3,
  },
  timestamp: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  cardBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * 1.5,
  },
  cardBodyMuted: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.body,
    color: colors.inkMuted,
  },
  authorName: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },

  // Empty states
  empty: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    color: colors.ink,
    letterSpacing: typography.trackTight,
  },
  emptyLede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * 1.5,
    maxWidth: 280,
  },
  emptyButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  emptyActivity: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  emptyActivityTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  emptyActivityLede: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
});
