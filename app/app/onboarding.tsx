import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { TextInput } from '@/components/TextInput';
import { PalmiMark } from '@/components/Brand';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { registerForPushAsync } from '@/lib/notifications';
import { colors, spacing, typography } from '@/theme/tokens';

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, refreshProfile, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [path, setPath] = useState<'friends' | 'study' | 'professional' | 'creator'>('friends');
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [bio, setBio] = useState('');
  const [nextMove, setNextMove] = useState<'new' | 'join' | 'find'>('new');
  const [wantsPush, setWantsPush] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const contextMeta = useMemo(() => {
    switch (path) {
      case 'study':
        return {
          label: 'school or study context',
          placeholder: 'ucla / mcat spring / comp sci',
          profilePatch: { school: context.trim() || null },
        };
      case 'professional':
        return {
          label: 'company or role',
          placeholder: 'product designer at figma',
          profilePatch: { company: context.trim() || null, job_title: context.trim() || null },
        };
      case 'creator':
        return {
          label: 'what you make',
          placeholder: 'songs, essays, early product ideas',
          profilePatch: { industry: context.trim() || null },
        };
      default:
        return {
          label: 'your people, in a phrase',
          placeholder: 'old friends / roommates / sunday runners',
          profilePatch: { bio: context.trim() || null },
        };
    }
  }, [context, path]);

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
      bio: bio.trim() || contextMeta.profilePatch.bio || null,
      ...contextMeta.profilePatch,
    });

    setSubmitting(false);

    if (err) {
      setError(err.message);
      return;
    }

    // Kick off the OS permission prompt. Denial is fine — all circle
    // notifications are off by default; users can turn them on later per
    // circle. We never block onboarding on this.
    if (wantsPush) {
      void registerForPushAsync(user.id).catch(() => {});
    }

    await refreshProfile();
    if (nextMove === 'find') {
      router.replace('/(tabs)/circles/find');
    } else if (nextMove === 'join') {
      router.replace('/(tabs)/circles/join');
    } else {
      router.replace('/(tabs)/circles/new');
    }
  };

  const canAdvanceName = name.trim().length > 0;
  const canAdvanceContext = context.trim().length > 0 || path === 'friends';

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
            <Text style={styles.progress}>step {step + 1} of 3</Text>
            {step === 0 ? (
              <>
                <Text style={styles.title}>
                  what should your{'\n'}
                  <Text style={styles.titleItalic}>people</Text> call you?
                </Text>
                <Text style={styles.lede}>
                  one name. no usernames, no presentation layer. the room starts there.
                </Text>
              </>
            ) : step === 1 ? (
              <>
                <Text style={styles.title}>what kind of room{'\n'}are you walking into?</Text>
                <Text style={styles.lede}>
                  this helps palmi open you in the right direction without turning setup into a
                  form.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>
                  let&apos;s make the{'\n'}
                  <Text style={styles.titleItalic}>first move</Text> easy.
                </Text>
                <Text style={styles.lede}>
                  choose how you want to land: start something, join with a code, or ask the network
                  for the right circle.
                </Text>
                <Text style={styles.note}>
                  notifications stay off by default in the product. this only decides whether we can
                  tap you quietly when something actually matters.
                </Text>
              </>
            )}
          </View>

          <View style={styles.form}>
            {step === 0 ? (
              <>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="maya"
                  autoCapitalize="none"
                  autoFocus
                  error={error}
                  maxLength={40}
                />
                <Button onPress={() => setStep(1)} disabled={!canAdvanceName}>
                  continue
                </Button>
              </>
            ) : step === 1 ? (
              <>
                <View style={styles.optionStack}>
                  {[
                    {
                      value: 'friends',
                      label: 'friends',
                      note: 'people who already feel like home',
                    },
                    { value: 'study', label: 'study', note: 'shared classes, prep, or learning' },
                    { value: 'professional', label: 'professional', note: 'work, craft, or peers' },
                    { value: 'creator', label: 'creator', note: 'people making things together' },
                  ].map((option) => {
                    const selected = path === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setPath(option.value as typeof path)}
                        style={[styles.optionCard, selected && styles.optionCardSelected]}
                      >
                        <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
                          {option.label}
                        </Text>
                        <Text style={styles.optionNote}>{option.note}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={context}
                  onChangeText={setContext}
                  placeholder={contextMeta.placeholder}
                  autoCapitalize="words"
                />
                <TextInput
                  value={bio}
                  onChangeText={setBio}
                  placeholder="one quiet line about you, if you want"
                  autoCapitalize="sentences"
                  maxLength={160}
                />
                <View style={styles.rowActions}>
                  <Button variant="ghost" onPress={() => setStep(0)} fullWidth={false}>
                    back
                  </Button>
                  <Button
                    onPress={() => setStep(2)}
                    disabled={!canAdvanceContext}
                    fullWidth={false}
                  >
                    continue
                  </Button>
                </View>
              </>
            ) : (
              <>
                <View style={styles.optionStack}>
                  {[
                    { value: 'new', label: 'start a circle', note: 'for people you already know' },
                    {
                      value: 'join',
                      label: 'join with a code',
                      note: 'when someone already invited you',
                    },
                    {
                      value: 'find',
                      label: 'ask the network',
                      note: 'describe the kind of room you need',
                    },
                  ].map((option) => {
                    const selected = nextMove === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setNextMove(option.value as typeof nextMove)}
                        style={[styles.optionCard, selected && styles.optionCardSelected]}
                      >
                        <Text style={[styles.optionTitle, selected && styles.optionTitleSelected]}>
                          {option.label}
                        </Text>
                        <Text style={styles.optionNote}>{option.note}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable
                  onPress={() => setWantsPush((value) => !value)}
                  style={[styles.optionCard, wantsPush && styles.optionCardSelected]}
                >
                  <Text style={[styles.optionTitle, wantsPush && styles.optionTitleSelected]}>
                    {wantsPush ? 'quiet notifications on' : 'keep it quiet for now'}
                  </Text>
                  <Text style={styles.optionNote}>
                    {wantsPush
                      ? 'only for question drops, approvals, and the moments you asked for.'
                      : 'you can turn them on per circle later.'}
                  </Text>
                </Pressable>
                {error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.rowActions}>
                  <Button variant="ghost" onPress={() => setStep(1)} fullWidth={false}>
                    back
                  </Button>
                  <Button onPress={handleContinue} loading={submitting} fullWidth={false}>
                    enter palmi
                  </Button>
                </View>
              </>
            )}
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
  progress: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.inkFaint,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
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
  optionStack: { gap: spacing.sm },
  optionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    padding: spacing.md,
    gap: 4,
  },
  optionCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgPanel,
  },
  optionTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
  },
  optionTitleSelected: {
    color: colors.accent,
  },
  optionNote: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  error: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.danger,
  },
});
