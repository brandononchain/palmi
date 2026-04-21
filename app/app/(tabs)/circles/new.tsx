import { useState } from 'react';
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextInput } from '@/components/TextInput';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography } from '@/theme/tokens';

export default function NewCircleScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    setError(null);
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setError('Pick a name for your circle.');
      return;
    }

    setSubmitting(true);
    const { data, error: err } = await supabase.rpc('create_circle', { p_name: trimmed });
    setSubmitting(false);

    if (err) {
      setError(err.message);
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
            <Text style={styles.title}>
              name this <Text style={styles.titleItalic}>circle</Text>.
            </Text>
            <Text style={styles.lede}>
              What do these friends call themselves? Something silly is usually best.
            </Text>
          </View>

          <View style={styles.form}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="dorm 4B"
              autoFocus
              error={error}
              maxLength={40}
            />
            <Button onPress={handleCreate} loading={submitting}>
              Create circle
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
  titleItalic: {
    fontFamily: typography.fontSerifItalic,
    color: colors.accent,
  },
  lede: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    lineHeight: typography.body * typography.lineRelaxed,
  },
  form: { gap: spacing.sm },
});
