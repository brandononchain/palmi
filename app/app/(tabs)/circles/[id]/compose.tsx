import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VideoView, useVideoPlayer } from 'expo-video';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { supabase } from '@/lib/supabase';
import { moderateAndInsert } from '@/lib/moderation';
import { useAuth } from '@/hooks/useAuth';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const MAX_CHARS = 500;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

type VideoAsset = { uri: string; mimeType?: string | null; fileSize?: number | null };

export default function ComposeScreen() {
  const router = useRouter();
  const { id: circleId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [body, setBody] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [video, setVideo] = useState<VideoAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const haptic = (kind: 'light' | 'warn' = 'light') => {
    if (Platform.OS === 'web') return;
    try {
      if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // ignore
    }
  };

  const pickPhoto = async () => {
    setError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('We need permission to access your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      haptic('light');
      setPhoto(result.assets[0]);
      setVideo(null); // one media type at a time
    }
  };

  const pickVideo = async () => {
    setError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setError('We need permission to access your videos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.7,
      videoMaxDuration: 60,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const size = asset.fileSize ?? 0;
      if (size && size > MAX_VIDEO_BYTES) {
        haptic('warn');
        setError('Video is larger than 50 MB. Please trim it or pick a shorter clip.');
        return;
      }
      haptic('light');
      setVideo({ uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize });
      setPhoto(null);
    }
  };

  const handlePost = async () => {
    setError(null);
    if (!circleId || !user) return;
    if (!body.trim() && !photo && !video) {
      setError('Say something, or add a photo or video.');
      return;
    }

    setSubmitting(true);
    haptic('light');

    let photoUrl: string | null = null;
    let videoUrl: string | null = null;

    // --- Photo upload ------------------------------------------------------
    if (photo) {
      setUploadProgress('Uploading photo...');
      const ext = (photo.uri.split('.').pop() ?? 'jpg').toLowerCase();
      const filename = `${user.id}/${Date.now()}.${ext}`;
      const mime =
        photo.mimeType ??
        (ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'heic' || ext === 'heif'
              ? 'image/heic'
              : 'image/jpeg');

      const form = new FormData();
      form.append('file', {
        uri: photo.uri,
        name: filename.split('/').pop() ?? `photo.${ext}`,
        type: mime,
      } as any);

      const { error: uploadErr } = await supabase.storage
        .from('post-photos')
        .upload(filename, form as any, { contentType: mime, upsert: false });

      if (uploadErr) {
        setUploadProgress(null);
        setSubmitting(false);
        setError(`Photo upload failed: ${uploadErr.message}`);
        return;
      }

      photoUrl = supabase.storage.from('post-photos').getPublicUrl(filename).data.publicUrl;
    }

    // --- Video upload ------------------------------------------------------
    if (video) {
      setUploadProgress('Uploading video...');
      const ext = (video.uri.split('.').pop() ?? 'mp4').toLowerCase();
      const safeExt = ['mp4', 'mov', 'm4v', 'webm'].includes(ext) ? ext : 'mp4';
      const filename = `${user.id}/${Date.now()}.${safeExt}`;
      const mime =
        video.mimeType ??
        (safeExt === 'mov'
          ? 'video/quicktime'
          : safeExt === 'webm'
            ? 'video/webm'
            : safeExt === 'm4v'
              ? 'video/x-m4v'
              : 'video/mp4');

      const form = new FormData();
      form.append('file', {
        uri: video.uri,
        name: filename.split('/').pop() ?? `video.${safeExt}`,
        type: mime,
      } as any);

      const { error: uploadErr } = await supabase.storage
        .from('post-videos')
        .upload(filename, form as any, { contentType: mime, upsert: false });

      if (uploadErr) {
        setUploadProgress(null);
        setSubmitting(false);
        setError(`Video upload failed: ${uploadErr.message}`);
        return;
      }

      videoUrl = supabase.storage.from('post-videos').getPublicUrl(filename).data.publicUrl;
    }

    setUploadProgress('Posting...');
    const result = await moderateAndInsert({
      circle_id: circleId,
      content_type: 'post',
      body: body.trim() || null,
      photo_url: photoUrl,
      video_url: videoUrl,
    });

    setUploadProgress(null);
    setSubmitting(false);

    if (result.verdict === 'reject') {
      haptic('warn');
      setError(result.reason ?? "This didn't post -- please try rewording.");
      return;
    }

    router.back();
  };

  const remaining = MAX_CHARS - body.length;
  const insets = useSafeAreaInsets();

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Button
            onPress={handlePost}
            loading={submitting}
            disabled={!body.trim() && !photo && !video}
            style={styles.postButton}
            fullWidth={false}
          >
            Share
          </Button>
        </View>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <RNTextInput
            value={body}
            onChangeText={(t) => t.length <= MAX_CHARS && setBody(t)}
            placeholder="What's on your mind?"
            placeholderTextColor={colors.inkFaint}
            multiline
            style={styles.textInput}
            textAlignVertical="top"
          />

          {photo && (
            <View style={styles.mediaWrap}>
              <Image source={{ uri: photo.uri }} style={styles.mediaPreview} contentFit="cover" />
              <Pressable onPress={() => setPhoto(null)} style={styles.removeMedia} hitSlop={8}>
                <Ionicons name="close" size={18} color="#fff" />
              </Pressable>
            </View>
          )}

          {video && <VideoPreview uri={video.uri} onRemove={() => setVideo(null)} />}

          {uploadProgress && (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={colors.inkMuted} />
              <Text style={styles.progressText}>{uploadProgress}</Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.md }]}
        >
          <View style={styles.footerActions}>
            <Pressable onPress={pickPhoto} style={styles.iconBtn} hitSlop={8}>
              <Ionicons name="image-outline" size={22} color={photo ? colors.accent : colors.ink} />
            </Pressable>
            <Pressable onPress={pickVideo} style={styles.iconBtn} hitSlop={8}>
              <Ionicons
                name="videocam-outline"
                size={22}
                color={video ? colors.accent : colors.ink}
              />
            </Pressable>
          </View>
          <Text style={[styles.counter, remaining < 50 && styles.counterWarning]}>{remaining}</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function VideoPreview({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
  });
  return (
    <View style={styles.mediaWrap}>
      <VideoView player={player} style={styles.videoPreview} nativeControls contentFit="cover" />
      <Pressable onPress={onRemove} style={styles.removeMedia} hitSlop={8}>
        <Ionicons name="close" size={18} color="#fff" />
      </Pressable>
    </View>
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
  bodyScroll: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  textInput: {
    fontFamily: typography.fontSans,
    fontSize: typography.subtitle,
    color: colors.ink,
    lineHeight: typography.subtitle * typography.lineNormal,
    minHeight: 120,
  },
  mediaWrap: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  mediaPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: colors.bgPanel,
  },
  videoPreview: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  removeMedia: {
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
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  progressText: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
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
  footerActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
