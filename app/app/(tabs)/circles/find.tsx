import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import type { DiscoverResponse, DiscoveredCircle, Uuid } from '@/lib/database.types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

// ---------------------------------------------------------------------------
// Phase 2.6: discovery screen
// ---------------------------------------------------------------------------
// Single calm input. No "AI" branding visible. Calls the discover-circles
// edge function and renders up to five candidate circles. Each row offers a
// "request to join" CTA that opens an intent sheet.
// ---------------------------------------------------------------------------

export default function FindCircleScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<DiscoveredCircle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<DiscoveredCircle | null>(null);

  const trimmed = query.trim();
  const canSearch = trimmed.length >= 3 && !loading;

  const handleSearch = useCallback(async () => {
    if (!canSearch) return;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('discover-circles', {
        body: { query_text: trimmed },
      });
      const payload = data as DiscoverResponse | null;
      if (fnErr) {
        setError('Could not reach the matcher. Try again in a moment.');
        setResults([]);
      } else {
        setResults(payload?.results ?? []);
      }
    } catch {
      setError('Could not reach the matcher. Try again in a moment.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [canSearch, trimmed]);

  const handleRequested = (circleId: Uuid) => {
    setRequestTarget(null);
    // Remove the just-requested circle from the visible list to avoid
    // double-submits; the requester can see status under their own profile
    // (later phase) or by re-searching.
    setResults((prev) => prev.filter((r) => r.circle_id !== circleId));
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>find a circle</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lede}>
          tell us in your own words what you’re looking for. small, private, and only circles whose
          owners chose to be findable will show up.
        </Text>

        <View style={styles.inputBlock}>
          <TextInput
            value={query}
            onChangeText={(t) => t.length <= 500 && setQuery(t)}
            placeholder="e.g. a small biology study group, weekly check-ins"
            placeholderTextColor={colors.inkFaint}
            multiline
            style={styles.input}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            blurOnSubmit
          />
          <View style={styles.inputFooter}>
            <Text style={styles.counter}>{500 - query.length}</Text>
            <Button
              onPress={handleSearch}
              disabled={!canSearch}
              loading={loading}
              fullWidth={false}
            >
              find
            </Button>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {hasSearched && !loading && !error && results.length === 0 && (
          <EmptyResults onCreate={() => router.push('/circles/new')} />
        )}

        {results.length > 0 && (
          <View style={styles.resultsBlock}>
            <Text style={styles.resultsLabel}>
              {results.length === 1 ? '1 circle' : `${results.length} circles`}
            </Text>
            {results.map((r) => (
              <ResultCard key={r.circle_id} result={r} onRequest={() => setRequestTarget(r)} />
            ))}
          </View>
        )}
      </ScrollView>

      {requestTarget && (
        <RequestSheet
          circle={requestTarget}
          onClose={() => setRequestTarget(null)}
          onRequested={handleRequested}
        />
      )}
    </Screen>
  );
}

function ResultCard({ result, onRequest }: { result: DiscoveredCircle; onRequest: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardName}>{result.name}</Text>
        {result.purpose && (
          <View style={styles.purposeChip}>
            <Text style={styles.purposeChipText}>{result.purpose}</Text>
          </View>
        )}
      </View>
      {result.blurb && <Text style={styles.cardBlurb}>{result.blurb}</Text>}
      <Text style={styles.cardFit}>{result.fit_reason}</Text>
      <View style={styles.cardMeta}>
        <Text style={styles.cardMetaText}>
          {result.member_count} {result.member_count === 1 ? 'person' : 'people'}
        </Text>
        <Text style={styles.cardMetaDot}>·</Text>
        <Text style={styles.cardMetaText}>
          {result.admission_mode === 'open_screened' ? 'open with screening' : 'request to join'}
        </Text>
      </View>
      <View style={styles.cardActions}>
        <Button onPress={onRequest} variant="primary">
          request to join
        </Button>
      </View>
    </View>
  );
}

function EmptyResults({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>nothing close enough yet.</Text>
      <Text style={styles.emptyLede}>
        try a different phrasing, or start a circle of your own and let people find it.
      </Text>
      <Button onPress={onCreate} variant="ghost" fullWidth={false}>
        start a circle
      </Button>
    </View>
  );
}

function RequestSheet({
  circle,
  onClose,
  onRequested,
}: {
  circle: DiscoveredCircle;
  onClose: () => void;
  onRequested: (circleId: Uuid) => void;
}) {
  const [intent, setIntent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = intent.trim();
  const canSubmit = trimmed.length >= 10 && trimmed.length <= 500 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    const { data: requestId, error: rpcErr } = await supabase.rpc('request_join_circle', {
      p_circle_id: circle.circle_id,
      p_intent: trimmed,
    });

    if (rpcErr || !requestId) {
      setSubmitting(false);
      setError(rpcErr?.message ?? 'Could not send request');
      return;
    }

    // Fire-and-forget screening for open_screened circles. We don't block the
    // user on this — it runs server-side and writes a recommendation back.
    if (circle.admission_mode === 'open_screened') {
      void supabase.functions.invoke('screen-join-request', {
        body: { request_id: requestId },
      });
    }

    setSubmitting(false);
    Alert.alert(
      'sent',
      circle.admission_mode === 'open_screened'
        ? 'we let the owner know. you may be approved automatically.'
        : 'we let the owner know. they’ll review when they’re back.',
      [{ text: 'ok', onPress: () => onRequested(circle.circle_id) }]
    );
  };

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetBackdrop}
      >
        <Pressable style={styles.sheetDismiss} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>request to join</Text>
          <Text style={styles.sheetHint}>
            a sentence or two on why this circle. the owner sees only your name and what you write
            here.
          </Text>
          <TextInput
            value={intent}
            onChangeText={(t) => t.length <= 500 && setIntent(t)}
            autoFocus
            multiline
            placeholder="i’m studying for the mcat in spring and would love a small group to check in weekly…"
            placeholderTextColor={colors.inkFaint}
            style={styles.sheetInput}
          />
          <Text style={styles.sheetCounter}>{500 - intent.length}</Text>
          {error && <Text style={styles.sheetError}>{error}</Text>}
          <View style={styles.sheetButtons}>
            <Button onPress={onClose} variant="ghost" fullWidth={false}>
              cancel
            </Button>
            <Button
              onPress={handleSubmit}
              loading={submitting}
              disabled={!canSubmit}
              fullWidth={false}
            >
              send
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    gap: spacing.lg,
  },

  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },

  inputBlock: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  input: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    minHeight: 90,
    textAlignVertical: 'top',
    lineHeight: typography.subtitle * typography.lineNormal,
  },
  inputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  counter: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },

  errorText: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.danger,
  },

  resultsBlock: {
    gap: spacing.md,
  },
  resultsLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardName: {
    flex: 1,
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  purposeChip: {
    backgroundColor: colors.bgPanel,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  purposeChipText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkMuted,
  },
  cardBlurb: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  cardFit: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardMetaText: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  cardMetaDot: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  cardActions: {
    marginTop: spacing.xs,
  },

  empty: {
    paddingVertical: spacing.xl,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  emptyLede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },

  // Sheet
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
    gap: spacing.sm,
  },
  sheetTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  sheetHint: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  sheetInput: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: typography.body * typography.lineRelaxed,
  },
  sheetCounter: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    alignSelf: 'flex-end',
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
    marginTop: spacing.sm,
  },
});
