import { useState } from 'react';
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextInput } from '@/components/TextInput';
import { useAuth } from '@/hooks/useAuth';
import { colors, spacing, typography } from '@/theme/tokens';

export default function PhoneScreen() {
  const router = useRouter();
  const { signInWithOtp, loading } = useAuth();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

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

    const { error: err } = await signInWithOtp(e164);
    if (err) {
      setError(err);
      return;
    }

    router.push({ pathname: '/(auth)/verify', params: { phone: e164 } });
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.title}>
              a quiet place{'\n'}for your <Text style={styles.titleItalic}>people</Text>.
            </Text>
            <Text style={styles.lede}>
              Enter your number to get started. We only use it so your friends can find you.
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              keyboardType="phone-pad"
              autoComplete="tel"
              autoFocus
              error={error}
            />
            <Button onPress={handleContinue} loading={loading}>
              Continue
            </Button>
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
    gap: spacing.md,
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
  footer: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: typography.micro * typography.lineRelaxed,
  },
});
