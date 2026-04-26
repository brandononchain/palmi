import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/TextInput';
import { UpgradeSheet } from '@/components/UpgradeSheet';
import { useAuth, isPremium } from '@/hooks/useAuth';
import { startCheckout } from '@/lib/billing';
import type { MemorySearchResult } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function MemoryScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const premium = isPremium(profile);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MemorySearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const trimmed = useMemo(() => query.trim(), [query]);

  const runSearch = async () => {
    if (!premium) {
      setShowUpgrade(true);
      return;
    }
    if (trimmed.length < 2) return;
    setLoading(true);
    setSearched(true);
    const { data } = await supabase.rpc('search_my_memory', { p_query: trimmed, p_limit: 24 });
    setResults((data ?? []) as MemorySearchResult[]);
    setLoading(false);
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      await startCheckout({ kind: 'individual', tier: 'premium' });
      setShowUpgrade(false);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>memory</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.source_type}-${item.source_id}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>premium memory</Text>
            <Text style={styles.title}>find the things you once said.</Text>
            <Text style={styles.lede}>
              search your own posts and answers across every circle. no metrics, no summaries, just
              the lines you left behind.
            </Text>
            <View style={styles.searchCard}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="kitchen / graduation / sunday run"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Button onPress={() => void runSearch()} disabled={trimmed.length < 2 || loading}>
                search memory
              </Button>
            </View>
            {!premium && (
              <Pressable onPress={() => setShowUpgrade(true)} hitSlop={8}>
                <Text style={styles.locked}>premium keeps this search open.</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(tabs)/circles/${item.circle_id}`)}
            style={({ pressed }) => [styles.resultCard, pressed && styles.resultCardPressed]}
          >
            <View style={styles.resultMeta}>
              <Text style={styles.resultCircle}>{item.circle_name}</Text>
              <Text style={styles.resultType}>{item.source_type}</Text>
            </View>
            <Text style={styles.resultBody}>{item.body ?? 'photo only'}</Text>
            <Text style={styles.resultDate}>{formatDate(item.created_at)}</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          searched ? (
            loading ? (
              <View style={styles.empty}>
                <ActivityIndicator color={colors.inkMuted} />
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>nothing for that yet.</Text>
                <Text style={styles.emptyBody}>try a moment, a place, or a specific phrase.</Text>
              </View>
            )
          ) : null
        }
      />

      <UpgradeSheet
        visible={showUpgrade}
        variant="memory-search"
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        loading={upgrading}
      />
    </Screen>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  hero: { gap: spacing.md, marginBottom: spacing.lg },
  eyebrow: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    lineHeight: typography.display * typography.lineTight,
    color: colors.ink,
  },
  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  searchCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  locked: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  resultCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  resultCardPressed: { backgroundColor: colors.bgPanel },
  resultMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  resultCircle: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  resultType: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resultBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  resultDate: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  empty: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.sm },
  emptyTitle: { fontFamily: typography.fontSerif, fontSize: typography.title, color: colors.ink },
  emptyBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
  },
});
