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
import type { Circle, IsoDate, Uuid } from '@/lib/database.types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

interface MemberRow {
  user_id: Uuid;
  role: 'member' | 'owner';
  joined_at: IsoDate;
  display_name: string;
  avatar_url: string | null;
}

interface NotifPrefs {
  daily_question: boolean;
  new_posts: boolean;
  reactions: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  daily_question: false,
  new_posts: false,
  reactions: false,
};

export default function CircleInfoScreen() {
  const router = useRouter();
  const { id: circleId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [circle, setCircle] = useState<Circle | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [renameOpen, setRenameOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!circleId || !user) return;

    const [circleRes, memRes, prefRes] = await Promise.all([
      supabase.from('circles').select('*').eq('id', circleId).maybeSingle(),
      supabase
        .from('memberships')
        .select('user_id, role, joined_at, profiles:user_id(display_name, avatar_url)')
        .eq('circle_id', circleId)
        .is('left_at', null)
        .order('joined_at', { ascending: true }),
      supabase
        .from('notification_prefs')
        .select('daily_question, new_posts, reactions')
        .eq('circle_id', circleId)
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);

    if (circleRes.data) setCircle(circleRes.data as Circle);
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

    setLoading(false);
  }, [circleId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const isOwner = members.find((m) => m.user_id === user?.id)?.role === 'owner';

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
        { onConflict: 'user_id,circle_id' },
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
      ],
    );
  };

  const handleRenamed = (nextName: string) => {
    if (circle) setCircle({ ...circle, name: nextName });
    setRenameOpen(false);
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

      <ScrollView contentContainerStyle={styles.scroll}>
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
            Share this code with people you want in the circle.
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
        <Text style={styles.memberAvatarText}>
          {member.display_name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.memberText}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName}>
            {member.display_name}
            {isMe ? ' (you)' : ''}
          </Text>
          {member.role === 'owner' && <Text style={styles.ownerBadge}>owner</Text>}
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
    <Modal
      animationType="slide"
      transparent
      visible
      onRequestClose={onClose}
    >
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
            autoFocus
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
