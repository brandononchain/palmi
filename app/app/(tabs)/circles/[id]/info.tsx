import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type {
  Circle,
  CircleProfile,
  CirclePurpose,
  IsoDate,
  Uuid,
  AdmissionMode,
} from '@/lib/database.types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface MemberRow {
  user_id: Uuid;
  role: 'member' | 'co_host' | 'owner';
  joined_at: IsoDate;
  display_name: string;
  avatar_url: string | null;
}

interface NotifPrefs {
  daily_question: boolean;
  new_posts: boolean;
  reactions: boolean;
  join_requests: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  daily_question: false,
  new_posts: false,
  reactions: false,
  join_requests: false,
};

const PURPOSE_OPTIONS: { value: CirclePurpose; label: string; hint: string }[] = [
  { value: 'friends', label: 'friends', hint: 'a small group of people who know each other' },
  { value: 'study', label: 'study', hint: 'a class, exam, or shared learning goal' },
  { value: 'professional', label: 'professional', hint: 'work, craft, or industry peers' },
  { value: 'interest', label: 'interest', hint: 'a hobby or shared interest' },
  { value: 'wellness', label: 'wellness', hint: 'movement, habits, or quiet check-ins' },
  { value: 'creator', label: 'creator', hint: 'people sharing work-in-progress' },
  { value: 'local', label: 'local', hint: 'a shared physical place' },
  { value: 'other', label: 'other', hint: 'something that doesn\u2019t fit above' },
];

export default function CircleInfoScreen() {
  const router = useRouter();
  const { id: circleId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [profile, setProfile] = useState<CircleProfile | null>(null);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [purposeOpen, setPurposeOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!circleId || !user) return;

    const [circleRes, memRes, prefRes, profileRes] = await Promise.all([
      supabase.from('circles').select('*').eq('id', circleId).maybeSingle(),
      supabase
        .from('memberships')
        .select('user_id, role, joined_at, profiles:user_id(display_name, avatar_url)')
        .eq('circle_id', circleId)
        .is('left_at', null)
        .order('joined_at', { ascending: true }),
      supabase
        .from('notification_prefs')
        .select('daily_question, new_posts, reactions, join_requests')
        .eq('circle_id', circleId)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('circle_profile').select('*').eq('circle_id', circleId).maybeSingle(),
    ]);

    if (circleRes.data) setCircle(circleRes.data as Circle);
    if (profileRes.data) setProfile(profileRes.data as CircleProfile);
    if (memRes.data) {
      const rows: MemberRow[] = memRes.data.map((r: any) => ({
        user_id: r.user_id,
        role: r.role,
        joined_at: r.joined_at,
        display_name: r.profiles?.display_name ?? '?',
        avatar_url: r.profiles?.avatar_url ?? null,
      }));
      setMembers(rows);
    }
    if (prefRes.data) setPrefs(prefRes.data as NotifPrefs);

    // Owner-only: count pending join requests so we can surface a badge.
    const isOwnerNow = (memRes.data ?? []).some(
      (r: any) => r.user_id === user.id && r.role === 'owner'
    );
    if (isOwnerNow) {
      const { count } = await supabase
        .from('circle_join_requests')
        .select('id', { count: 'exact', head: true })
        .eq('circle_id', circleId)
        .eq('status', 'pending');
      setPendingCount(count ?? 0);
    }

    setLoading(false);
  }, [circleId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentRole = members.find((m) => m.user_id === user?.id)?.role ?? 'member';
  const isOwner = currentRole === 'owner';
  const isHost = currentRole === 'owner' || currentRole === 'co_host';

  const handleCopy = async () => {
    if (!circle?.invite_code) return;
    await Clipboard.setStringAsync(circle.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTogglePref = async (key: keyof NotifPrefs, value: boolean) => {
    if (!user || !circleId) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    await supabase
      .from('notification_prefs')
      .upsert(
        { user_id: user.id, circle_id: circleId, ...next },
        { onConflict: 'user_id,circle_id' }
      );
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave this circle?',
      'You will stop seeing its posts and daily questions. You can rejoin with the invite code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (!circleId) return;
            setLeaving(true);
            const { error } = await supabase.rpc('leave_circle', { p_circle_id: circleId });
            setLeaving(false);
            if (error) {
              Alert.alert('Something went wrong', error.message);
              return;
            }
            router.replace('/circles');
          },
        },
      ]
    );
  };

  const handleRenamed = (nextName: string) => {
    if (circle) setCircle({ ...circle, name: nextName });
    setRenameOpen(false);
  };

  const handlePurposeSaved = (next: CircleProfile) => {
    setProfile(next);
    if (circle) setCircle({ ...circle, purpose_locked: true });
    setPurposeOpen(false);
  };

  const handleDiscoverabilitySaved = (next: {
    discoverable: boolean;
    admission_mode: AdmissionMode;
    discovery_blurb: string | null;
  }) => {
    if (circle) setCircle({ ...circle, ...next });
    setDiscoverOpen(false);
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
        <Text style={styles.headerTitle}>circle info</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.roleCard, isHost && styles.roleCardHost]}>
          <Text style={styles.roleCardLabel}>{isHost ? 'your role here' : 'your place here'}</Text>
          <Text style={styles.roleCardTitle}>
            {currentRole === 'owner'
              ? 'you’re holding this circle.'
              : currentRole === 'co_host'
                ? 'you’re helping hold this circle.'
                : 'you’re part of this circle.'}
          </Text>
          <Text style={styles.roleCardBody}>
            {currentRole === 'owner'
              ? 'shape the threshold, rename the room, decide who can find it, and keep things calm.'
              : currentRole === 'co_host'
                ? 'you can help keep the room steady, respond to what needs tending, and guide its rhythm.'
                : 'tune your notifications, keep the invite code close to the room, and leave quietly if you ever need to.'}
          </Text>
        </View>

        {/* Name */}
        <Pressable
          onPress={isOwner ? () => setRenameOpen(true) : undefined}
          style={styles.nameBlock}
        >
          <Text style={styles.nameLabel}>NAME</Text>
          <Text style={styles.nameValue}>{circle?.name}</Text>
          {isOwner && <Text style={styles.nameHint}>tap to rename</Text>}
        </Pressable>

        {/* Invite code */}
        <View style={styles.inviteCard}>
          <Text style={styles.inviteLabel}>INVITE CODE</Text>
          <Text style={styles.inviteCode}>{circle?.invite_code}</Text>
          <Pressable
            onPress={handleCopy}
            style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
            hitSlop={8}
          >
            <Text style={styles.copyBtnText}>{copied ? 'copied' : 'copy'}</Text>
          </Pressable>
          <Text style={styles.inviteHint}>
            {isHost
              ? 'Share this code with people you want in the circle.'
              : 'Keep this code close to the room unless a host wants it shared.'}
          </Text>
        </View>

        {/* Members */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>MEMBERS · {members.length}</Text>
          <View style={styles.memberList}>
            {members.map((m) => (
              <MemberRowItem key={m.user_id} member={m} isMe={m.user_id === user?.id} />
            ))}
          </View>
        </View>

        {/* Purpose (owner-only) */}
        {isOwner && circle && (
          <View style={styles.sectionBlock}>
            <View style={styles.purposeHeader}>
              <Text style={styles.sectionLabel}>CIRCLE PURPOSE</Text>
              <Pressable onPress={() => setPurposeOpen(true)} hitSlop={8}>
                <Text style={styles.purposeEdit}>edit</Text>
              </Pressable>
            </View>
            <View style={styles.purposeCard}>
              {profile ? (
                <>
                  <Text style={styles.purposeValue}>{profile.purpose}</Text>
                  {profile.summary && <Text style={styles.purposeSummary}>{profile.summary}</Text>}
                  {profile.subtopics.length > 0 && (
                    <View style={styles.chipRow}>
                      {profile.subtopics.map((tag) => (
                        <View key={tag} style={styles.chip}>
                          <Text style={styles.chipText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <Text style={styles.purposeMeta}>
                    {circle.purpose_locked
                      ? 'set by you \u2014 palmi will keep the rest tidy'
                      : profile.classified_by === 'ai'
                        ? 'sensed by palmi \u2014 tap edit to override'
                        : 'updated recently'}
                  </Text>
                </>
              ) : (
                <Text style={styles.purposePlaceholder}>
                  palmi will get a feel for this circle once a few posts and answers land. you can
                  also set it manually.
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Discoverability (owner-only) */}
        {isOwner && circle && (
          <View style={styles.sectionBlock}>
            <View style={styles.purposeHeader}>
              <Text style={styles.sectionLabel}>DISCOVERABILITY</Text>
              <Pressable onPress={() => setDiscoverOpen(true)} hitSlop={8}>
                <Text style={styles.purposeEdit}>edit</Text>
              </Pressable>
            </View>
            <View style={styles.purposeCard}>
              <Text style={styles.purposeValue}>
                {circle.discoverable ? 'findable' : 'private'}
              </Text>
              <Text style={styles.purposeSummary}>
                {circle.discoverable
                  ? circle.admission_mode === 'open_screened'
                    ? 'people can find this circle and request to join. clearly safe requests may be auto-approved.'
                    : 'people can find this circle and request to join. you decide on each one.'
                  : 'invite-only. no one outside this circle can see it exists.'}
              </Text>
              {circle.discoverable && circle.discovery_blurb && (
                <Text style={styles.purposeMeta}>“{circle.discovery_blurb}”</Text>
              )}
            </View>
            {circle.discoverable && (
              <Pressable
                onPress={() => router.push(`/circles/${circle.id}/requests`)}
                style={({ pressed }) => [styles.requestsRow, pressed && styles.requestsRowPressed]}
                hitSlop={8}
              >
                <Text style={styles.requestsRowLabel}>
                  join requests {pendingCount > 0 ? `(${pendingCount})` : ''}
                </Text>
                <Text style={styles.requestsRowArrow}>›</Text>
              </Pressable>
            )}
          </View>
        )}

        {isOwner && circle && (
          <Pressable
            onPress={() => router.push(`/(tabs)/circles/${circle.id}/premium`)}
            style={({ pressed }) => [styles.requestsRow, pressed && styles.requestsRowPressed]}
            hitSlop={8}
          >
            <Text style={styles.requestsRowLabel}>premium studio</Text>
            <Text style={styles.requestsRowArrow}>›</Text>
          </Pressable>
        )}

        {/* Notifications */}
        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <View style={styles.prefList}>
            <PrefRow
              title="Daily question"
              hint="When the day's question drops"
              value={prefs.daily_question}
              onChange={(v) => handleTogglePref('daily_question', v)}
            />
            <PrefRow
              title="New posts"
              hint="When someone shares something"
              value={prefs.new_posts}
              onChange={(v) => handleTogglePref('new_posts', v)}
            />
            <PrefRow
              title="Reactions"
              hint="When someone reacts to your post"
              value={prefs.reactions}
              onChange={(v) => handleTogglePref('reactions', v)}
            />
            {isOwner && circle?.discoverable && (
              <PrefRow
                title="Join requests"
                hint="When someone asks to join"
                value={prefs.join_requests}
                onChange={(v) => handleTogglePref('join_requests', v)}
              />
            )}
          </View>
        </View>

        {/* Leave */}
        <View style={styles.leaveBlock}>
          <Button onPress={handleLeave} variant="secondary" loading={leaving}>
            Leave circle
          </Button>
        </View>
      </ScrollView>

      {isOwner && renameOpen && circle && (
        <RenameSheet
          circleId={circle.id}
          currentName={circle.name}
          onClose={() => setRenameOpen(false)}
          onRenamed={handleRenamed}
        />
      )}

      {isOwner && purposeOpen && circle && (
        <PurposeSheet
          circleId={circle.id}
          current={profile?.purpose ?? null}
          onClose={() => setPurposeOpen(false)}
          onSaved={handlePurposeSaved}
        />
      )}

      {isOwner && discoverOpen && circle && (
        <DiscoverabilitySheet
          circle={circle}
          onClose={() => setDiscoverOpen(false)}
          onSaved={handleDiscoverabilitySaved}
        />
      )}
    </Screen>
  );
}

function MemberRowItem({ member, isMe }: { member: MemberRow; isMe: boolean }) {
  const joined = new Date(member.joined_at).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
  return (
    <View style={styles.memberRow}>
      <View style={styles.memberAvatar}>
        <Text style={styles.memberAvatarText}>{member.display_name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.memberText}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName}>
            {member.display_name}
            {isMe ? ' (you)' : ''}
          </Text>
          {member.role !== 'member' && (
            <Text style={styles.ownerBadge}>{member.role === 'owner' ? 'host' : 'co-host'}</Text>
          )}
        </View>
        <Text style={styles.memberJoined}>joined {joined}</Text>
      </View>
    </View>
  );
}

function PrefRow({
  title,
  hint,
  value,
  onChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.prefRow}>
      <View style={styles.prefText}>
        <Text style={styles.prefTitle}>{title}</Text>
        <Text style={styles.prefHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.ink }}
        thumbColor={colors.bgCard}
      />
    </View>
  );
}

function RenameSheet({
  circleId,
  currentName,
  onClose,
  onRenamed,
}: {
  circleId: Uuid;
  currentName: string;
  onClose: () => void;
  onRenamed: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed.length <= 40 && trimmed !== currentName;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const { error: rpcErr } = await supabase.rpc('rename_circle', {
      p_circle_id: circleId,
      p_name: trimmed,
    });
    setSaving(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    onRenamed(trimmed);
  };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetBackdrop}
      >
        <Pressable style={styles.sheetDismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Rename circle</Text>
          <TextInput
            value={name}
            onChangeText={(t) => t.length <= 40 && setName(t)}
            placeholder="Circle name"
            placeholderTextColor={colors.inkFaint}
            style={styles.sheetInput}
          />
          <Text style={styles.sheetCounter}>{40 - name.length}</Text>
          {error && <Text style={styles.sheetError}>{error}</Text>}
          <View style={styles.sheetButtons}>
            <Button onPress={onClose} variant="ghost" fullWidth={false}>
              Cancel
            </Button>
            <Button onPress={handleSave} loading={saving} disabled={!canSave} fullWidth={false}>
              Save
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PurposeSheet({
  circleId,
  current,
  onClose,
  onSaved,
}: {
  circleId: Uuid;
  current: CirclePurpose | null;
  onClose: () => void;
  onSaved: (next: CircleProfile) => void;
}) {
  const [picked, setPicked] = useState<CirclePurpose>(current ?? 'friends');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = !saving && (current === null || picked !== current);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    // Lock the purpose so the weekly classifier won't overwrite it.
    const lockRes = await supabase
      .from('circles')
      .update({ purpose_locked: true })
      .eq('id', circleId);
    if (lockRes.error) {
      setSaving(false);
      setError(lockRes.error.message);
      return;
    }

    // Upsert the profile with the owner's choice. classified_by='owner'
    // signals the classifier to treat this as the source of truth.
    const upsertRes = await supabase
      .from('circle_profile')
      .upsert(
        {
          circle_id: circleId,
          purpose: picked,
          classified_by: 'owner',
          classified_at: new Date().toISOString(),
        },
        { onConflict: 'circle_id' }
      )
      .select('*')
      .maybeSingle();

    setSaving(false);
    if (upsertRes.error || !upsertRes.data) {
      setError(upsertRes.error?.message ?? 'Could not save');
      return;
    }
    onSaved(upsertRes.data as CircleProfile);
  };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetBackdrop}
      >
        <Pressable style={styles.sheetDismiss} onPress={onClose} />
        <View style={[styles.sheet, styles.purposeSheet]}>
          <Text style={styles.sheetTitle}>What is this circle for?</Text>
          <Text style={styles.sheetHint}>
            this shapes the daily question and (later) discovery. you can change it whenever.
          </Text>
          <ScrollView
            style={styles.purposeOptionScroll}
            contentContainerStyle={{ gap: spacing.xs }}
          >
            {PURPOSE_OPTIONS.map((opt) => {
              const selected = picked === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setPicked(opt.value)}
                  style={[styles.purposeOption, selected && styles.purposeOptionSelected]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.purposeOptionLabel,
                        selected && styles.purposeOptionLabelSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.purposeOptionHint}>{opt.hint}</Text>
                  </View>
                  {selected && <Text style={styles.purposeOptionCheck}>✓</Text>}
                </Pressable>
              );
            })}
          </ScrollView>
          {error && <Text style={styles.sheetError}>{error}</Text>}
          <View style={styles.sheetButtons}>
            <Button onPress={onClose} variant="ghost" fullWidth={false}>
              Cancel
            </Button>
            <Button onPress={handleSave} loading={saving} disabled={!canSave} fullWidth={false}>
              Save
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const ADMISSION_OPTIONS: { value: AdmissionMode; label: string; hint: string }[] = [
  {
    value: 'request',
    label: 'request to join',
    hint: 'people can ask, you decide each one.',
  },
  {
    value: 'open_screened',
    label: 'open with screening',
    hint: 'clearly safe, on-topic requests are auto-approved. you still see everyone else.',
  },
];

function DiscoverabilitySheet({
  circle,
  onClose,
  onSaved,
}: {
  circle: Circle;
  onClose: () => void;
  onSaved: (next: {
    discoverable: boolean;
    admission_mode: AdmissionMode;
    discovery_blurb: string | null;
  }) => void;
}) {
  const [discoverable, setDiscoverable] = useState<boolean>(circle.discoverable ?? false);
  const [admission, setAdmission] = useState<AdmissionMode>(
    circle.admission_mode === 'closed' || circle.admission_mode === 'invite_only'
      ? 'request'
      : (circle.admission_mode as AdmissionMode)
  );
  const [blurb, setBlurb] = useState<string>(circle.discovery_blurb ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedBlurb = blurb.trim();
  // If discoverable, we need a 1-200 char blurb and a compatible admission mode.
  const blurbValid = !discoverable || (trimmedBlurb.length >= 1 && trimmedBlurb.length <= 200);
  const canSave = !saving && blurbValid;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const nextAdmission: AdmissionMode = discoverable ? admission : 'invite_only';
    const nextBlurb = discoverable ? trimmedBlurb : null;

    const { error: updErr } = await supabase
      .from('circles')
      .update({
        discoverable,
        admission_mode: nextAdmission,
        discovery_blurb: nextBlurb,
      })
      .eq('id', circle.id);

    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    onSaved({ discoverable, admission_mode: nextAdmission, discovery_blurb: nextBlurb });
  };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetBackdrop}
      >
        <Pressable style={styles.sheetDismiss} onPress={onClose} />
        <View style={[styles.sheet, styles.purposeSheet]}>
          <Text style={styles.sheetTitle}>discoverability</Text>
          <Text style={styles.sheetHint}>
            off by default. when on, people searching can find this circle and request to join. you
            stay in control.
          </Text>

          <ScrollView
            style={styles.purposeOptionScroll}
            contentContainerStyle={{ gap: spacing.xs }}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={() => setDiscoverable(false)}
              style={[styles.purposeOption, !discoverable && styles.purposeOptionSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.purposeOptionLabel,
                    !discoverable && styles.purposeOptionLabelSelected,
                  ]}
                >
                  private
                </Text>
                <Text style={styles.purposeOptionHint}>
                  invite-only. no one outside can see it exists.
                </Text>
              </View>
              {!discoverable && <Text style={styles.purposeOptionCheck}>✓</Text>}
            </Pressable>

            <Pressable
              onPress={() => setDiscoverable(true)}
              style={[styles.purposeOption, discoverable && styles.purposeOptionSelected]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.purposeOptionLabel,
                    discoverable && styles.purposeOptionLabelSelected,
                  ]}
                >
                  findable
                </Text>
                <Text style={styles.purposeOptionHint}>
                  shows up when someone searches for circles like yours.
                </Text>
              </View>
              {discoverable && <Text style={styles.purposeOptionCheck}>✓</Text>}
            </Pressable>

            {discoverable && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>
                  WHEN SOMEONE ASKS
                </Text>
                {ADMISSION_OPTIONS.map((opt) => {
                  const selected = admission === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setAdmission(opt.value)}
                      style={[styles.purposeOption, selected && styles.purposeOptionSelected]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.purposeOptionLabel,
                            selected && styles.purposeOptionLabelSelected,
                          ]}
                        >
                          {opt.label}
                        </Text>
                        <Text style={styles.purposeOptionHint}>{opt.hint}</Text>
                      </View>
                      {selected && <Text style={styles.purposeOptionCheck}>✓</Text>}
                    </Pressable>
                  );
                })}

                <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>
                  HOW TO DESCRIBE IT
                </Text>
                <TextInput
                  value={blurb}
                  onChangeText={(t) => t.length <= 200 && setBlurb(t)}
                  placeholder="a short, honest line. e.g. weekly check-ins for early-stage founders."
                  placeholderTextColor={colors.inkFaint}
                  multiline
                  style={styles.discoverInput}
                />
                <Text style={styles.discoverCounter}>{200 - blurb.length}</Text>
              </>
            )}
          </ScrollView>

          {error && <Text style={styles.sheetError}>{error}</Text>}
          <View style={styles.sheetButtons}>
            <Button onPress={onClose} variant="ghost" fullWidth={false}>
              cancel
            </Button>
            <Button onPress={handleSave} loading={saving} disabled={!canSave} fullWidth={false}>
              save
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
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
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSpacer: { width: 44, height: 44 },

  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },

  roleCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  roleCardHost: {
    backgroundColor: colors.bgPanel,
  },
  roleCardLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  roleCardTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  roleCardBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: 18,
  },

  // Name
  nameBlock: { gap: spacing.xs },
  nameLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  nameValue: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  nameHint: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },

  // Invite code
  inviteCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  inviteLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  inviteCode: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 28,
    letterSpacing: 4,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
    paddingVertical: spacing.xs,
  },
  copyBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
    minWidth: 96,
    alignItems: 'center',
  },
  copyBtnPressed: { backgroundColor: colors.border },
  copyBtnText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  inviteHint: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Section
  sectionBlock: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },

  // Members
  memberList: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.inkMuted,
  },
  memberText: { flex: 1, gap: 2 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  memberName: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.ink,
  },
  ownerBadge: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.xs,
  },
  memberJoined: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },

  // Notification prefs
  prefList: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  prefText: { flex: 1, gap: 2 },
  prefTitle: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.ink,
  },
  prefHint: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkMuted,
  },

  // Leave
  leaveBlock: { paddingTop: spacing.md },

  // Purpose
  purposeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  purposeEdit: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
    letterSpacing: 0.4,
  },
  purposeCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  purposeValue: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    letterSpacing: -0.2,
    textTransform: 'lowercase',
  },
  purposeSummary: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: 18,
  },
  purposeMeta: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.micro,
    color: colors.inkFaint,
    marginTop: spacing.xs,
  },
  requestsRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  requestsRowPressed: { opacity: 0.6 },
  requestsRowLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.ink,
  },
  requestsRowArrow: {
    fontFamily: typography.fontSans,
    fontSize: typography.subtitle,
    color: colors.inkFaint,
  },
  discoverInput: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    lineHeight: typography.body * typography.lineRelaxed,
  },
  discoverCounter: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  purposePlaceholder: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: 18,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  chipText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkMuted,
    letterSpacing: 0.3,
  },
  purposeSheet: {
    maxHeight: '85%',
  },
  sheetHint: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: 18,
  },
  purposeOptionScroll: {
    maxHeight: 360,
  },
  purposeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  purposeOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgPanel,
  },
  purposeOptionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.ink,
    textTransform: 'lowercase',
  },
  purposeOptionLabelSelected: {
    color: colors.accent,
  },
  purposeOptionHint: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkMuted,
    marginTop: 2,
  },
  purposeOptionCheck: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.subtitle,
    color: colors.accent,
  },

  // Rename sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: typography.fontSans,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  sheetCounter: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textAlign: 'right',
  },
  sheetError: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.danger,
  },
  sheetButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
});
