import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { Button } from '@/components/Button';
import { PalmiWordmark } from '@/components/Brand';
import { FadeUpView } from '@/components/FadeUpView';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, motion, radius, spacing, typography } from '@/theme/tokens';

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

interface RitualPrompt {
  question_id: string;
  circle_id: string;
  circle_name: string;
  question_text: string;
  drops_at: string;
  answered: boolean;
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return `good ${time},\n${name}.`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const [circles, setCircles] = useState<CircleChip[]>([]);
  const [posts, setPosts] = useState<ActivityPost[]>([]);
  const [prompts, setPrompts] = useState<RitualPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const { data: membershipRows } = await supabase
      .from('memberships')
      .select('circle_id, circles(id, name, member_count, deleted_at)')
      .eq('user_id', user.id)
      .is('left_at', null);

    const userCircles: CircleChip[] = ((membershipRows ?? []) as any[])
      .map((membership) => membership.circles)
      .filter((circle) => circle && !circle.deleted_at)
      .map((circle) => ({
        id: circle.id,
        name: circle.name,
        member_count: circle.member_count,
      }));

    setCircles(userCircles);

    if (userCircles.length === 0) {
      setPrompts([]);
      setPosts([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const circleIds = userCircles.map((circle) => circle.id);

    const { data: questionRows } = await supabase
      .from('daily_questions')
      .select('id, circle_id, question_text, drops_at, circles:circle_id(name)')
      .in('circle_id', circleIds)
      .order('drops_at', { ascending: false })
      .limit(Math.max(circleIds.length * 3, 12));

    const latestQuestionByCircle = new Map<string, any>();
    for (const row of (questionRows ?? []) as any[]) {
      if (!latestQuestionByCircle.has(row.circle_id))
        latestQuestionByCircle.set(row.circle_id, row);
    }
    const latestQuestions = Array.from(latestQuestionByCircle.values());
    const questionIds = latestQuestions.map((row) => row.id);

    const { data: answerRows } = questionIds.length
      ? await supabase
          .from('question_answers')
          .select('question_id')
          .in('question_id', questionIds)
          .eq('author_id', user.id)
      : { data: [] as { question_id: string }[] };

    const answeredIds = new Set((answerRows ?? []).map((row: any) => row.question_id));
    setPrompts(
      latestQuestions
        .map((row: any) => ({
          question_id: row.id,
          circle_id: row.circle_id,
          circle_name: row.circles?.name ?? 'circle',
          question_text: row.question_text,
          drops_at: row.drops_at,
          answered: answeredIds.has(row.id),
        }))
        .sort((left, right) => {
          if (left.answered !== right.answered) return left.answered ? 1 : -1;
          return new Date(right.drops_at).getTime() - new Date(left.drops_at).getTime();
        })
        .slice(0, 3)
    );

    const { data: postRows, error: postError } = await supabase
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
      .limit(18);

    if (postError) {
      console.warn('home feed load failed', postError.message);
    } else {
      setPosts(
        ((postRows ?? []) as any[]).map((post) => ({
          id: post.id,
          body: post.body,
          created_at: post.created_at,
          circle_id: post.circle_id,
          circle_name: post.circles?.name ?? 'circle',
          author_name: post.author?.display_name ?? 'someone',
        }))
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

  useEffect(() => {
    if (!user || circles.length === 0) return;

    const circleIds = circles.map((circle) => circle.id);
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
  }, [circles, load, user]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const hasCircles = circles.length > 0;
  const greetingText = profile?.display_name ? greeting(profile.display_name) : 'welcome back.';
  const unansweredCount = prompts.filter((prompt) => !prompt.answered).length;

  const primaryPrompt = useMemo(
    () => prompts.find((prompt) => !prompt.answered) ?? prompts[0] ?? null,
    [prompts]
  );
  const secondaryPrompts = useMemo(
    () => prompts.filter((prompt) => prompt.question_id !== primaryPrompt?.question_id).slice(0, 2),
    [prompts, primaryPrompt]
  );

  const recentByCircle = useMemo(() => {
    const map = new Map<string, ActivityPost[]>();
    posts.forEach((post) => {
      const existing = map.get(post.circle_id) ?? [];
      existing.push(post);
      map.set(post.circle_id, existing);
    });
    return map;
  }, [posts]);

  const circleStatuses = useMemo(() => {
    const map = new Map<string, string>();
    circles.forEach((circle) => {
      const prompt = prompts.find((entry) => entry.circle_id === circle.id);
      const recentPosts = recentByCircle.get(circle.id) ?? [];

      if (prompt && !prompt.answered) {
        map.set(circle.id, 'question waiting');
        return;
      }
      if (prompt?.answered) {
        map.set(circle.id, 'answered today');
        return;
      }
      if (recentPosts.length >= 2) {
        map.set(circle.id, `${recentPosts.length} new moments`);
        return;
      }
      if (recentPosts.length === 1) {
        map.set(circle.id, 'one new moment');
        return;
      }
      map.set(circle.id, 'quiet today');
    });
    return map;
  }, [circles, prompts, recentByCircle]);

  const openPrompt = (prompt: RitualPrompt) => {
    router.push(
      prompt.answered
        ? `/(tabs)/circles/${prompt.circle_id}`
        : `/(tabs)/circles/${prompt.circle_id}/answer?qid=${prompt.question_id}`
    );
  };

  return (
    <Screen padded={false}>
      <FlatList
        data={posts.slice(0, 8)}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <FadeUpView delay={motion.stagger * Math.min(index + 5, 12)}>
            <PostCard
              item={item}
              onPress={() => router.push(`/(tabs)/circles/${item.circle_id}`)}
            />
          </FadeUpView>
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
            <FadeUpView>
              <View style={styles.header}>
                <PalmiWordmark size={24} style={styles.wordmark} />
                <Text style={styles.greeting}>{greetingText}</Text>
                <Text style={styles.lede}>
                  {hasCircles
                    ? unansweredCount > 0
                      ? 'today’s ritual is tagged in your circles. start anywhere that feels right.'
                      : 'nothing loud here. just the rooms that moved today.'
                    : 'start one small room, or find one that already fits.'}
                </Text>
              </View>
            </FadeUpView>

            {hasCircles && (
              <FadeUpView delay={motion.stagger}>
                <HomeSummary
                  unansweredCount={unansweredCount}
                  circleCount={circles.length}
                  recentCount={posts.length}
                />
              </FadeUpView>
            )}

            {hasCircles && primaryPrompt ? (
              <FadeUpView delay={motion.stagger * 2}>
                <FocusRitualCard
                  prompt={primaryPrompt}
                  unansweredCount={unansweredCount}
                  onOpen={() => openPrompt(primaryPrompt)}
                />
              </FadeUpView>
            ) : hasCircles ? (
              <FadeUpView delay={motion.stagger * 2}>
                <CalmCard onPress={() => router.push('/(tabs)/circles')} />
              </FadeUpView>
            ) : null}

            {secondaryPrompts.length > 0 && (
              <FadeUpView delay={motion.stagger * 3}>
                <SecondaryPromptRow prompts={secondaryPrompts} onOpen={openPrompt} />
              </FadeUpView>
            )}

            {hasCircles && (
              <FadeUpView delay={motion.stagger * 4}>
                <CircleStrip
                  circles={circles}
                  statusById={circleStatuses}
                  onPressCircle={(id) => router.push(`/(tabs)/circles/${id}`)}
                  onSeeAll={() => router.push('/(tabs)/circles')}
                />
              </FadeUpView>
            )}

            {hasCircles && (
              <FadeUpView delay={motion.stagger * 5}>
                <View style={styles.feedHeader}>
                  <Text style={styles.feedTitle}>recently moved</Text>
                  <Text style={styles.feedNote}>after the question, this is what shifted.</Text>
                </View>
              </FadeUpView>
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

function HomeSummary({
  unansweredCount,
  circleCount,
  recentCount,
}: {
  unansweredCount: number;
  circleCount: number;
  recentCount: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <SummaryStat value={String(unansweredCount)} label="waiting on you" />
      <SummaryStat value={String(circleCount)} label="rooms open" />
      <SummaryStat value={String(Math.min(recentCount, 9))} label="recent moments" />
    </View>
  );
}

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function FocusRitualCard({
  prompt,
  unansweredCount,
  onOpen,
}: {
  prompt: RitualPrompt;
  unansweredCount: number;
  onOpen: () => void;
}) {
  const title = prompt.answered ? 'you already answered today.' : 'start here.';
  const note = prompt.answered
    ? 'your room kept moving. go back in softly.'
    : unansweredCount > 1
      ? `${unansweredCount} rooms have a ritual open. this is the closest one to begin with.`
      : 'one room has a ritual open right now.';

  return (
    <View style={styles.focusWrap}>
      <View style={styles.focusCard}>
        <Text style={styles.focusLabel}>today&apos;s ritual</Text>
        <Text style={styles.focusTitle}>{title}</Text>
        <View style={styles.focusRoomRow}>
          <Text style={styles.focusCircle}>{prompt.circle_name}</Text>
          <Text style={styles.focusMeta}>{prompt.answered ? 'answered' : 'waiting'}</Text>
        </View>
        <Text style={styles.focusBody}>{prompt.question_text}</Text>
        <Text style={styles.focusNote}>{note}</Text>
        <Text style={styles.focusHelper}>
          the same ritual status is tagged in your circles list.
        </Text>
        <Button
          onPress={onOpen}
          fullWidth={false}
          variant={prompt.answered ? 'secondary' : 'primary'}
        >
          {prompt.answered ? 'return to circle' : 'answer now'}
        </Button>
      </View>
    </View>
  );
}

function CalmCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.focusWrap}>
      <View style={styles.calmCard}>
        <Text style={styles.focusLabel}>today</Text>
        <Text style={styles.focusTitle}>all caught up.</Text>
        <Text style={styles.focusNote}>
          nothing is waiting on you right now. check in on your circles or leave the app quiet.
        </Text>
        <Button onPress={onPress} fullWidth={false} variant="secondary">
          open circles
        </Button>
      </View>
    </View>
  );
}

function SecondaryPromptRow({
  prompts,
  onOpen,
}: {
  prompts: RitualPrompt[];
  onOpen: (prompt: RitualPrompt) => void;
}) {
  return (
    <View style={styles.secondaryWrap}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>also waiting</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
      >
        {prompts.map((prompt) => (
          <Pressable
            key={prompt.question_id}
            onPress={() => onOpen(prompt)}
            style={({ pressed }) => [styles.secondaryCard, pressed && styles.softPressed]}
          >
            <Text style={styles.secondaryCircle}>{prompt.circle_name}</Text>
            <Text style={styles.secondaryBody} numberOfLines={3}>
              {prompt.question_text}
            </Text>
            <Text style={styles.secondaryAction}>{prompt.answered ? 'open circle' : 'answer'}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function CircleStrip({
  circles,
  statusById,
  onPressCircle,
  onSeeAll,
}: {
  circles: CircleChip[];
  statusById: Map<string, string>;
  onPressCircle: (id: string) => void;
  onSeeAll: () => void;
}) {
  return (
    <View style={styles.circleWrap}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionLabel}>your circles</Text>
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={styles.sectionLink}>see all</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rowContent}
      >
        {circles.map((circle) => (
          <Pressable
            key={circle.id}
            onPress={() => onPressCircle(circle.id)}
            style={({ pressed }) => [styles.circleCard, pressed && styles.softPressed]}
          >
            <Text style={styles.circleName} numberOfLines={1}>
              {circle.name}
            </Text>
            <Text style={styles.circleStatus}>{statusById.get(circle.id) ?? 'quiet today'}</Text>
            <Text style={styles.circleCount}>
              {circle.member_count} {circle.member_count === 1 ? 'person' : 'people'}
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
      style={({ pressed }) => [styles.postCard, pressed && styles.softPressed]}
    >
      <View style={styles.postMetaRow}>
        <Text style={styles.postCircle}>{item.circle_name}</Text>
        <Text style={styles.postTime}>{timeAgo(item.created_at)}</Text>
      </View>
      {item.body ? (
        <Text style={styles.postBody} numberOfLines={3}>
          {item.body}
        </Text>
      ) : (
        <Text style={styles.postBodyMuted}>shared a photo</Text>
      )}
      <Text style={styles.postAuthor}>{item.author_name}</Text>
    </Pressable>
  );
}

function EmptyCircles({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>nothing yet.</Text>
      <Text style={styles.emptyBody}>
        start or join a circle and Home will turn into a quiet threshold.
      </Text>
      <Button variant="secondary" onPress={onPress} fullWidth={false}>
        go to circles
      </Button>
    </View>
  );
}

function EmptyActivity() {
  return (
    <View style={styles.emptyStateSmall}>
      <Text style={styles.emptyTitle}>all quiet.</Text>
      <Text style={styles.emptyBody}>
        nothing new moved today. leave it that way or check a room directly.
      </Text>
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
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  wordmark: {
    marginBottom: spacing.md,
  },
  greeting: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display + 4,
    color: colors.ink,
    lineHeight: (typography.display + 4) * 1.12,
    letterSpacing: typography.trackTight,
  },
  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
    maxWidth: 320,
  },
  summaryCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bgPanel,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryStat: {
    flex: 1,
    gap: 2,
  },
  summaryValue: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
  },
  summaryLabel: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  focusWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  focusCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  calmCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  focusLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  focusTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
  },
  focusRoomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  focusCircle: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  focusMeta: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  focusBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    lineHeight: typography.subtitle * typography.lineRelaxed,
  },
  focusNote: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  focusHelper: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    lineHeight: typography.micro * typography.lineRelaxed,
  },
  secondaryWrap: {
    paddingBottom: spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  sectionLink: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  rowContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  secondaryCard: {
    width: 220,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  secondaryCircle: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  secondaryBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  secondaryAction: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  circleWrap: {
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  circleCard: {
    minWidth: 160,
    maxWidth: 200,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: 3,
  },
  softPressed: {
    backgroundColor: colors.bgPanel,
  },
  circleName: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body + 1,
    color: colors.ink,
  },
  circleStatus: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  circleCount: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  feedHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  feedTitle: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  feedNote: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  postCard: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  postMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  postCircle: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
  },
  postTime: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  postBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  postBodyMuted: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.body,
    color: colors.inkMuted,
  },
  postAuthor: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  separator: {
    height: 1,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.border,
  },
  emptyState: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyStateSmall: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
    maxWidth: 320,
  },
});
