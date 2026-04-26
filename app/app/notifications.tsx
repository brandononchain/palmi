import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import type { Membership, NotificationPrefs, Uuid } from '@/lib/database.types';
import {
  getPushPermissionStatusAsync,
  registerForPushAsync,
  sendTestPush,
} from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme/tokens';

type RowPrefs = Pick<
  NotificationPrefs,
  'daily_question' | 'new_posts' | 'reactions' | 'join_requests'
>;

interface NotificationCircleRow {
  circle_id: Uuid;
  name: string;
  role: Membership['role'];
  discoverable: boolean;
  prefs: RowPrefs;
}

const DEFAULT_PREFS: RowPrefs = {
  daily_question: false,
  new_posts: false,
  reactions: false,
  join_requests: false,
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [rows, setRows] = useState<NotificationCircleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string>('unknown');

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [membershipsRes, prefsRes, status] = await Promise.all([
      supabase
        .from('memberships')
        .select('circle_id, role, circles:circle_id(name, discoverable)')
        .eq('user_id', user.id)
        .is('left_at', null),
      supabase
        .from('notification_prefs')
        .select('circle_id, daily_question, new_posts, reactions, join_requests')
        .eq('user_id', user.id),
      getPushPermissionStatusAsync().catch(() => 'unknown'),
    ]);

    setPushStatus(status);

    const prefsByCircle = new Map<
      string,
      { daily_question: boolean; new_posts: boolean; reactions: boolean; join_requests: boolean }
    >(((prefsRes.data ?? []) as any[]).map((row) => [row.circle_id, row]));

    setRows(
      ((membershipsRes.data ?? []) as any[])
        .map((row) => ({
          circle_id: row.circle_id,
          role: row.role,
          name: row.circles?.name ?? 'circle',
          discoverable: Boolean(row.circles?.discoverable),
          prefs: prefsByCircle.get(row.circle_id) ?? DEFAULT_PREFS,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const enabledCount = useMemo(
    () => rows.reduce((count, row) => count + Object.values(row.prefs).filter(Boolean).length, 0),
    [rows]
  );

  const pushStatusCopy =
    pushStatus === 'granted'
      ? 'quiet notifications are on for this device'
      : pushStatus === 'expo_go'
        ? 'push needs a dev build or app store build, not Expo Go'
        : pushStatus === 'unsupported'
          ? 'this device cannot receive push notifications'
          : 'off by default until you turn them on';

  const handleEnablePush = async () => {
    if (!user) return;
    const reg = await registerForPushAsync(user.id).catch(() => null);
    setPushStatus(reg?.status ?? 'unknown');
    if (!reg || reg.status !== 'granted') {
      Alert.alert(
        'Still off',
        'Palmi stays quiet by default. Turn notifications on in your device settings if you want the important moments to reach you.'
      );
      return;
    }
    Alert.alert(
      'Notifications on',
      'You’ll hear from Palmi only when something is actually waiting for you.'
    );
  };

  const handleTestPush = async () => {
    if (!user) return;
    setTesting(true);
    const reg = await registerForPushAsync(user.id).catch(() => null);
    setPushStatus(reg?.status ?? 'unknown');
    if (!reg || reg.status !== 'granted' || !reg.token) {
      setTesting(false);
      Alert.alert(
        'Notifications are off',
        'Enable notifications for Palmi in your device settings to receive a test.'
      );
      return;
    }
    const ok = await sendTestPush(user.id);
    setTesting(false);
    if (!ok) {
      Alert.alert('Could not send', 'The test push did not reach Expo. Try again.');
    }
  };

  const handleTogglePref = async (circleId: Uuid, key: keyof RowPrefs, value: boolean) => {
    if (!user) return;
    const row = rows.find((entry) => entry.circle_id === circleId);
    if (!row) return;
    const nextPrefs = { ...row.prefs, [key]: value };
    setRows((prev) =>
      prev.map((entry) => (entry.circle_id === circleId ? { ...entry, prefs: nextPrefs } : entry))
    );
    setSavingKey(`${circleId}:${key}`);
    const { error } = await supabase.from('notification_prefs').upsert(
      {
        user_id: user.id,
        circle_id: circleId,
        ...nextPrefs,
      },
      { onConflict: 'user_id,circle_id' }
    );
    setSavingKey(null);
    if (error) {
      setRows((prev) =>
        prev.map((entry) => (entry.circle_id === circleId ? { ...entry, prefs: row.prefs } : entry))
      );
      Alert.alert('Could not save', error.message);
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>notifications</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.inkMuted} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>quiet by design</Text>
            <Text style={styles.heroTitle}>only the moments you want.</Text>
            <Text style={styles.heroBody}>
              Daily question drops, join approvals, and the circle activity you actually opted into.
            </Text>
            <Text style={styles.heroMeta}>{pushStatusCopy}</Text>
          </View>

          <View style={styles.actionsRow}>
            <Button onPress={handleEnablePush} fullWidth={false}>
              turn on quiet notifications
            </Button>
            <Button
              onPress={handleTestPush}
              variant="secondary"
              fullWidth={false}
              loading={testing}
            >
              send test
            </Button>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{enabledCount}</Text>
            <Text style={styles.summaryLabel}>
              notification moments enabled across your circles
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>BY CIRCLE</Text>
            {rows.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>nothing to tune yet.</Text>
                <Text style={styles.emptyBody}>
                  join or start a circle and the notification controls will show up here.
                </Text>
              </View>
            ) : (
              rows.map((row) => (
                <View key={row.circle_id} style={styles.circleCard}>
                  <View style={styles.circleHeader}>
                    <View style={styles.circleHeaderText}>
                      <Text style={styles.circleName}>{row.name}</Text>
                      <Text style={styles.circleMeta}>
                        {row.role === 'owner'
                          ? 'owner'
                          : row.role === 'co_host'
                            ? 'co-host'
                            : 'member'}
                      </Text>
                    </View>
                    <Pressable onPress={() => router.push(`/(tabs)/circles/${row.circle_id}/info`)}>
                      <Text style={styles.circleLink}>open</Text>
                    </Pressable>
                  </View>

                  <PrefRow
                    title="daily question"
                    hint="when the day’s question lands"
                    value={row.prefs.daily_question}
                    saving={savingKey === `${row.circle_id}:daily_question`}
                    onChange={(value) =>
                      void handleTogglePref(row.circle_id, 'daily_question', value)
                    }
                  />
                  <PrefRow
                    title="new posts"
                    hint="when someone shares something new"
                    value={row.prefs.new_posts}
                    saving={savingKey === `${row.circle_id}:new_posts`}
                    onChange={(value) => void handleTogglePref(row.circle_id, 'new_posts', value)}
                  />
                  <PrefRow
                    title="reactions"
                    hint="when someone reacts to your post"
                    value={row.prefs.reactions}
                    saving={savingKey === `${row.circle_id}:reactions`}
                    onChange={(value) => void handleTogglePref(row.circle_id, 'reactions', value)}
                  />
                  {row.role === 'owner' && row.discoverable ? (
                    <PrefRow
                      title="join requests"
                      hint="when someone asks to join"
                      value={row.prefs.join_requests}
                      saving={savingKey === `${row.circle_id}:join_requests`}
                      onChange={(value) =>
                        void handleTogglePref(row.circle_id, 'join_requests', value)
                      }
                    />
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

function PrefRow({
  title,
  hint,
  value,
  saving,
  onChange,
}: {
  title: string;
  hint: string;
  value: boolean;
  saving: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.prefRow}>
      <View style={styles.prefText}>
        <Text style={styles.prefTitle}>{title}</Text>
        <Text style={styles.prefHint}>{hint}</Text>
      </View>
      <View style={styles.prefControl}>
        {saving ? <ActivityIndicator size="small" color={colors.inkFaint} /> : null}
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.ink }}
          thumbColor={colors.bgCard}
        />
      </View>
    </View>
  );
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
  heroCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  heroLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  heroTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
  },
  heroBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  heroMeta: {
    marginTop: spacing.xs,
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  summaryValue: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    color: colors.ink,
  },
  summaryLabel: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  emptyCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  circleCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  circleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  circleHeaderText: { flex: 1, gap: 2 },
  circleName: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  circleMeta: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  circleLink: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  prefText: { flex: 1, gap: 2 },
  prefTitle: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.ink,
  },
  prefHint: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  prefControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
