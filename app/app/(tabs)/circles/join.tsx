import { useState } from 'react';
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextInput } from '@/components/TextInput';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography } from '@/theme/tokens';

export default function JoinCircleScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = async () => {
    setError(null);
    const clean = code.trim().toUpperCase();
    if (clean.length !== 6) {
      setError('Invite codes are 6 characters.');
      return;
    }

    setSubmitting(true);
    const { data, error: err } = await supabase.rpc('join_circle', { p_code: clean });
    setSubmitting(false);

    if (err) {
      setError(err.message.replace(/^.*?: /, ''));
      return;
    }

    router.replace(`/circles/${data}`);
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.content}>
          <View style={styles.hero}>
            <Text style={styles.title}>join with a code.</Text>
            <Text style={styles.lede}>
              Ask a friend for their 6-character invite code.
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="ABC234"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              autoFocus
              error={error}
              style={styles.codeInput}
            />
            <Button onPress={handleJoin} loading={submitting}>
              Join
            </Button>
            <Button variant="ghost" onPress={() => router.back()}>
              Cancel
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
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  hero: { gap: spacing.md },
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
  form: { gap: spacing.sm },
  codeInput: {
    textAlign: 'center',
    fontSize: typography.title,
    letterSpacing: 6,
  },
});
