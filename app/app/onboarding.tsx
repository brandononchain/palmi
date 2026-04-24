import { useState } from 'react';
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextInput } from '@/components/TextInput';
import { PalmiMark } from '@/components/Brand';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { registerForPushAsync } from '@/lib/notifications';
import { colors, spacing, typography } from '@/theme/tokens';

export default function OnboardingScreen() {
  const { user, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError('Pick a name.');
      return;
    }
    if (!user) {
      setError('No user session.');
      return;
    }

    setSubmitting(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const { error: err } = await supabase.from('profiles').insert({
      id: user.id,
      display_name: trimmed,
      timezone: tz,
      // Persist phone so Palmi AI can match connection requests
      // (e.g. "connect me with the founder of XYZ"). user.phone is
      // the E.164 number stored by Supabase Auth at OTP verification.
      phone: user.phone ?? null,
    });

    setSubmitting(false);

    if (err) {
      setError(err.message);
      return;
    }

    // Kick off the OS permission prompt. Denial is fine — all circle
    // notifications are off by default; users can turn them on later per
    // circle. We never block onboarding on this.
    void registerForPushAsync(user.id).catch(() => {});

    await refreshProfile();
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <Pressable onPress={() => signOut()} hitSlop={12} style={styles.backRow}>
          <Text style={styles.backText}>← wrong number?</Text>
        </Pressable>
        <View style={styles.content}>
          <View style={styles.hero}>
            <PalmiMark size={24} style={styles.mark} />
            <Text style={styles.title}>
              What should your{'\n'}
              <Text style={styles.titleItalic}>friends</Text> call you?
            </Text>
            <Text style={styles.lede}>
              This is how you appear to people in your circles. No last names, no usernames. Just
              you.
            </Text>
            <Text style={styles.note}>
              Notifications stay off by default. You can turn them on later, per circle.
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="maya"
              autoCapitalize="none"
              autoFocus
              error={error}
              maxLength={40}
            />
            <Button onPress={handleContinue} loading={submitting}>
              Continue
            </Button>
          </View>

          <View />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backRow: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  backText: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  hero: { gap: spacing.md },
  mark: { marginBottom: spacing.xs },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display + 6,
    color: colors.ink,
    lineHeight: (typography.display + 6) * typography.lineTight,
    letterSpacing: typography.trackTight,
  },
  titleItalic: {
    fontFamily: typography.fontSerifItalic,
    color: colors.accent,
  },
  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
    maxWidth: 320,
  },
  note: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.caption,
    color: colors.inkFaint,
    marginTop: spacing.xs,
    maxWidth: 320,
  },
  form: { gap: spacing.md },
});
