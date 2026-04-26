import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { UpgradeSheet } from '@/components/UpgradeSheet';
import { useAuth, isPremium } from '@/hooks/useAuth';
import { startCheckout } from '@/lib/billing';
import type { YearbookEntry } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function YearbookScreen() {
  const router = useRouter();
  const profile = useAuth((s) => s.profile);
  const premium = isPremium(profile);
  const year = new Date().getFullYear();
  const [entries, setEntries] = useState<YearbookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!premium) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.rpc('get_yearbook_entries', { p_year: year });
      setEntries((data ?? []) as YearbookEntry[]);
      setLoading(false);
    };
    void load();
  }, [premium, year]);

  const grouped = useMemo(() => {
    const map = new Map<string, YearbookEntry[]>();
    for (const entry of entries) {
      const key = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
      }).format(new Date(entry.created_at));
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return Array.from(map.entries());
  }, [entries]);

  const exportPdf = async () => {
    if (!premium) {
      setShowUpgrade(true);
      return;
    }
    if (entries.length === 0) {
      Alert.alert('nothing to export', 'Write a little more first, then come back.');
      return;
    }
    setExporting(true);
    try {
      const html = buildYearbookHtml(entries, year, profile?.display_name ?? 'you');
      const file = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'share your yearbook',
          UTI: 'com.adobe.pdf',
        });
      }
    } finally {
      setExporting(false);
    }
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
        <Text style={styles.headerTitle}>yearbook</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>premium export</Text>
        <Text style={styles.title}>turn the year into something you can keep.</Text>
        <Text style={styles.lede}>
          a quiet PDF of your own posts and answers, ordered through the year. no vanity metrics.
          just the words.
        </Text>

        <Button onPress={() => void exportPdf()} loading={exporting}>
          export yearbook as pdf
        </Button>

        {!premium ? (
          <Pressable style={styles.emptyCard} onPress={() => setShowUpgrade(true)}>
            <Text style={styles.emptyTitle}>premium keeps the export open.</Text>
            <Text style={styles.emptyBody}>when you want to hold onto the year, it is there.</Text>
          </Pressable>
        ) : loading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.inkMuted} />
          </View>
        ) : grouped.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>nothing to bind yet.</Text>
            <Text style={styles.emptyBody}>a yearbook starts once you start writing.</Text>
          </View>
        ) : (
          grouped.map(([label, items]) => (
            <View key={label} style={styles.monthBlock}>
              <Text style={styles.monthLabel}>{label}</Text>
              {items.slice(0, 5).map((item) => (
                <View key={`${item.entry_type}-${item.source_id}`} style={styles.entryCard}>
                  <Text style={styles.entryType}>
                    {item.circle_name} · {item.entry_type}
                  </Text>
                  <Text style={styles.entryBody}>{item.body ?? 'photo only'}</Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <UpgradeSheet
        visible={showUpgrade}
        variant="recap-history"
        onClose={() => setShowUpgrade(false)}
        onUpgrade={handleUpgrade}
        loading={upgrading}
      />
    </Screen>
  );
}

function buildYearbookHtml(entries: YearbookEntry[], year: number, name: string): string {
  const rows = entries
    .map((entry) => {
      const date = new Date(entry.created_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
      });
      const body = escapeHtml(entry.body ?? 'photo only');
      return `<article><div class="meta">${escapeHtml(entry.circle_name)} · ${escapeHtml(entry.entry_type)} · ${date}</div><p>${body}</p></article>`;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Georgia, serif; padding: 40px; color: #1A1A1A; background: #FAF9F6; }
          h1 { font-size: 30px; margin-bottom: 8px; }
          .lede { color: #6B6760; margin-bottom: 28px; }
          article { border-top: 1px solid #E8E4DE; padding: 14px 0; }
          .meta { font-family: Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #D65745; margin-bottom: 8px; }
          p { font-size: 15px; line-height: 1.65; margin: 0; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(name)}’s ${year} yearbook</h1>
        <div class="lede">a quiet export from palmi</div>
        ${rows}
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
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
    color: colors.ink,
    lineHeight: typography.display * typography.lineTight,
  },
  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  loader: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyCard: {
    backgroundColor: colors.bgPanel,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { fontFamily: typography.fontSerif, fontSize: typography.title, color: colors.ink },
  emptyBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  monthBlock: { gap: spacing.sm, marginTop: spacing.md },
  monthLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  entryCard: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  entryType: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  entryBody: {
    fontFamily: typography.fontSerif,
    fontSize: typography.body,
    color: colors.ink,
    lineHeight: typography.body * typography.lineRelaxed,
  },
});
