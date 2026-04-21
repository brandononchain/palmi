import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';

import { Screen } from '@/components/Screen';
import { supabase } from '@/lib/supabase';
import type { Circle, FeedPost } from '@/lib/database.types';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface DailyQuestion {
  id: string;
  question_text: string;
  drops_at: string;
  answer_count: number;
}

export default function CircleFeedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;

    const [circleRes, questionRes, feedRes] = await Promise.all([
      supabase.from('circles').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('daily_questions')
        .select('id, question_text, drops_at')
        .eq('circle_id', id)
        .order('drops_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc('get_circle_feed', { p_circle_id: id }),
    ]);

    if (circleRes.data) setCircle(circleRes.data as Circle);

    if (questionRes.data) {
      const { count } = await supabase
        .from('question_answers')
        .select('id', { count: 'exact', head: true })
        .eq('question_id', questionRes.data.id);
      setQuestion({
        ...questionRes.data,
        answer_count: count ?? 0,
      });
    }

    if (feedRes.data) setPosts(feedRes.data as FeedPost[]);

    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
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

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.circleName} numberOfLines={1}>
          {circle?.name}
        </Text>
        <Pressable
          onPress={() => router.push(`/circles/${id}/info`)}
          hitSlop={12}
          style={styles.info}
        >
          <View style={styles.infoDot} />
          <View style={styles.infoDot} />
          <View style={styles.infoDot} />
        </Pressable>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {question && (
              <QuestionCard
                question={question}
                circleId={id ?? ''}
                onAnswer={() => router.push(`/circles/${id}/answer?qid=${question.id}`)}
              />
            )}
            <Pressable
              onPress={() => router.push(`/circles/${id}/compose`)}
              style={({ pressed }) => [styles.composePrompt, pressed && styles.composePromptPressed]}
            >
              <Text style={styles.composePromptText}>Share something…</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => <PostCard post={item} currentUserId={user?.id ?? ''} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Nothing here yet. Be the first to share something quietly.
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.inkMuted}
          />
        }
      />
    </Screen>
  );
}

function QuestionCard({
  question,
  circleId,
  onAnswer,
}: {
  question: DailyQuestion;
  circleId: string;
  onAnswer: () => void;
}) {
  return (
    <Pressable
      onPress={onAnswer}
      style={({ pressed }) => [styles.questionCard, pressed && styles.questionCardPressed]}
    >
      <Text style={styles.questionLabel}>TODAY'S QUESTION</Text>
      <Text style={styles.questionText}>{question.question_text}</Text>
      <Text style={styles.questionMeta}>
        {question.answer_count > 0
          ? `${question.answer_count} answered — tap to see`
          : 'Tap to answer'}
      </Text>
    </Pressable>
  );
}

function PostCard({ post, currentUserId }: { post: FeedPost; currentUserId: string }) {
  const timeAgo = formatRelative(post.created_at);
  const isMine = post.author_id === currentUserId;

  return (
    <View style={styles.postCard}>
      <View style={styles.postHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {post.author_name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.postAuthor}>{post.author_name}</Text>
        <Text style={styles.postTime}>{timeAgo}</Text>
      </View>

      {post.photo_url && (
        <Image
          source={{ uri: post.photo_url }}
          style={styles.postImage}
          contentFit="cover"
          transition={200}
        />
      )}

      {post.body && <Text style={styles.postBody}>{post.body}</Text>}

      <View style={styles.reactionRow}>
        <ReactionButton kind="heart" count={post.reaction_counts.heart ?? 0} active={post.user_reactions.includes('heart')} postId={post.id} />
        <ReactionButton kind="laugh" count={post.reaction_counts.laugh ?? 0} active={post.user_reactions.includes('laugh')} postId={post.id} />
        <ReactionButton kind="wow" count={post.reaction_counts.wow ?? 0} active={post.user_reactions.includes('wow')} postId={post.id} />
        <ReactionButton kind="support" count={post.reaction_counts.support ?? 0} active={post.user_reactions.includes('support')} postId={post.id} />
      </View>
    </View>
  );
}

function ReactionButton({
  kind,
  count,
  active,
  postId,
}: {
  kind: 'heart' | 'laugh' | 'wow' | 'support';
  count: number;
  active: boolean;
  postId: string;
}) {
  const [optimisticActive, setOptimisticActive] = useState(active);
  const [optimisticCount, setOptimisticCount] = useState(count);

  const emoji = { heart: '♥', laugh: 'ha', wow: '!', support: '+' }[kind];

  const toggle = async () => {
    const wasActive = optimisticActive;
    setOptimisticActive(!wasActive);
    setOptimisticCount((c) => c + (wasActive ? -1 : 1));

    if (wasActive) {
      await supabase.from('reactions').delete().match({ post_id: postId, kind });
    } else {
      const { data: sess } = await supabase.auth.getSession();
      await supabase.from('reactions').insert({
        post_id: postId,
        user_id: sess.session?.user.id,
        kind,
      });
    }
  };

  return (
    <Pressable
      onPress={toggle}
      hitSlop={6}
      style={({ pressed }) => [
        styles.reaction,
        optimisticActive && styles.reactionActive,
        pressed && styles.reactionPressed,
      ]}
    >
      <Text style={[styles.reactionEmoji, optimisticActive && styles.reactionEmojiActive]}>{emoji}</Text>
      {optimisticCount > 0 && (
        <Text style={[styles.reactionCount, optimisticActive && styles.reactionCountActive]}>
          {optimisticCount}
        </Text>
      )}
    </Pressable>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const mins = Math.floor((now - then) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  circleName: {
    flex: 1,
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  info: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  infoDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.inkMuted,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  gap: {
    height: spacing.md,
  },

  questionCard: {
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  questionCardPressed: {
    backgroundColor: colors.border,
  },
  questionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  questionText: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    lineHeight: (typography.subtitle + 2) * typography.lineNormal,
    letterSpacing: -0.2,
  },
  questionMeta: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },

  composePrompt: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  composePromptPressed: {
    backgroundColor: colors.bgPanel,
  },
  composePromptText: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkFaint,
  },

  postCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  postHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  postAuthor: {
    flex: 1,
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  postTime: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.bgPanel,
  },
  postBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineNormal,
  },

  reactionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  reaction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 28,
  },
  reactionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgPanel,
  },
  reactionPressed: {
    transform: [{ scale: 0.96 }],
  },
  reactionEmoji: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkMuted,
  },
  reactionEmojiActive: {
    color: colors.accent,
  },
  reactionCount: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkMuted,
  },
  reactionCountActive: {
    color: colors.accent,
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
    maxWidth: 260,
    lineHeight: typography.body * typography.lineRelaxed,
  },
});
