import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { UpgradeSheet } from '@/components/UpgradeSheet';
import { useAuth } from '@/hooks/useAuth';
import { startCheckout } from '@/lib/billing';
import { getCircleTheme, circleThemes, type CircleThemeKey } from '@/lib/circleThemes';
import type { Circle, Membership, Post, Uuid } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface MemberLite {
  user_id: Uuid;
  role: Membership['role'];
  display_name: string;
}

export default function CirclePremiumScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const [themeKey, setThemeKey] = useState<CircleThemeKey>('paper');
  const [onboardingNote, setOnboardingNote] = useState('');
  const [recapCadence, setRecapCadence] = useState<'monthly' | 'weekly'>('monthly');
  const [discoveryPriority, setDiscoveryPriority] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    const [circleRes, memberRes, postRes] = await Promise.all([
      supabase.from('circles').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('memberships')
        .select('user_id, role, profiles:user_id(display_name)')
        .eq('circle_id', id)
        .is('left_at', null)
        .order('joined_at', { ascending: true }),
      supabase
        .from('posts')
        .select('*')
        .eq('circle_id', id)
        .is('deleted_at', null)
        .eq('moderation_status', 'ok')
        .order('created_at', { ascending: false })
        .limit(12),
    ]);

    const nextCircle = (circleRes.data ?? null) as Circle | null;
    setCircle(nextCircle);
    setThemeKey((nextCircle?.theme_key as CircleThemeKey | undefined) ?? 'paper');
    setOnboardingNote(nextCircle?.onboarding_note ?? '');
    setRecapCadence(nextCircle?.recap_cadence ?? 'monthly');
    setDiscoveryPriority(nextCircle?.discovery_priority ?? 0);
    setPosts((postRes.data ?? []) as Post[]);
    setMembers(
      ((memberRes.data ?? []) as any[]).map((row) => ({
        user_id: row.user_id,
        role: row.role,
        display_name: row.profiles?.display_name ?? 'someone',
      }))
    );
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const myRole = useMemo(
    () => members.find((member) => member.user_id === user?.id)?.role,
    [members, user?.id]
  );
  const canManage = myRole === 'owner' || myRole === 'co_host';
  const isPaidCircle = circle?.tier === 'paid';
  const currentTheme = getCircleTheme(themeKey);

  const persistSettings = async (overrides?: Partial<Circle>) => {
    if (!id || !canManage) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('update_circle_premium_settings', {
      p_circle_id: id,
      p_theme_key: (overrides?.theme_key as CircleThemeKey | undefined) ?? themeKey,
      p_onboarding_note: overrides?.onboarding_note ?? onboardingNote,
      p_recap_cadence:
        (overrides?.recap_cadence as 'monthly' | 'weekly' | undefined) ?? recapCadence,
      p_discovery_priority:
        typeof overrides?.discovery_priority === 'number'
          ? overrides.discovery_priority
          : discoveryPriority,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setCircle((data as Circle | null) ?? circle);
  };

  const toggleCoHost = async (member: MemberLite) => {
    if (!id || myRole !== 'owner' || member.user_id === user?.id) return;
    const nextRole = member.role === 'co_host' ? 'member' : 'co_host';
    const { error } = await supabase.rpc('set_circle_member_role', {
      p_circle_id: id,
      p_member_id: member.user_id,
      p_role: nextRole,
    });
    if (error) {
      Alert.alert('Could not update role', error.message);
      return;
    }
    setMembers((prev) =>
      prev.map((row) => (row.user_id === member.user_id ? { ...row, role: nextRole } : row))
    );
  };

  const pinPost = async (postId: string | null) => {
    if (!id || !canManage) return;
    const { data, error } = await supabase.rpc('pin_circle_post', {
      p_circle_id: id,
      p_post_id: postId,
    });
    if (error) {
      Alert.alert('Could not pin memory', error.message);
      return;
    }
    setCircle((data as Circle | null) ?? circle);
  };

  const startPaidUpgrade = async () => {
    if (!id) return;
    setUpgrading(true);
    try {
      await startCheckout({ kind: 'circle', circle_id: id });
      setShowUpgrade(false);
    } finally {
      setUpgrading(false);
    }
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

  if (!canManage || !circle) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text style={styles.emptyTitle}>owners and co-hosts only.</Text>
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
        <Text style={styles.headerTitle}>premium studio</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroCard, { backgroundColor: currentTheme.cardBg }]}>
          <Text style={styles.eyebrow}>{isPaidCircle ? 'paid circle' : 'circle premium'}</Text>
          <Text style={styles.heroTitle}>{circle.name}</Text>
          <Text style={styles.heroBody}>
            shape how this room feels, what new members see first, and which memories stay at the
            top.
          </Text>
          {!isPaidCircle && (
            <Button onPress={() => setShowUpgrade(true)}>upgrade this circle</Button>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>theme</Text>
          <View style={styles.themeGrid}>
            {Object.values(circleThemes).map((theme) => {
              const selected = theme.key === themeKey;
              return (
                <Pressable
                  key={theme.key}
                  onPress={() => {
                    setThemeKey(theme.key);
                    void persistSettings({ theme_key: theme.key });
                  }}
                  style={[styles.themeCard, selected && styles.themeCardSelected]}
                >
                  <View style={[styles.themeSwatch, { backgroundColor: theme.cardBg }]} />
                  <Text style={styles.themeLabel}>{theme.label}</Text>
                  <Text style={styles.themeNote}>{theme.note}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>custom onboarding note</Text>
          <View style={styles.editorCard}>
            <TextInput
              value={onboardingNote}
              onChangeText={(text) => text.length <= 280 && setOnboardingNote(text)}
              multiline
              placeholder="what should new people understand before they enter this circle?"
              placeholderTextColor={colors.inkFaint}
              style={styles.textarea}
            />
            <View style={styles.rowBetween}>
              <Text style={styles.counter}>{280 - onboardingNote.length}</Text>
              <Button onPress={() => void persistSettings()} loading={saving} fullWidth={false}>
                save note
              </Button>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>recap cadence</Text>
          <View style={styles.optionRow}>
            {(['monthly', 'weekly'] as const).map((value) => {
              const selected = recapCadence === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    setRecapCadence(value);
                    void persistSettings({ recap_cadence: value });
                  }}
                  style={[styles.optionPill, selected && styles.optionPillSelected]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>discovery priority</Text>
          <View style={styles.optionRow}>
            {[0, 25, 50].map((value) => {
              const selected = discoveryPriority === value;
              const label = value === 0 ? 'calm' : value === 25 ? 'visible' : 'priority';
              return (
                <Pressable
                  key={value}
                  onPress={() => {
                    setDiscoveryPriority(value);
                    void persistSettings({ discovery_priority: value });
                  }}
                  style={[styles.optionPill, selected && styles.optionPillSelected]}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>pinned memory</Text>
            <Pressable onPress={() => void pinPost(null)} hitSlop={8}>
              <Text style={styles.link}>clear</Text>
            </Pressable>
          </View>
          <View style={styles.postList}>
            {posts.slice(0, 6).map((post) => {
              const selected = circle.pinned_post_id === post.id;
              return (
                <Pressable
                  key={post.id}
                  onPress={() => void pinPost(post.id)}
                  style={[styles.postCard, selected && styles.postCardSelected]}
                >
                  <Text style={styles.postMeta}>{formatDate(post.created_at)}</Text>
                  <Text style={styles.postBody} numberOfLines={2}>
                    {post.body ?? 'photo only'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionLabel}>co-hosts</Text>
            <Pressable onPress={() => router.push(`/(tabs)/circles/${id}/insights`)} hitSlop={8}>
              <Text style={styles.link}>insights</Text>
            </Pressable>
          </View>
          <View style={styles.memberList}>
            {members.map((member) => (
              <View key={member.user_id} style={styles.memberRow}>
                <View>
                  <Text style={styles.memberName}>{member.display_name}</Text>
                  <Text style={styles.memberRole}>{member.role.replace('_', ' ')}</Text>
                </View>
                {myRole === 'owner' && member.role !== 'owner' ? (
                  <Pressable onPress={() => void toggleCoHost(member)} style={styles.roleToggle}>
                    <Text style={styles.roleToggleText}>
                      {member.role === 'co_host' ? 'remove co-host' : 'make co-host'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <UpgradeSheet
        visible={showUpgrade}
        variant="circle-paid"
        onClose={() => setShowUpgrade(false)}
        onUpgrade={startPaidUpgrade}
        loading={upgrading}
      />
    </Screen>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 32, color: colors.ink, fontWeight: '300', lineHeight: 32 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
  },
  headerSpacer: { width: 44, height: 44 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  heroCard: { borderRadius: radius.xl, padding: spacing.lg, gap: spacing.sm },
  eyebrow: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: { fontFamily: typography.fontSerif, fontSize: typography.display, color: colors.ink },
  heroBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  themeGrid: { gap: spacing.sm },
  themeCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  themeCardSelected: { borderColor: colors.accent },
  themeSwatch: { height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  themeLabel: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  themeNote: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  editorCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  counter: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optionPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
  },
  optionPillSelected: { backgroundColor: colors.ink },
  optionText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  optionTextSelected: { color: colors.bg },
  postList: { gap: spacing.sm },
  postCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  postCardSelected: { borderColor: colors.accent },
  postMeta: { fontFamily: typography.fontSans, fontSize: typography.micro, color: colors.inkFaint },
  postBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  memberList: { gap: spacing.sm },
  memberRow: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  memberName: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.ink,
  },
  memberRole: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  roleToggle: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  roleToggleText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  link: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  emptyTitle: { fontFamily: typography.fontSerif, fontSize: typography.title, color: colors.ink },
});
