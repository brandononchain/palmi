import { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { moderateAndInsert } from '@/lib/moderation';
import { useAuth } from '@/hooks/useAuth';
import type { Uuid, IsoDate } from '@/lib/database.types';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const MAX_CHARS = 300;

interface DailyQuestion {
  id: Uuid;
  question_text: string;
  drops_at: IsoDate;
}

interface Answer {
  id: Uuid;
  author_id: Uuid;
  author_name: string;
  body: string | null;
  photo_url: string | null;
  created_at: IsoDate;
}

export default function AnswerScreen() {
  const router = useRouter();
  const { id: circleId, qid } = useLocalSearchParams<{ id: string; qid: string }>();
  const { user } = useAuth();

  const [question, setQuestion] = useState<DailyQuestion | null>(null);
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  // compose state (only used when the user hasn't answered yet)
  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!qid || !user) return;

    const [qRes, allAnsRes] = await Promise.all([
      supabase
        .from('daily_questions')
        .select('id, question_text, drops_at')
        .eq('id', qid)
        .maybeSingle(),
      supabase
        .from('question_answers')
        .select('id, author_id, body, photo_url, created_at, profiles:author_id(display_name)')
        .eq('question_id', qid)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
    ]);

    if (qRes.data) setQuestion(qRes.data as DailyQuestion);

    if (allAnsRes.data) {
      const mapped: Answer[] = allAnsRes.data.map((row: any) => ({
        id: row.id,
        author_id: row.author_id,
        author_name: row.profiles?.display_name ?? '?',
        body: row.body,
        photo_url: row.photo_url,
        created_at: row.created_at,
      }));
      setAnswers(mapped.filter((a) => a.author_id !== user.id));
      const mine = mapped.find((a) => a.author_id === user.id);
      setMyAnswer(mine ?? null);
    }

    setLoading(false);
  }, [qid, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('We need permission to access your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setPhoto(result.assets[0]);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!circleId || !qid || !user) return;
    if (!body.trim() && !photo) {
      setError('Say something, or add a photo.');
      return;
    }

    setSubmitting(true);

    let photoUrl: string | null = null;
    if (photo) {
      const ext = photo.uri.split('.').pop() ?? 'jpg';
      const filename = `${user.id}/${Date.now()}.${ext}`;
      const response = await fetch(photo.uri);
      const blob = await response.blob();
      const { error: uploadErr } = await supabase.storage
        .from('post-photos')
        .upload(filename, blob, { contentType: blob.type });
      if (uploadErr) {
        setError(`Photo upload failed: ${uploadErr.message}`);
        setSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('post-photos').getPublicUrl(filename);
      photoUrl = urlData.publicUrl;
    }

    const result = await moderateAndInsert({
      circle_id: circleId,
      content_type: 'answer',
      question_id: qid,
      body: body.trim() || null,
      photo_url: photoUrl,
    });

    setSubmitting(false);

    if (result.verdict === 'reject') {
      setError(result.reason ?? "This didn't post — please try rewording.");
      return;
    }

    // Reload to show the fresh answer + other people's answers
    setBody('');
    setPhoto(null);
    await load();
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.inkMuted} />
        </View>
      </Screen>
    );
  }

  const remaining = MAX_CHARS - body.length;
  const hasAnswered = myAnswer !== null;

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* The question itself, foregrounded */}
          <View style={styles.qBlock}>
            <Text style={styles.qLabel}>TODAY'S QUESTION</Text>
            <Text style={styles.qText}>{question?.question_text}</Text>
          </View>

          {/* If the user hasn't answered yet, show the composer */}
          {!hasAnswered && (
            <View style={styles.composerBlock}>
              <RNTextInput
                value={body}
                onChangeText={(t) => t.length <= MAX_CHARS && setBody(t)}
                placeholder="your answer…"
                placeholderTextColor={colors.inkFaint}
                multiline
                autoFocus
                style={styles.textInput}
                textAlignVertical="top"
              />

              {photo && (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />
                  <Pressable onPress={() => setPhoto(null)} style={styles.removePhoto} hitSlop={8}>
                    <Text style={styles.removePhotoText}>×</Text>
                  </Pressable>
                </View>
              )}

              {error && <Text style={styles.error}>{error}</Text>}

              <View style={styles.composerFooter}>
                <Pressable onPress={pickPhoto} hitSlop={8}>
                  <Text style={styles.photoButton}>
                    {photo ? 'Replace photo' : 'Add a photo'}
                  </Text>
                </Pressable>
                <Text style={[styles.counter, remaining < 40 && styles.counterWarn]}>
                  {remaining}
                </Text>
              </View>

              <Button
                onPress={handleSubmit}
                loading={submitting}
                disabled={!body.trim() && !photo}
              >
                Share with your circle
              </Button>
            </View>
          )}

          {/* My answer, if submitted */}
          {hasAnswered && myAnswer && (
            <View style={styles.myAnswerBlock}>
              <Text style={styles.sectionLabel}>YOUR ANSWER</Text>
              <AnswerCard answer={myAnswer} emphasis />
            </View>
          )}

          {/* Other people's answers */}
          {answers.length > 0 && (
            <View style={styles.answersBlock}>
              <Text style={styles.sectionLabel}>
                {hasAnswered ? `${answers.length} others answered` : `${answers.length} already answered`}
              </Text>
              <View style={styles.answersList}>
                {answers.map((ans) => (
                  <AnswerCard key={ans.id} answer={ans} />
                ))}
              </View>
            </View>
          )}

          {/* Nothing to show yet */}
          {!hasAnswered && answers.length === 0 && (
            <Text style={styles.emptyNote}>No one else has answered yet. Be the first.</Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function AnswerCard({ answer, emphasis = false }: { answer: Answer; emphasis?: boolean }) {
  return (
    <View style={[styles.answer, emphasis && styles.answerEmphasis]}>
      <View style={styles.answerHead}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{answer.author_name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.answerAuthor}>{answer.author_name}</Text>
      </View>
      {answer.photo_url && (
        <Image
          source={{ uri: answer.photo_url }}
          style={styles.answerPhoto}
          contentFit="cover"
          transition={200}
        />
      )}
      {answer.body && <Text style={styles.answerBody}>{answer.body}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  close: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
    padding: spacing.xs,
  },

  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },

  // The question itself
  qBlock: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  qLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  qText: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    lineHeight: typography.display * typography.lineTight,
    letterSpacing: typography.trackTight,
    color: colors.ink,
  },

  // Composer
  composerBlock: {
    gap: spacing.md,
  },
  textInput: {
    fontFamily: typography.fontSans,
    fontSize: typography.subtitle,
    color: colors.ink,
    lineHeight: typography.subtitle * typography.lineNormal,
    minHeight: 120,
    paddingTop: spacing.sm,
  },
  photoWrap: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.bgPanel,
  },
  removePhoto: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: { color: '#fff', fontSize: 20, lineHeight: 20, fontWeight: '300' },
  error: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.danger,
  },
  composerFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoButton: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  counter: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  counterWarn: { color: colors.accent },

  // My answer block
  myAnswerBlock: { gap: spacing.sm },

  // Others' answers
  answersBlock: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
  answersList: {
    gap: spacing.md,
  },

  answer: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  answerEmphasis: {
    backgroundColor: colors.bgPanel,
    borderColor: colors.border,
  },
  answerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  answerAuthor: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  answerPhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.bgPanel,
  },
  answerBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    lineHeight: typography.body * typography.lineNormal,
    color: colors.ink,
  },

  emptyNote: {
    fontFamily: typography.fontSerifItalic,
    fontSize: typography.body,
    color: colors.inkMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
});
