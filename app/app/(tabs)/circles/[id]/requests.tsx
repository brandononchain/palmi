import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { CircleJoinRequest, ScreeningRecommendation, Uuid } from '@/lib/database.types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Phase 2.8: owner inbox for join requests
// ---------------------------------------------------------------------------
// Owner-only. Lists pending circle_join_requests with the requester's name and
// what they wrote. If the screening function ran, we surface its hint as a
// quiet badge — the owner still decides.
// ---------------------------------------------------------------------------

interface RequestRow extends CircleJoinRequest {
  requester_name: string;
}

export default function RequestsScreen() {
  const router = useRouter();
  const { id: circleId } = useLocalSearchParams<{ id: Uuid }>();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [busyId, setBusyId] = useState<Uuid | null>(null);

  const load = useCallback(async () => {
    if (!circleId || !user) return;
    setLoading(true);

    // Confirm the caller is an owner before we even try to read requests. RLS
    // will also enforce this server-side, but failing fast is friendlier.
    const memRes = await supabase
      .from('memberships')
      .select('role')
      .eq('circle_id', circleId)
      .eq('user_id', user.id)
      .maybeSingle();

    const owner = memRes.data?.role === 'owner';
    setIsOwner(owner);
    if (!owner) {
      setRows([]);
      setLoading(false);
      return;
    }

    const reqRes = await supabase
      .from('circle_join_requests')
      .select(
        'id, circle_id, requester_id, intent_text, status, screening_recommendation, screening_reason, decided_by, decided_at, created_at'
      )
      .eq('circle_id', circleId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (reqRes.error || !reqRes.data) {
      setRows([]);
      setLoading(false);
      return;
    }

    const requesterIds = Array.from(new Set(reqRes.data.map((r: any) => r.requester_id)));
    const profRes = requesterIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', requesterIds)
      : { data: [] as { id: Uuid; display_name: string }[], error: null };

    const nameById = new Map<Uuid, string>(
      (profRes.data ?? []).map((p: any) => [p.id, p.display_name as string])
    );

    setRows(
      (reqRes.data as CircleJoinRequest[]).map((r) => ({
        ...r,
        requester_name: nameById.get(r.requester_id) ?? 'someone',
      }))
    );
    setLoading(false);
  }, [circleId, user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (req: RequestRow) => {
    setBusyId(req.id);
    const { error } = await supabase.rpc('approve_join_request', { p_request_id: req.id });
    setBusyId(null);
    if (error) {
      Alert.alert('could not approve', error.message);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== req.id));
  };

  const handleDecline = async (req: RequestRow) => {
    Alert.alert('decline?', `decline ${req.requester_name}'s request?`, [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'decline',
        style: 'destructive',
        onPress: async () => {
          setBusyId(req.id);
          const { error } = await supabase.rpc('decline_join_request', { p_request_id: req.id });
          setBusyId(null);
          if (error) {
            Alert.alert('could not decline', error.message);
            return;
          }
          setRows((prev) => prev.filter((r) => r.id !== req.id));
        },
      },
    ]);
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>join requests</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !isOwner ? (
        <View style={styles.center}>
          <Text style={styles.empty}>only the circle owner can see requests.</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>no pending requests.</Text>
          <Text style={styles.empty}>when someone asks to join, they’ll show up here.</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <RequestCard
              row={item}
              busy={busyId === item.id}
              onApprove={() => handleApprove(item)}
              onDecline={() => handleDecline(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </Screen>
  );
}

function RequestCard({
  row,
  busy,
  onApprove,
  onDecline,
}: {
  row: RequestRow;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const recBadge = recommendationBadge(row.screening_recommendation);
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.name}>{row.requester_name}</Text>
        {recBadge && (
          <View style={[styles.badge, { backgroundColor: recBadge.bg }]}>
            <Text style={[styles.badgeText, { color: recBadge.fg }]}>{recBadge.label}</Text>
          </View>
        )}
      </View>
      <Text style={styles.intent}>“{row.intent_text}”</Text>
      {row.screening_reason && <Text style={styles.reason}>{row.screening_reason}</Text>}
      <View style={styles.actions}>
        <Button onPress={onDecline} variant="ghost" fullWidth={false} disabled={busy}>
          decline
        </Button>
        <Button onPress={onApprove} loading={busy} disabled={busy} fullWidth={false}>
          approve
        </Button>
      </View>
    </View>
  );
}

function recommendationBadge(
  rec: ScreeningRecommendation
): { label: string; bg: string; fg: string } | null {
  switch (rec) {
    case 'safe_auto_approve':
      return { label: 'looks safe', bg: '#E8F0E5', fg: '#3C5A33' };
    case 'needs_owner_review':
      return { label: 'review', bg: '#F2EAD8', fg: '#6B5320' };
    case 'reject':
      return { label: 'flagged', bg: '#F2DEDE', fg: '#7A2E2E' };
    case 'pending':
    default:
      return null;
  }
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
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSpacer: { width: 44, height: 44 },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  empty: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    lineHeight: typography.body * typography.lineRelaxed,
  },

  list: {
    padding: spacing.lg,
  },
  sep: { height: spacing.md },

  card: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    color: colors.ink,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 1,
    letterSpacing: 0.4,
  },
  intent: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  reason: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkMuted,
    lineHeight: typography.micro * typography.lineRelaxed,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
