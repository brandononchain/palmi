import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography } from '@/theme/tokens';

interface Friend {
  user_id: string;
  display_name: string;
  circles: string[];
  joined_at: string;
}

function Avatar({ name }: { name: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function FriendRow({ item }: { item: Friend }) {
  return (
    <View style={styles.row}>
      <Avatar name={item.display_name} />
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{item.display_name}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.circles.join(' · ')}
        </Text>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>no one here yet.</Text>
      <Text style={styles.emptyLede}>people you share circles with will appear here.</Text>
    </View>
  );
}

export default function FriendsScreen() {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;

    // Fetch all memberships for circles the current user is in,
    // excluding the current user themselves.
    const { data, error } = await supabase
      .from('memberships')
      .select(
        `
        user_id,
        circle_id,
        joined_at,
        circles ( name ),
        profiles ( display_name )
      `
      )
      .is('left_at', null)
      .neq('user_id', user.id);

    if (!error && data) {
      // Group by user, collect circle names
      const map = new Map<string, Friend>();
      for (const m of data as any[]) {
        const id: string = m.user_id;
        const name: string = m.profiles?.display_name ?? 'unknown';
        const circle: string = m.circles?.name ?? '';
        if (map.has(id)) {
          if (circle) map.get(id)!.circles.push(circle);
        } else {
          map.set(id, {
            user_id: id,
            display_name: name,
            circles: circle ? [circle] : [],
            joined_at: m.joined_at,
          });
        }
      }
      setFriends(
        Array.from(map.values()).sort((a, b) => a.display_name.localeCompare(b.display_name))
      );
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

  return (
    <Screen padded={false}>
      <FlatList
        data={friends}
        keyExtractor={(item) => item.user_id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <FriendRow item={item} />}
        contentContainerStyle={
          friends.length === 0 && !loading ? styles.emptyContainer : styles.list
        }
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
              your <Text style={styles.titleItalic}>people</Text>
            </Text>
            {friends.length > 0 && (
              <Text style={styles.count}>
                {friends.length} {friends.length === 1 ? 'person' : 'people'}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={loading ? null : <EmptyState />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingBottom: 40,
  },
  emptyContainer: {
    flexGrow: 1,
  },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.inkMuted,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.ink,
  },
  rowMeta: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
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
});
