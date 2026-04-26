import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { Button } from '@/components/Button';
import { FadeUpView } from '@/components/FadeUpView';
import { Screen } from '@/components/Screen';
import type {
  DiscoveredCircle,
  DiscoverResponse,
  DiscoveryQuota,
  ParsedIntent,
  Uuid,
} from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { colors, motion, radius, spacing, typography } from '@/theme/tokens';

const SUGGESTIONS = [
  'weekly check-ins',
  'founders in the same stage',
  'small study group',
  'creative practice circle',
  'career transition room',
];

const REFINEMENTS = ['smaller group', 'more structured', 'more private', 'more local'];
const SEARCH_STEPS = [
  'reading what you asked for',
  'mapping the shape and cadence you need',
  'searching discoverable circles across the network',
  'checking social fit before showing matches',
];

export default function FindCircleScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<DiscoveredCircle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requestTarget, setRequestTarget] = useState<DiscoveredCircle | null>(null);
  const [quota, setQuota] = useState<DiscoveryQuota | null>(null);
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null);
  const [lastSearchText, setLastSearchText] = useState('');
  const [searchStepIndex, setSearchStepIndex] = useState(0);

  const trimmed = query.trim();
  const canSearch = trimmed.length >= 3 && !loading;

  const loadQuota = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.rpc('check_discovery_quota', { p_user: user.id });
    setQuota(((data ?? [])[0] ?? null) as DiscoveryQuota | null);
  }, []);

  useEffect(() => {
    void loadQuota();
  }, [loadQuota]);

  useEffect(() => {
    if (!loading) {
      setSearchStepIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setSearchStepIndex((current) => (current + 1) % SEARCH_STEPS.length);
    }, 1100);

    return () => clearInterval(timer);
  }, [loading]);

  const runSearch = useCallback(
    async (explicitQuery?: string) => {
      const searchText = (explicitQuery ?? query).trim();
      if (searchText.length < 3) return;
      if (quota && quota.quota >= 0 && quota.remaining <= 0) {
        setError('You’ve used this month’s introductions. Premium+ keeps the network open.');
        return;
      }

      setLoading(true);
      setError(null);
      setHasSearched(true);
      setQuery(searchText);
      setLastSearchText(searchText);

      try {
        const { data, error: fnError } = await supabase.functions.invoke('discover-circles', {
          body: { query_text: searchText },
        });
        const payload = data as (DiscoverResponse & { error?: string }) | null;

        if (fnError) {
          setResults([]);
          setParsedIntent(null);
          if (payload?.quota) setQuota(payload.quota);
          setError(
            payload?.error === 'discovery_quota_reached'
              ? 'You’ve used this month’s introductions. Premium+ keeps the network open.'
              : 'Palmi couldn’t search the network just now. Try again in a moment.'
          );
        } else {
          setResults(payload?.results ?? []);
          setParsedIntent(payload?.parsed_intent ?? null);
          if (payload?.quota) setQuota(payload.quota);
        }
      } catch {
        setResults([]);
        setParsedIntent(null);
        setError('Palmi couldn’t search the network just now. Try again in a moment.');
      } finally {
        setLoading(false);
        void loadQuota();
      }
    },
    [loadQuota, query, quota]
  );

  const quotaCopy = useMemo(() => {
    if (!quota) return null;
    if (quota.quota < 0) return 'the network stays open as long as you need it.';
    return `${quota.remaining} introductions left this month.`;
  }, [quota]);

  const applySuggestion = (text: string) => {
    setQuery(text);
    setError(null);
    setHasSearched(false);
    setParsedIntent(null);
  };

  const applyRefinement = (text: string) => {
    void runSearch(mergeQuery(query, text));
  };

  const handleRequested = (circleId: Uuid) => {
    setRequestTarget(null);
    setResults((current) => current.filter((result) => result.circle_id !== circleId));
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>circle network</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeUpView>
          <View style={styles.composeCard}>
            <Text style={styles.composeLabel}>step one</Text>
            <Text style={styles.composeTitle}>describe the room you need.</Text>
            <Text style={styles.composeBody}>
              say it plainly. palmi ai actively searches the network for circles that match the
              shape, cadence, and social fit you need.
            </Text>
            <View style={styles.suggestionWrap}>
              {SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => applySuggestion(suggestion)}
                  style={({ pressed }) => [styles.suggestionChip, pressed && styles.softPressed]}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </FadeUpView>

        {quotaCopy && (
          <FadeUpView delay={motion.stagger}>
            <View style={styles.quotaCard}>
              <Text style={styles.quotaLabel}>network access</Text>
              <Text style={styles.quotaBody}>{quotaCopy}</Text>
            </View>
          </FadeUpView>
        )}

        <FadeUpView delay={motion.stagger * 2}>
          <View style={styles.inputBlock}>
            <TextInput
              value={query}
              onChangeText={(text) => text.length <= 500 && setQuery(text)}
              placeholder="a small biology study group that checks in weekly"
              placeholderTextColor={colors.inkFaint}
              multiline
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={() => void runSearch()}
              blurOnSubmit
            />
            <View style={styles.inputFooter}>
              <Text style={styles.counter}>{500 - query.length}</Text>
              <Button
                onPress={() => void runSearch()}
                disabled={!canSearch}
                loading={loading}
                fullWidth={false}
              >
                search with palmi
              </Button>
            </View>
          </View>
        </FadeUpView>

        {loading && (
          <FadeUpView delay={motion.stagger * 3}>
            <View style={styles.searchingCard}>
              <Text style={styles.searchingLabel}>palmi ai is searching</Text>
              <Text style={styles.searchingTitle}>working across the circle network.</Text>
              <Text style={styles.searchingBody}>{SEARCH_STEPS[searchStepIndex]}</Text>
              {lastSearchText ? (
                <Text style={styles.searchingMeta}>for: “{lastSearchText}”</Text>
              ) : null}
            </View>
          </FadeUpView>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        {hasSearched && !loading && parsedIntent && (
          <FadeUpView delay={motion.stagger * 3}>
            <IntentCard parsedIntent={parsedIntent} />
          </FadeUpView>
        )}

        {hasSearched && results.length > 0 && (
          <FadeUpView delay={motion.stagger * 4}>
            <View style={styles.refineWrap}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>tighten the fit</Text>
              </View>
              <View style={styles.refineRow}>
                {REFINEMENTS.map((refinement) => (
                  <Pressable
                    key={refinement}
                    onPress={() => applyRefinement(refinement)}
                    style={({ pressed }) => [styles.refineChip, pressed && styles.softPressed]}
                  >
                    <Text style={styles.refineText}>{refinement}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </FadeUpView>
        )}

        {hasSearched && !loading && !error && results.length === 0 && (
          <FadeUpView delay={motion.stagger * 4}>
            <EmptyResults onCreate={() => router.push('/circles/new')} onRetry={applySuggestion} />
          </FadeUpView>
        )}

        {results.length > 0 && (
          <View style={styles.resultsBlock}>
            <FadeUpView delay={motion.stagger * 4}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>rooms that fit</Text>
              </View>
            </FadeUpView>
            {results.map((result, index) => (
              <FadeUpView key={result.circle_id} delay={motion.stagger * Math.min(index + 5, 12)}>
                <ResultCard
                  result={result}
                  index={index}
                  onRequest={() => setRequestTarget(result)}
                />
              </FadeUpView>
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

function ResultCard({
  result,
  index,
  onRequest,
}: {
  result: DiscoveredCircle;
  index: number;
  onRequest: () => void;
}) {
  const strength = index === 0 ? 'closest match' : index === 1 ? 'good fit' : 'worth a look';
  const admissionLabel =
    result.admission_mode === 'open_screened' ? 'screened entry' : 'owner review';
  const reasons = summarizeFit(result.fit_reason);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text style={styles.cardStrength}>{strength}</Text>
          <Text style={styles.cardName}>{result.name}</Text>
        </View>
        <View style={styles.cardBadges}>
          {result.purpose ? (
            <View style={styles.purposeChip}>
              <Text style={styles.purposeChipText}>{result.purpose}</Text>
            </View>
          ) : null}
          <View
            style={[
              styles.admissionChip,
              result.admission_mode === 'open_screened'
                ? styles.admissionChipOpen
                : styles.admissionChipReview,
            ]}
          >
            <Text style={styles.admissionChipText}>{admissionLabel}</Text>
          </View>
        </View>
      </View>

      {result.blurb ? <Text style={styles.cardBlurb}>{result.blurb}</Text> : null}

      <View style={styles.fitBlock}>
        <Text style={styles.fitLabel}>why this fits</Text>
        {reasons.map((reason) => (
          <View key={reason} style={styles.fitRow}>
            <Text style={styles.fitBullet}>•</Text>
            <Text style={styles.fitReason}>{reason}</Text>
          </View>
        ))}
      </View>

      <View style={styles.cardMeta}>
        <Text style={styles.cardMetaText}>
          {result.member_count} {result.member_count === 1 ? 'person' : 'people'}
        </Text>
      </View>

      <View style={styles.cardActions}>
        <Button onPress={onRequest} fullWidth={false}>
          request to join
        </Button>
      </View>
    </View>
  );
}

function EmptyResults({
  onCreate,
  onRetry,
}: {
  onCreate: () => void;
  onRetry: (text: string) => void;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>nothing close enough yet.</Text>
      <Text style={styles.emptyLede}>
        broaden the room, try a simpler phrasing, or start the one you were hoping to find.
      </Text>
      <View style={styles.refineRow}>
        <Pressable onPress={() => onRetry('weekly check-ins')} style={styles.refineChip}>
          <Text style={styles.refineText}>try weekly check-ins</Text>
        </Pressable>
        <Pressable onPress={() => onRetry('small study group')} style={styles.refineChip}>
          <Text style={styles.refineText}>try study group</Text>
        </Pressable>
      </View>
      <Button onPress={onCreate} variant="ghost" fullWidth={false}>
        start a circle
      </Button>
    </View>
  );
}

function IntentCard({ parsedIntent }: { parsedIntent: ParsedIntent }) {
  const hasSignals =
    !!parsedIntent.purpose ||
    !!parsedIntent.audience ||
    parsedIntent.subtopics.length > 0 ||
    parsedIntent.constraints.length > 0;

  if (!hasSignals) return null;

  return (
    <View style={styles.intentCard}>
      <Text style={styles.intentLabel}>palmi heard</Text>
      <Text style={styles.intentTitle}>this is the shape of what you asked for.</Text>
      <View style={styles.intentWrap}>
        {parsedIntent.purpose ? (
          <View style={styles.intentChip}>
            <Text style={styles.intentChipText}>purpose: {parsedIntent.purpose}</Text>
          </View>
        ) : null}
        {parsedIntent.audience ? (
          <View style={styles.intentChip}>
            <Text style={styles.intentChipText}>around: {parsedIntent.audience}</Text>
          </View>
        ) : null}
        {parsedIntent.subtopics.map((topic) => (
          <View key={topic} style={styles.intentChip}>
            <Text style={styles.intentChipText}>{topic}</Text>
          </View>
        ))}
        {parsedIntent.constraints.map((constraint) => (
          <View key={constraint} style={styles.intentChipMuted}>
            <Text style={styles.intentChipTextMuted}>{constraint}</Text>
          </View>
        ))}
      </View>
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

    const { data: requestId, error: rpcError } = await supabase.rpc('request_join_circle', {
      p_circle_id: circle.circle_id,
      p_intent: trimmed,
    });

    if (rpcError || !requestId) {
      setSubmitting(false);
      setError(rpcError?.message ?? 'Could not send request');
      return;
    }

    if (circle.admission_mode === 'open_screened') {
      void supabase.functions.invoke('screen-join-request', {
        body: { request_id: requestId },
      });
    }

    setSubmitting(false);
    Alert.alert(
      'sent',
      circle.admission_mode === 'open_screened'
        ? 'we let the owner know. if the fit is clearly safe, you may be approved automatically.'
        : 'we let the owner know. they’ll read it when they’re back.',
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
            a sentence or two on why this room feels right. the owner sees only your name and what
            you write here.
          </Text>
          <TextInput
            value={intent}
            onChangeText={(text) => text.length <= 500 && setIntent(text)}
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

function mergeQuery(base: string, addition: string) {
  const trimmedBase = base.trim();
  if (!trimmedBase) return addition;
  if (trimmedBase.toLowerCase().includes(addition.toLowerCase())) return trimmedBase;
  return `${trimmedBase}, ${addition}`;
}

function summarizeFit(fitReason: string) {
  const parts = fitReason
    .split(/[.;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  return parts.length > 0 ? parts : [fitReason];
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
  headerTitle: {
    flex: 1,
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  composeCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  composeLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  composeTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
  },
  composeBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  suggestionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  suggestionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionText: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.ink,
  },
  quotaCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  quotaLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  quotaBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  searchingCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchingLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  searchingTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.title,
    color: colors.ink,
  },
  searchingBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  searchingMeta: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.caption,
    color: colors.inkFaint,
    marginTop: spacing.xs,
  },
  inputBlock: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    minHeight: 96,
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
  intentCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  intentLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  intentTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  intentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  intentChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
  },
  intentChipMuted: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  intentChipText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  intentChipTextMuted: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  refineWrap: {
    gap: spacing.sm,
  },
  sectionHead: {
    paddingBottom: spacing.xs,
  },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.3,
  },
  refineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  refineChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgPanel,
  },
  refineText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  resultsBlock: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardHeaderText: {
    flex: 1,
    gap: 2,
  },
  cardStrength: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardName: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
  },
  cardBadges: {
    alignItems: 'flex-end',
    gap: spacing.xs,
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
  admissionChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  admissionChipOpen: {
    backgroundColor: '#E9F0E7',
  },
  admissionChipReview: {
    backgroundColor: '#F2EAD8',
  },
  admissionChipText: {
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
  fitBlock: {
    padding: spacing.md,
    backgroundColor: colors.bgPanel,
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  fitLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fitRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'flex-start',
  },
  fitBullet: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
    marginTop: 1,
  },
  fitReason: {
    flex: 1,
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardMetaText: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  cardActions: {
    marginTop: spacing.xs,
  },
  empty: {
    gap: spacing.md,
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
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
  softPressed: {
    backgroundColor: colors.border,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetDismiss: {
    flex: 1,
  },
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
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
    textAlignVertical: 'top',
    lineHeight: typography.body * typography.lineRelaxed,
  },
  sheetCounter: {
    alignSelf: 'flex-end',
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
  },
  sheetError: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.danger,
  },
  sheetButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
