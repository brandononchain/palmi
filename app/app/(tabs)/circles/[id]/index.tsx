import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import { VideoView, useVideoPlayer } from 'expo-video';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { Screen } from '@/components/Screen';
import { supabase } from '@/lib/supabase';
import { moderateAndInsert } from '@/lib/moderation';
import type { Circle, FeedPost } from '@/lib/database.types';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface DailyQuestion {
  id: string;
  question_text: string;
  drops_at: string;
  answer_count: number;
}

interface Member {
  id: string;
  display_name: string;
}

const QUICK_MAX = 500;

// Matches a trailing "@query" at the very end of the draft so we can pop the
// mention picker. Captures the query (letters + numbers + underscore + space).
const MENTION_TRIGGER = /(^|\s)@([\w]{0,24})$/;

function haptic(kind: 'light' | 'select' | 'success' | 'warn' = 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === 'select') void Haptics.selectionAsync();
    else if (kind === 'success')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'warn')
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Older Android devices sometimes throw -- ignore.
  }
}

export default function CircleFeedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();

  let tabBarHeight = 0;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0;
  }

  const [circle, setCircle] = useState<Circle | null>(null);
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  // Composer state
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<FeedPost | null>(null);
  // Map of display_name -> user_id for any @name inserted in the draft.
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const inputRef = useRef<RNTextInput | null>(null);
  const listRef = useRef<FlatList<FeedPost> | null>(null);

  const load = useCallback(async () => {
    if (!id) return;

    const [circleRes, questionRes, feedRes, memberRes] = await Promise.all([
      (supabase.from('circles') as any).select('*').eq('id', id).maybeSingle(),
      (supabase.from('daily_questions') as any)
        .select('id, question_text, drops_at')
        .eq('circle_id', id)
        .order('drops_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      (supabase.rpc as any)('get_circle_feed', { p_circle_id: id }),
      (supabase.from('memberships') as any)
        .select('user_id, profiles!inner(id, display_name)')
        .eq('circle_id', id)
        .is('left_at', null),
    ]);

    if (circleRes.data) setCircle(circleRes.data as Circle);

    if (questionRes.data) {
      const { count } = await (supabase.from('question_answers') as any)
        .select('id', { count: 'exact', head: true })
        .eq('question_id', questionRes.data.id);
      setQuestion({ ...questionRes.data, answer_count: count ?? 0 });
    }

    if (feedRes.data) setPosts(feedRes.data as FeedPost[]);

    if (memberRes.data) {
      const ms: Member[] = (memberRes.data as any[])
        .map((row) => row.profiles)
        .filter((p) => p && p.id && p.display_name)
        .map((p: any) => ({ id: p.id, display_name: p.display_name }));
      setMembers(ms);
    }

    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: posts + reactions for this circle.
  const channelRef = useRef<RealtimeChannel | null>(null);
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`circle:${id}`)
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'posts', filter: `circle_id=eq.${id}` },
        () => {
          void load();
        }
      )
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'reactions' }, () => {
        void load();
      })
      .subscribe();

    channelRef.current = channel;
    return () => {
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [id, load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  // --- Mention autocomplete ------------------------------------------------
  const onChangeDraft = (t: string) => {
    if (t.length > QUICK_MAX) return;
    setDraft(t);
    if (sendError) setSendError(null);

    const m = t.match(MENTION_TRIGGER);
    if (m) {
      const mentionToken = m[2];
      setMentionQuery(mentionToken ? mentionToken.toLowerCase() : '');
    } else {
      setMentionQuery(null);
    }

    // Prune mentionMap entries whose @Name no longer appears in the text.
    setMentionMap((prev) => {
      const next: Record<string, string> = {};
      for (const name of Object.keys(prev)) {
        const mentionId = prev[name];
        if (mentionId && t.includes(`@${name}`)) next[name] = mentionId;
      }
      return next;
    });
  };

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim();
    return members
      .filter((m) => m.id !== user?.id)
      .filter((m) => (q === '' ? true : m.display_name.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [members, mentionQuery, user?.id]);

  const pickMention = (m: Member) => {
    haptic('select');
    // Replace the trailing @query with "@DisplayName " (safe chars in name
    // regex: we only strip whitespace inside the token, so usernames with
    // spaces would need handling. Our display_name can have spaces, so we
    // replace with first name or first-word slug.)
    const token = m.display_name.replace(/\s+/g, '');
    const replaced = draft.replace(MENTION_TRIGGER, (_full, pre) => `${pre}@${token} `);
    setDraft(replaced);
    setMentionMap((prev) => ({ ...prev, [token]: m.id }));
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const startReply = useCallback((post: FeedPost) => {
    haptic('select');
    setReplyingTo(post);
    inputRef.current?.focus();
  }, []);

  const cancelReply = () => {
    setReplyingTo(null);
  };

  // --- Send ---------------------------------------------------------------
  const handleQuickSend = async () => {
    const text = draft.trim();
    if (!id || !user || !text || sending) return;

    setSending(true);
    setSendError(null);
    haptic('light');

    // Resolve mentions present in the final text.
    const activeMentionIds: string[] = [];
    for (const name of Object.keys(mentionMap)) {
      const mentionId = mentionMap[name];
      if (mentionId && text.includes(`@${name}`)) activeMentionIds.push(mentionId);
    }

    const tempId = `temp-${Date.now()}`;
    const optimistic: FeedPost = {
      id: tempId,
      author_id: user.id,
      author_name: profile?.display_name ?? 'you',
      author_avatar: null,
      body: text,
      photo_url: null,
      video_url: null,
      reply_to_id: replyingTo?.id ?? null,
      reply_to_author_name: replyingTo?.author_name ?? null,
      reply_to_body: replyingTo?.body ?? null,
      mentioned_user_ids: activeMentionIds,
      created_at: new Date().toISOString(),
      reaction_counts: { heart: 0, laugh: 0, wow: 0, support: 0 },
      user_reactions: [],
    };
    setPosts((prev) => [optimistic, ...prev]);
    setDraft('');
    setMentionMap({});
    setMentionQuery(null);
    const priorReply = replyingTo;
    setReplyingTo(null);

    // Snap list to top so the user sees their message.
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });

    const result = await moderateAndInsert({
      circle_id: id,
      content_type: 'post',
      body: text,
      reply_to_id: priorReply?.id ?? null,
      mentions: activeMentionIds.length > 0 ? activeMentionIds : undefined,
    });

    setSending(false);

    if (result.verdict === 'reject') {
      haptic('warn');
      setPosts((prev) => prev.filter((p) => p.id !== tempId));
      setDraft(text);
      if (priorReply) setReplyingTo(priorReply);
      setSendError(result.reason ?? "That didn't send -- try rewording.");
      return;
    }
    haptic('success');
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

  const showMentionList = mentionQuery !== null && filteredMembers.length > 0;

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              // Always land on the circles list tab. Using router.back() can
              // pop into the home tab when the detail was pushed from home.
              router.replace('/(tabs)/circles');
            }}
            hitSlop={12}
            style={styles.headerBtn}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.circleName} numberOfLines={1}>
            {circle?.name}
          </Text>
          <Pressable
            onPress={() => router.push(`/circles/${id}/info`)}
            hitSlop={12}
            style={styles.headerBtn}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={posts}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            question ? (
              <View style={styles.listHeader}>
                <QuestionCard
                  question={question}
                  onAnswer={() => router.push(`/circles/${id}/answer?qid=${question.id}`)}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <PostCard post={item} currentUserId={user?.id ?? ''} onReply={startReply} />
          )}
          contentContainerStyle={[styles.list, posts.length === 0 && styles.emptyListContainer]}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                nothing here yet. say something below to break the silence.
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        />

        {/* Mention autocomplete overlay */}
        {showMentionList && (
          <View style={styles.mentionList}>
            {filteredMembers.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => pickMention(m)}
                style={({ pressed }) => [styles.mentionRow, pressed && styles.mentionRowPressed]}
              >
                <View style={styles.mentionAvatar}>
                  <Text style={styles.mentionAvatarText}>
                    {m.display_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.mentionName}>{m.display_name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Reply chip */}
        {replyingTo && (
          <View style={styles.replyChip}>
            <Ionicons name="arrow-undo" size={14} color={colors.accent} />
            <View style={styles.replyChipText}>
              <Text style={styles.replyChipLabel}>
                replying to{' '}
                {replyingTo.author_id === user?.id ? 'yourself' : replyingTo.author_name}
              </Text>
              {replyingTo.body && (
                <Text style={styles.replyChipBody} numberOfLines={1}>
                  {replyingTo.body}
                </Text>
              )}
            </View>
            <Pressable onPress={cancelReply} hitSlop={10}>
              <Ionicons name="close" size={16} color={colors.inkMuted} />
            </Pressable>
          </View>
        )}

        <View style={styles.quickBar}>
          {sendError && <Text style={styles.quickError}>{sendError}</Text>}
          <View style={styles.quickRow}>
            <Pressable
              onPress={() => router.push(`/circles/${id}/compose`)}
              hitSlop={8}
              style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}
            >
              <Ionicons name="add-circle-outline" size={26} color={colors.inkMuted} />
            </Pressable>
            <RNTextInput
              ref={inputRef}
              value={draft}
              onChangeText={onChangeDraft}
              placeholder={replyingTo ? 'write your reply...' : 'message the circle...'}
              placeholderTextColor={colors.inkFaint}
              style={styles.quickInput}
              multiline
              maxLength={QUICK_MAX}
            />
            <Pressable
              onPress={handleQuickSend}
              disabled={!draft.trim() || sending}
              hitSlop={8}
              style={({ pressed }) => [
                styles.sendBtn,
                (!draft.trim() || sending) && styles.sendBtnDisabled,
                pressed && styles.sendBtnPressed,
              ]}
            >
              {sending ? (
                <ActivityIndicator color={colors.bg} size="small" />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={draft.trim() ? colors.bg : colors.inkFaint}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function QuestionCard({ question, onAnswer }: { question: DailyQuestion; onAnswer: () => void }) {
  return (
    <Pressable
      onPress={onAnswer}
      style={({ pressed }) => [styles.questionCard, pressed && styles.questionCardPressed]}
    >
      <Text style={styles.questionLabel}>TODAY'S QUESTION</Text>
      <Text style={styles.questionText}>{question.question_text}</Text>
      <Text style={styles.questionMeta}>
        {question.answer_count > 0
          ? `${question.answer_count} answered -- tap to see`
          : 'Tap to answer'}
      </Text>
    </Pressable>
  );
}

// Render the post body with @mentions highlighted in accent color.
function renderBody(body: string) {
  const parts = body.split(/(@[\w]{1,24})/g);
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <Text key={i} style={styles.mentionInBody}>
          {part}
        </Text>
      );
    }
    return <Text key={i}>{part}</Text>;
  });
}

function PostCard({
  post,
  currentUserId,
  onReply,
}: {
  post: FeedPost;
  currentUserId: string;
  onReply: (p: FeedPost) => void;
}) {
  const timeAgo = formatRelative(post.created_at);
  const isMine = post.author_id === currentUserId;
  const isTemp = post.id.startsWith('temp-');

  return (
    <View style={[styles.postCard, isMine && styles.postCardMine, isTemp && styles.postCardTemp]}>
      {post.reply_to_id && post.reply_to_author_name && (
        <View style={styles.replyContext}>
          <Ionicons name="arrow-undo" size={12} color={colors.inkMuted} />
          <Text style={styles.replyContextText} numberOfLines={1}>
            replying to {post.reply_to_author_name}
            {post.reply_to_body ? ` -- ${post.reply_to_body}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.postHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.author_name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.postAuthor}>{isMine ? 'you' : post.author_name}</Text>
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

      {post.video_url && <PostVideo uri={post.video_url} />}

      {post.body && <Text style={styles.postBody}>{renderBody(post.body)}</Text>}

      <View style={styles.reactionRow}>
        <ReactionButton
          kind="heart"
          count={post.reaction_counts.heart ?? 0}
          active={post.user_reactions.includes('heart')}
          postId={post.id}
        />
        <ReactionButton
          kind="laugh"
          count={post.reaction_counts.laugh ?? 0}
          active={post.user_reactions.includes('laugh')}
          postId={post.id}
        />
        <ReactionButton
          kind="wow"
          count={post.reaction_counts.wow ?? 0}
          active={post.user_reactions.includes('wow')}
          postId={post.id}
        />
        <ReactionButton
          kind="support"
          count={post.reaction_counts.support ?? 0}
          active={post.user_reactions.includes('support')}
          postId={post.id}
        />
        <View style={{ flex: 1 }} />
        {!isTemp && (
          <Pressable
            onPress={() => onReply(post)}
            hitSlop={6}
            style={({ pressed }) => [styles.reaction, pressed && styles.reactionPressed]}
          >
            <Ionicons name="chatbubble-outline" size={14} color={colors.inkMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PostVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.muted = true;
  });
  return (
    <View style={styles.videoWrap}>
      <VideoView
        player={player}
        style={styles.video}
        nativeControls
        contentFit="cover"
        allowsFullscreen
      />
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

  useEffect(() => {
    setOptimisticActive(active);
    setOptimisticCount(count);
  }, [active, count]);

  const iconMap: Record<
    'heart' | 'laugh' | 'wow' | 'support',
    { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }
  > = {
    heart: { on: 'heart', off: 'heart-outline' },
    laugh: { on: 'happy', off: 'happy-outline' },
    wow: { on: 'flash', off: 'flash-outline' },
    support: { on: 'hand-left', off: 'hand-left-outline' },
  };
  const icon = optimisticActive ? iconMap[kind].on : iconMap[kind].off;

  const toggle = async () => {
    if (postId.startsWith('temp-')) return;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;

    haptic('select');
    const wasActive = optimisticActive;
    setOptimisticActive(!wasActive);
    setOptimisticCount((c) => Math.max(0, c + (wasActive ? -1 : 1)));

    if (wasActive) {
      const { error } = await (supabase.from('reactions') as any)
        .delete()
        .match({ post_id: postId, user_id: uid, kind });
      if (error) {
        setOptimisticActive(true);
        setOptimisticCount((c) => c + 1);
      }
    } else {
      const { error } = await (supabase.from('reactions') as any).insert({
        post_id: postId,
        user_id: uid,
        kind,
      });
      if (error) {
        setOptimisticActive(false);
        setOptimisticCount((c) => Math.max(0, c - 1));
      }
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
      <Ionicons name={icon} size={14} color={optimisticActive ? colors.accent : colors.inkMuted} />
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
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  circleName: {
    flex: 1,
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  emptyListContainer: {
    flexGrow: 1,
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

  postCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  postCardMine: {
    borderColor: colors.accent,
    backgroundColor: '#FDF6F4',
  },
  postCardTemp: {
    opacity: 0.7,
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
  videoWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  postBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineNormal,
  },
  mentionInBody: {
    color: colors.accent,
    fontFamily: typography.fontSansMedium,
  },

  replyContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  replyContextText: {
    flex: 1,
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkMuted,
  },

  reactionRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
    alignItems: 'center',
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
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: typography.body * typography.lineRelaxed,
  },

  // --- Mention autocomplete list ------------------------------------------
  mentionList: {
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    maxHeight: 220,
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  mentionRowPressed: {
    backgroundColor: colors.bgPanel,
  },
  mentionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionAvatarText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  mentionName: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
  },

  // --- Reply chip ---------------------------------------------------------
  replyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgPanel,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  replyChipText: {
    flex: 1,
  },
  replyChipLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
  },
  replyChipBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },

  // --- Quick send composer ------------------------------------------------
  quickBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 6,
  },
  quickError: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.danger,
    paddingHorizontal: spacing.xs,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachBtnPressed: {
    backgroundColor: colors.bgPanel,
  },
  quickInput: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    maxHeight: 120,
    minHeight: 40,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.border,
  },
  sendBtnPressed: {
    opacity: 0.8,
  },
});
