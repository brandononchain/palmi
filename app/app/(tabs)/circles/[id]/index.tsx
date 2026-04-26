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

import { Button } from '@/components/Button';
import { FadeUpView } from '@/components/FadeUpView';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { moderateAndInsert } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { Circle, CircleProfile, FeedPost } from '@/lib/database.types';
import { colors, motion, radius, spacing, typography } from '@/theme/tokens';

interface DailyQuestion {
  id: string;
  question_text: string;
  drops_at: string;
  answer_count: number;
}

interface Member {
  id: string;
  display_name: string;
  role: 'member' | 'co_host' | 'owner';
}

const QUICK_MAX = 500;
const MENTION_TRIGGER = /(^|\s)@([\w]{0,24})$/;

function haptic(kind: 'light' | 'select' | 'success' | 'warn' = 'light') {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === 'select') void Haptics.selectionAsync();
    else if (kind === 'success') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (kind === 'warn') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  } catch {
    // Ignore haptic failures on older devices.
  }
}

export default function CircleFeedScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, profile } = useAuth();

  let tabBarHeight = 0;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {
    tabBarHeight = 0;
  }

  const [circle, setCircle] = useState<Circle | null>(null);
  const [circleProfile, setCircleProfile] = useState<CircleProfile | null>(null);
  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<FeedPost | null>(null);
  const [mentionMap, setMentionMap] = useState<Record<string, string>>({});
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const inputRef = useRef<RNTextInput | null>(null);
  const listRef = useRef<FlatList<FeedPost> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    if (!id) return;

    const [circleRes, questionRes, feedRes, memberRes, profileRes] = await Promise.all([
      (supabase.from('circles') as any).select('*').eq('id', id).maybeSingle(),
      (supabase.from('daily_questions') as any)
        .select('id, question_text, drops_at')
        .eq('circle_id', id)
        .order('drops_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      (supabase.rpc as any)('get_circle_feed', { p_circle_id: id }),
      (supabase.from('memberships') as any)
        .select('user_id, role, profiles!inner(id, display_name)')
        .eq('circle_id', id)
        .is('left_at', null),
      (supabase.from('circle_profile') as any).select('*').eq('circle_id', id).maybeSingle(),
    ]);

    if (circleRes.data) setCircle(circleRes.data as Circle);
    if (profileRes.data) setCircleProfile(profileRes.data as CircleProfile);

    if (questionRes.data) {
      const { count } = await (supabase.from('question_answers') as any)
        .select('id', { count: 'exact', head: true })
        .eq('question_id', questionRes.data.id);
      setQuestion({ ...questionRes.data, answer_count: count ?? 0 });
    } else {
      setQuestion(null);
    }

    if (feedRes.data) setPosts(feedRes.data as FeedPost[]);

    if (memberRes.data) {
      const rows: Member[] = (memberRes.data as any[])
        .map((row) => ({
          id: row.user_id,
          display_name: row.profiles?.display_name ?? '?',
          role: row.role,
        }))
        .filter((member) => !!member.id && !!member.display_name);
      setMembers(rows);
    }

    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const onChangeDraft = (nextDraft: string) => {
    if (nextDraft.length > QUICK_MAX) return;
    setDraft(nextDraft);
    if (sendError) setSendError(null);

    const match = nextDraft.match(MENTION_TRIGGER);
    if (match) {
      setMentionQuery(match[2] ? match[2].toLowerCase() : '');
    } else {
      setMentionQuery(null);
    }

    setMentionMap((current) => {
      const next: Record<string, string> = {};
      for (const name of Object.keys(current)) {
        const mentionId = current[name];
        if (mentionId && nextDraft.includes(`@${name}`)) next[name] = mentionId;
      }
      return next;
    });
  };

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.trim();
    return members
      .filter((member) => member.id !== user?.id)
      .filter((member) => (query === '' ? true : member.display_name.toLowerCase().includes(query)))
      .slice(0, 6);
  }, [members, mentionQuery, user?.id]);

  const pickMention = (member: Member) => {
    haptic('select');
    const token = member.display_name.replace(/\s+/g, '');
    const replaced = draft.replace(MENTION_TRIGGER, (_full, pre) => `${pre}@${token} `);
    setDraft(replaced);
    setMentionMap((current) => ({ ...current, [token]: member.id }));
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

  const handleQuickSend = async () => {
    const text = draft.trim();
    if (!id || !user || !text || sending) return;

    setSending(true);
    setSendError(null);
    haptic('light');

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

    setPosts((current) => [optimistic, ...current]);
    setDraft('');
    setMentionMap({});
    setMentionQuery(null);
    const priorReply = replyingTo;
    setReplyingTo(null);

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
      setPosts((current) => current.filter((post) => post.id !== tempId));
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
  const currentMember = members.find((member) => member.id === user?.id) ?? null;
  const isHost = currentMember?.role === 'owner' || currentMember?.role === 'co_host';
  const roleLabel =
    currentMember?.role === 'owner'
      ? 'host'
      : currentMember?.role === 'co_host'
        ? 'co-host'
        : 'member';
  const memberCount = circle?.member_count ?? members.length;
  const circleSummary = getCircleSummary(circle, circleProfile);
  const featuredMembers = [...members].sort((left, right) => {
    const rank = { owner: 0, co_host: 1, member: 2 } as const;
    return (
      rank[left.role] - rank[right.role] || left.display_name.localeCompare(right.display_name)
    );
  });
  const visibleMembers = featuredMembers.slice(0, 4);
  const overflowMembers = Math.max(0, members.length - visibleMembers.length);

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.replace('/(tabs)/circles')}
            hitSlop={12}
            style={styles.headerBtn}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
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
          renderItem={({ item, index }) => (
            <FadeUpView delay={motion.stagger * Math.min(index + 5, 12)}>
              <PostCard post={item} currentUserId={user?.id ?? ''} onReply={startReply} />
            </FadeUpView>
          )}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <FadeUpView>
                <View style={styles.heroWrap}>
                  <View style={styles.heroMetaRow}>
                    {circleProfile?.purpose ? (
                      <View style={styles.heroChip}>
                        <Text style={styles.heroChipText}>{circleProfile.purpose}</Text>
                      </View>
                    ) : null}
                    <View style={styles.heroChip}>
                      <Text style={styles.heroChipText}>
                        {circle?.discoverable ? 'findable by fit' : 'private by default'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.heroTitle}>{circle?.name}</Text>
                  <Text style={styles.heroBody}>{circleSummary}</Text>
                </View>
              </FadeUpView>

              <FadeUpView delay={motion.stagger}>
                <View style={styles.summaryCard}>
                  <SummaryStat value={String(memberCount)} label="people here" />
                  <SummaryStat value={String(question?.answer_count ?? 0)} label="answered today" />
                  <SummaryStat value={roleLabel} label="your place" />
                </View>
              </FadeUpView>

              <FadeUpView delay={motion.stagger * 2}>
                {question ? (
                  <RitualCard
                    question={question}
                    onAnswer={() => router.push(`/circles/${id}/answer?qid=${question.id}`)}
                  />
                ) : (
                  <QuietCard onOpenInfo={() => router.push(`/circles/${id}/info`)} />
                )}
              </FadeUpView>

              <FadeUpView delay={motion.stagger * 3}>
                <CircleContextCard
                  members={visibleMembers}
                  memberCount={memberCount}
                  overflowMembers={overflowMembers}
                  isHost={isHost}
                  roleLabel={roleLabel}
                  onOpenRecaps={() => router.push(`/circles/${id}/recaps`)}
                  onOpenInfo={() => router.push(`/circles/${id}/info`)}
                />
              </FadeUpView>

              <FadeUpView delay={motion.stagger * 4}>
                <View style={styles.feedHeader}>
                  <Text style={styles.feedLabel}>recently moved</Text>
                  <Text style={styles.feedNote}>
                    after the ritual, this is what shifted in the room.
                  </Text>
                </View>
              </FadeUpView>
            </View>
          }
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

        {showMentionList && (
          <View style={styles.mentionList}>
            {filteredMembers.map((member) => (
              <Pressable
                key={member.id}
                onPress={() => pickMention(member)}
                style={({ pressed }) => [styles.mentionRow, pressed && styles.mentionRowPressed]}
              >
                <View style={styles.mentionAvatar}>
                  <Text style={styles.mentionAvatarText}>
                    {member.display_name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.mentionName}>{member.display_name}</Text>
              </Pressable>
            ))}
          </View>
        )}

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

function SummaryStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.summaryStat}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function RitualCard({ question, onAnswer }: { question: DailyQuestion; onAnswer: () => void }) {
  return (
    <View style={styles.ritualWrap}>
      <View style={styles.ritualCard}>
        <Text style={styles.ritualLabel}>today&apos;s ritual</Text>
        <Text style={styles.ritualTitle}>start here.</Text>
        <Text style={styles.ritualBody}>{question.question_text}</Text>
        <Text style={styles.ritualNote}>
          {question.answer_count > 0
            ? `${question.answer_count} ${question.answer_count === 1 ? 'person has' : 'people have'} answered already.`
            : 'no one has answered yet.'}
        </Text>
        <Button onPress={onAnswer} fullWidth={false}>
          answer now
        </Button>
      </View>
    </View>
  );
}

function QuietCard({ onOpenInfo }: { onOpenInfo: () => void }) {
  return (
    <View style={styles.ritualWrap}>
      <View style={styles.quietCard}>
        <Text style={styles.ritualLabel}>today</Text>
        <Text style={styles.ritualTitle}>no question is open.</Text>
        <Text style={styles.ritualNote}>
          this room is quiet right now. you can check the settings or leave it soft.
        </Text>
        <Button onPress={onOpenInfo} variant="secondary" fullWidth={false}>
          open circle info
        </Button>
      </View>
    </View>
  );
}

function CircleContextCard({
  members,
  memberCount,
  overflowMembers,
  isHost,
  roleLabel,
  onOpenRecaps,
  onOpenInfo,
}: {
  members: Member[];
  memberCount: number;
  overflowMembers: number;
  isHost: boolean;
  roleLabel: string;
  onOpenRecaps: () => void;
  onOpenInfo: () => void;
}) {
  const hostCount = members.filter((member) => member.role !== 'member').length;
  const hostNames = members
    .filter((member) => member.role !== 'member')
    .map((member) => member.display_name)
    .slice(0, 2);

  const hostCopy =
    hostNames.length > 0
      ? `kept by ${hostNames.join(hostNames.length > 1 ? ' and ' : '')}.`
      : 'kept small on purpose.';

  const introTitle = isHost ? 'you help hold this room.' : 'you belong in this room.';
  const introBody = isHost
    ? `${memberCount} ${memberCount === 1 ? 'person' : 'people'} here. you’re in as ${roleLabel}. ${hostCopy} shape the threshold, invite path, and settings with care.`
    : `${memberCount} ${memberCount === 1 ? 'person' : 'people'} here. you’re in as ${roleLabel}. ${hostCopy}`;

  return (
    <View style={styles.contextWrap}>
      <View style={[styles.contextCard, isHost && styles.contextCardHost]}>
        <Text style={styles.contextLabel}>{isHost ? 'stewarding this room' : 'in this room'}</Text>
        <View style={styles.contextIntro}>
          <Text style={styles.contextTitle}>{introTitle}</Text>
          <Text style={styles.contextBody}>{introBody}</Text>
        </View>
        <View style={styles.contextStats}>
          <View style={[styles.contextStatPill, isHost && styles.contextStatPillHost]}>
            <Text style={styles.contextStatValue}>{memberCount}</Text>
            <Text style={styles.contextStatLabel}>people</Text>
          </View>
          <View style={[styles.contextStatPill, isHost && styles.contextStatPillHost]}>
            <Text style={styles.contextStatValue}>{hostCount}</Text>
            <Text style={styles.contextStatLabel}>{hostCount === 1 ? 'host' : 'hosts'}</Text>
          </View>
          <View style={[styles.contextStatPill, isHost && styles.contextStatPillHost]}>
            <Text style={styles.contextStatValue}>{roleLabel}</Text>
            <Text style={styles.contextStatLabel}>{isHost ? 'your role' : 'your place'}</Text>
          </View>
        </View>
        <View style={styles.memberWrap}>
          {members.map((member) => (
            <View key={member.id} style={styles.memberChip}>
              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>
                  {member.display_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.memberTextWrap}>
                <Text style={styles.memberChipText}>{member.display_name}</Text>
                {member.role !== 'member' ? (
                  <Text style={styles.memberRoleText}>
                    {member.role === 'owner' ? 'host' : 'co-host'}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
          {overflowMembers > 0 && (
            <View style={styles.memberChip}>
              <Text style={styles.memberOverflowText}>+{overflowMembers} more</Text>
            </View>
          )}
        </View>
        <View style={styles.contextActions}>
          {isHost ? (
            <>
              <Button onPress={onOpenInfo} variant="secondary" fullWidth={false}>
                manage circle
              </Button>
              <Button onPress={onOpenRecaps} variant="ghost" fullWidth={false}>
                recaps
              </Button>
            </>
          ) : (
            <>
              <Button onPress={onOpenRecaps} variant="secondary" fullWidth={false}>
                recaps
              </Button>
              <Button onPress={onOpenInfo} variant="ghost" fullWidth={false}>
                circle info
              </Button>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

function renderBody(body: string) {
  const parts = body.split(/(@[\w]{1,24})/g);
  return parts.map((part, index) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <Text key={index} style={styles.mentionInBody}>
          {part}
        </Text>
      );
    }
    return <Text key={index}>{part}</Text>;
  });
}

function PostCard({
  post,
  currentUserId,
  onReply,
}: {
  post: FeedPost;
  currentUserId: string;
  onReply: (post: FeedPost) => void;
}) {
  const relativeTime = formatRelative(post.created_at);
  const isMine = post.author_id === currentUserId;
  const isTemp = post.id.startsWith('temp-');

  return (
    <View style={[styles.postCard, isMine && styles.postCardMine, isTemp && styles.postCardTemp]}>
      {post.reply_to_id && post.reply_to_author_name && (
        <View style={styles.replyContext}>
          <Ionicons name="arrow-undo" size={12} color={colors.inkMuted} />
          <Text style={styles.replyContextText} numberOfLines={1}>
            replying to {post.reply_to_author_name}
            {post.reply_to_body ? ` — ${post.reply_to_body}` : ''}
          </Text>
        </View>
      )}

      <View style={styles.postHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{post.author_name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.postAuthor}>{isMine ? 'you' : post.author_name}</Text>
        <Text style={styles.postTime}>{relativeTime}</Text>
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
        <View style={styles.flexSpacer} />
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
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false;
    videoPlayer.muted = true;
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
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;

    haptic('select');
    const wasActive = optimisticActive;
    setOptimisticActive(!wasActive);
    setOptimisticCount((current) => Math.max(0, current + (wasActive ? -1 : 1)));

    if (wasActive) {
      const { error } = await (supabase.from('reactions') as any)
        .delete()
        .match({ post_id: postId, user_id: userId, kind });
      if (error) {
        setOptimisticActive(true);
        setOptimisticCount((current) => current + 1);
      }
    } else {
      const { error } = await (supabase.from('reactions') as any).insert({
        post_id: postId,
        user_id: userId,
        kind,
      });
      if (error) {
        setOptimisticActive(false);
        setOptimisticCount((current) => Math.max(0, current - 1));
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
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getCircleSummary(circle: Circle | null, circleProfile: CircleProfile | null) {
  if (circle?.onboarding_note?.trim()) return circle.onboarding_note.trim();
  if (circleProfile?.summary?.trim()) return circleProfile.summary.trim();
  if (circleProfile?.purpose === 'study') return 'A small study room for showing up together.';
  if (circleProfile?.purpose === 'professional')
    return 'A quiet room for work, craft, and steady mutual help.';
  if (circleProfile?.purpose === 'wellness')
    return 'A gentle room for habits, care, and consistent check-ins.';
  if (circleProfile?.purpose === 'creator')
    return 'A small room for works in progress and thoughtful feedback.';
  return 'A quiet place for your people.';
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  flexSpacer: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
    borderRadius: radius.full,
  },
  headerTitle: {
    flex: 1,
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  list: {
    paddingBottom: spacing.lg,
  },
  emptyListContainer: {
    flexGrow: 1,
  },
  listHeader: {
    paddingTop: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  heroWrap: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  heroMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  heroChip: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  heroChipText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkMuted,
  },
  heroTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    color: colors.ink,
    lineHeight: typography.display * 1.12,
    letterSpacing: typography.trackTight,
  },
  heroBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
    maxWidth: 340,
  },
  summaryCard: {
    marginHorizontal: spacing.lg,
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
  ritualWrap: {
    paddingHorizontal: spacing.lg,
  },
  ritualCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  quietCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  ritualLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  ritualTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
  },
  ritualBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    lineHeight: typography.subtitle * typography.lineRelaxed,
  },
  ritualNote: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  contextWrap: {
    paddingHorizontal: spacing.lg,
  },
  contextCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  contextCardHost: {
    backgroundColor: colors.bgPanel,
  },
  contextLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  contextIntro: {
    gap: spacing.xs,
  },
  contextTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  contextBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  contextStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  contextStatPill: {
    minWidth: 92,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.bgPanel,
    gap: 2,
  },
  contextStatPillHost: {
    backgroundColor: colors.bgCard,
  },
  contextStatValue: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
  },
  contextStatLabel: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  memberWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
  },
  memberAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkMuted,
  },
  memberChipText: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.ink,
  },
  memberTextWrap: {
    gap: 1,
  },
  memberRoleText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
  },
  memberOverflowText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  contextActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  feedHeader: {
    paddingHorizontal: spacing.lg,
    gap: 2,
    paddingTop: spacing.xs,
  },
  feedLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  feedNote: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  gap: {
    height: spacing.sm,
  },
  postCard: {
    marginHorizontal: spacing.lg,
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
    borderRadius: radius.full,
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
