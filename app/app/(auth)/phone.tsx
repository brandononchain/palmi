import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextInput } from '@/components/TextInput';
import { PalmiMark } from '@/components/Brand';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography } from '@/theme/tokens';

export default function PhoneScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: 'signin' | 'signup' = params.mode === 'signin' ? 'signin' : 'signup';
  const { signInWithOtp, loading } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const handleContinue = async () => {
    setError(null);

    // Naive E.164 normalization: assume US if no country code given
    let normalized = phone.replace(/\D/g, '');
    if (normalized.length === 10) normalized = `1${normalized}`;
    const e164 = `+${normalized}`;

    if (normalized.length < 10) {
      setError('That does not look like a phone number.');
      return;
    }

    // Enforce match: sign-in requires an existing account; sign-up requires
    // a brand-new number. Done server-side (check-phone edge function) so we
    // can't be bypassed by editing the client.
    setChecking(true);
    const { data, error: checkErr } = await supabase.functions.invoke('check-phone', {
      body: { phone: e164 },
    });
    setChecking(false);

    if (checkErr) {
      setError("Couldn't verify that number. Try again in a moment.");
      return;
    }
    const exists = !!(data as { exists?: boolean })?.exists;

    if (mode === 'signin' && !exists) {
      setError('No account with that number. Try signing up instead.');
      return;
    }
    if (mode === 'signup' && exists) {
      setError('That number is already registered. Sign in instead.');
      return;
    }

    const { error: err } = await signInWithOtp(e164);
    if (err) {
      setError(err);
      return;
    }

    router.push({ pathname: '/(auth)/verify', params: { phone: e164, mode } });
  };

  const switchMode = () => {
    const next = mode === 'signin' ? 'signup' : 'signin';
    router.replace({ pathname: '/(auth)/phone', params: { mode: next } });
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.hero}>
            <PalmiMark size={28} style={styles.mark} />
            <Text style={styles.eyebrow}>
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </Text>
            <Text style={styles.title}>
              {mode === 'signin' ? (
                <>
                  sign in to <Text style={styles.titleItalic}>palmi</Text>.
                </>
              ) : (
                <>
                  a quiet place{'\n'}for your <Text style={styles.titleItalic}>people</Text>.
                </>
              )}
            </Text>
            <Text style={styles.lede}>
              {mode === 'signin'
                ? 'Enter the number you signed up with. We’ll text you a code.'
                : 'Enter your number to get started. We only use it so your friends can find you.'}
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
              autoComplete="tel"
              error={error}
            />
            <Button onPress={handleContinue} loading={loading || checking}>
              {mode === 'signin' ? 'Send code' : 'Continue'}
            </Button>

            <Pressable onPress={switchMode} style={styles.switchRow} hitSlop={8}>
              <Text style={styles.switchText}>
                {mode === 'signin' ? 'New to palmi? ' : 'Already have an account? '}
                <Text style={styles.switchLink}>{mode === 'signin' ? 'Sign up' : 'Sign in'}</Text>
              </Text>
            </Pressable>
          </View>

          <Text style={styles.footer}>
            By continuing, you agree to our terms and privacy policy. No spam. Ever.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  hero: {
    gap: spacing.sm,
  },
  mark: {
    marginBottom: spacing.sm,
  },
  eyebrow: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    letterSpacing: typography.trackWide,
    textTransform: 'uppercase',
    color: colors.inkFaint,
  },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display + 10,
    color: colors.ink,
    lineHeight: (typography.display + 10) * typography.lineTight,
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
  form: {
    gap: spacing.md,
  },
  switchRow: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  switchText: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
  },
  switchLink: {
    color: colors.accent,
    fontWeight: '600',
  },
  footer: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: typography.micro * typography.lineRelaxed,
  },
});
