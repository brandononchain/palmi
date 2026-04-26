import { useState } from 'react';
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextInput } from '@/components/TextInput';
import { PalmiMark } from '@/components/Brand';
import { useAuth } from '@/hooks/useAuth';
import { colors, spacing, typography } from '@/theme/tokens';

export default function VerifyScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { verifyOtp, loading } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setError(null);
    if (code.length !== 6) {
      setError('The code is 6 digits.');
      return;
    }
    const { error: err } = await verifyOtp(phone ?? '', code);
    if (err) setError(err);
    // On success, auth state listener handles navigation
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
            <Text style={styles.title}>Check your texts.</Text>
            <Text style={styles.lede}>We sent a 6-digit code to {phone}.</Text>
          </View>

          <View style={styles.form}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              maxLength={6}
              error={error}
              style={styles.codeInput}
            />
            <Button onPress={handleVerify} loading={loading}>
              Verify
            </Button>
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.back}>Wrong number? Go back.</Text>
            </Pressable>
          </View>

          <View />
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
  hero: { gap: spacing.md },
  mark: { marginBottom: spacing.xs },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    color: colors.ink,
    lineHeight: typography.display * typography.lineTight,
    letterSpacing: typography.trackTight,
  },
  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
  },
  form: { gap: spacing.md },
  codeInput: {
    textAlign: 'center',
    fontSize: typography.title,
    letterSpacing: 8,
  },
  back: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
