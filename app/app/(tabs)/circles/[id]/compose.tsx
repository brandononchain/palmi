import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const MAX_CHARS = 500;

export default function ComposeScreen() {
  const router = useRouter();
  const { id: circleId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('We need permission to access your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0]);
    }
  };

  const handlePost = async () => {
    setError(null);
    if (!circleId || !user) return;
    if (!body.trim() && !photo) {
      setError('Say something, or add a photo.');
      return;
    }

    setSubmitting(true);

    let photoUrl: string | null = null;

    if (photo) {
      // Upload to Supabase Storage (bucket: post-photos)
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

      const { data: urlData } = supabase.storage
        .from('post-photos')
        .getPublicUrl(filename);
      photoUrl = urlData.publicUrl;
    }

    const { error: postErr } = await supabase.from('posts').insert({
      circle_id: circleId,
      author_id: user.id,
      body: body.trim() || null,
      photo_url: photoUrl,
    });

    setSubmitting(false);

    if (postErr) {
      setError(postErr.message);
      return;
    }

    router.back();
  };

  const remaining = MAX_CHARS - body.length;

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Button
            onPress={handlePost}
            loading={submitting}
            disabled={!body.trim() && !photo}
            style={styles.postButton}
            fullWidth={false}
          >
            Share
          </Button>
        </View>

        <View style={styles.body}>
          <RNTextInput
            value={body}
            onChangeText={(t) => t.length <= MAX_CHARS && setBody(t)}
            placeholder="What's on your mind?"
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
        </View>

        <View style={styles.footer}>
          <Pressable onPress={pickPhoto} style={styles.photoButton} hitSlop={8}>
            <Text style={styles.photoButtonText}>{photo ? 'Replace photo' : 'Add a photo'}</Text>
          </Pressable>
          <Text style={[styles.counter, remaining < 50 && styles.counterWarning]}>
            {remaining}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cancel: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.inkMuted,
  },
  postButton: {
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    paddingVertical: 0,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  textInput: {
    fontFamily: typography.fontSans,
    fontSize: typography.subtitle,
    color: colors.ink,
    lineHeight: typography.subtitle * typography.lineNormal,
    minHeight: 120,
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
  removePhotoText: {
    color: '#fff',
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '300',
  },
  error: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.danger,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  photoButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  photoButtonText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  counter: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  counterWarning: {
    color: colors.accent,
  },
});
