import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/TextInput';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Seniority } from '@/lib/database.types';
import { colors, spacing, typography } from '@/theme/tokens';

const SENIORITY_OPTIONS: { value: Seniority; label: string }[] = [
  { value: 'intern', label: 'intern' },
  { value: 'ic', label: 'individual contributor' },
  { value: 'manager', label: 'manager' },
  { value: 'director', label: 'director' },
  { value: 'vp', label: 'vp' },
  { value: 'c_suite', label: 'c-suite' },
  { value: 'founder', label: 'founder' },
  { value: 'other', label: 'other' },
];

export default function ProfileEditScreen() {
  const router = useRouter();
  const { profile, user, refreshProfile } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [department, setDepartment] = useState('');
  const [industry, setIndustry] = useState('');
  const [seniority, setSeniority] = useState<Seniority | null>(null);
  const [school, setSchool] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationCountry, setLocationCountry] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name ?? '');
    setBio(profile.bio ?? '');
    setFullName(profile.full_name ?? '');
    setJobTitle(profile.job_title ?? '');
    setCompany(profile.company ?? '');
    setDepartment(profile.department ?? '');
    setIndustry(profile.industry ?? '');
    setSeniority(profile.seniority ?? null);
    setSchool(profile.school ?? '');
    setGraduationYear(profile.graduation_year ? String(profile.graduation_year) : '');
    setLocationCity(profile.location_city ?? '');
    setLocationCountry(profile.location_country ?? '');
    setWebsiteUrl(profile.website_url ?? '');
    setAvatarUrl(profile.avatar_url ?? null);
  }, [profile]);

  const handlePickAvatar = async () => {
    if (!user || avatarBusy) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photos permission needed',
        'Enable photos access for palmi in your device settings to pick a profile picture.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];

    setAvatarBusy(true);
    const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase();
    const safeExt = ['png', 'webp', 'heic', 'heif'].includes(ext) ? ext : 'jpg';
    const mime =
      asset.mimeType ??
      (safeExt === 'png'
        ? 'image/png'
        : safeExt === 'webp'
          ? 'image/webp'
          : safeExt === 'heic' || safeExt === 'heif'
            ? 'image/heic'
            : 'image/jpeg');
    const filename = `${user.id}/${Date.now()}.${safeExt}`;

    const form = new FormData();
    form.append('file', {
      uri: asset.uri,
      name: filename.split('/').pop() ?? `avatar.${safeExt}`,
      type: mime,
    } as any);

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(filename, form as any, { contentType: mime, upsert: false });
    if (uploadErr) {
      setAvatarBusy(false);
      Alert.alert('Upload failed', uploadErr.message);
      return;
    }

    const publicUrl = supabase.storage.from('avatars').getPublicUrl(filename).data.publicUrl;
    // Cache-bust so newly uploaded photo replaces the cached one.
    const bustedUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: bustedUrl })
      .eq('id', user.id);

    if (updateErr) {
      setAvatarBusy(false);
      Alert.alert('Could not save photo', updateErr.message);
      return;
    }

    setAvatarUrl(bustedUrl);
    setAvatarBusy(false);
    await refreshProfile();
  };

  const handleRemoveAvatar = () => {
    if (!user || avatarBusy || !avatarUrl) return;
    Alert.alert('Remove profile picture?', 'Your initial will show instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setAvatarBusy(true);
          const { error } = await supabase
            .from('profiles')
            .update({ avatar_url: null })
            .eq('id', user.id);
          setAvatarBusy(false);
          if (error) {
            Alert.alert('Could not remove', error.message);
            return;
          }
          setAvatarUrl(null);
          await refreshProfile();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!displayName.trim()) {
      Alert.alert('Display name required', 'Please enter a display name.');
      return;
    }
    if (bio.length > 160) {
      Alert.alert('Bio too long', 'Bio must be 160 characters or fewer.');
      return;
    }
    const gradYearNum = graduationYear ? parseInt(graduationYear, 10) : null;
    if (
      graduationYear &&
      (Number.isNaN(gradYearNum) || gradYearNum! < 1900 || gradYearNum! > 2100)
    ) {
      Alert.alert('Invalid year', 'Please enter a valid graduation year.');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        full_name: fullName.trim() || null,
        job_title: jobTitle.trim() || null,
        company: company.trim() || null,
        department: department.trim() || null,
        industry: industry.trim() || null,
        seniority,
        school: school.trim() || null,
        graduation_year: gradYearNum,
        location_city: locationCity.trim() || null,
        location_country: locationCountry.trim().toUpperCase() || null,
        website_url: websiteUrl.trim() || null,
      })
      .eq('id', user.id);
    setSaving(false);

    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    await refreshProfile();
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen padded={false}>
        <View style={styles.navBar}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.navTitle}>edit profile</Text>
          <View style={styles.navButton} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Profile photo */}
            <View style={styles.avatarBlock}>
              <Pressable
                onPress={handlePickAvatar}
                disabled={avatarBusy}
                style={({ pressed }) => [
                  styles.avatarCircle,
                  pressed && !avatarBusy && styles.avatarPressed,
                ]}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {(displayName || profile?.display_name || '?').charAt(0).toUpperCase()}
                  </Text>
                )}
                <View style={styles.avatarCameraBadge}>
                  <Ionicons name="camera" size={14} color={colors.bg} />
                </View>
              </Pressable>
              <View style={styles.avatarActions}>
                <Pressable
                  onPress={handlePickAvatar}
                  disabled={avatarBusy}
                  hitSlop={8}
                  style={({ pressed }) => [pressed && styles.linkPressed]}
                >
                  <Text style={styles.avatarAction}>
                    {avatarBusy ? 'working…' : avatarUrl ? 'change photo' : 'add photo'}
                  </Text>
                </Pressable>
                {avatarUrl && !avatarBusy && (
                  <Pressable onPress={handleRemoveAvatar} hitSlop={8}>
                    <Text style={styles.avatarActionMuted}>remove</Text>
                  </Pressable>
                )}
              </View>
            </View>

            {/* Basics */}
            <Section title="BASICS">
              <TextInput
                label="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="how your people see you"
                autoCapitalize="words"
                maxLength={40}
              />
              <TextInput
                label="Bio"
                value={bio}
                onChangeText={setBio}
                placeholder="a sentence about you"
                multiline
                maxLength={160}
                helper={`${bio.length}/160`}
                style={styles.multiline}
              />
            </Section>

            {/* Work */}
            <Section title="WORK">
              <TextInput
                label="Full name (private)"
                value={fullName}
                onChangeText={setFullName}
                placeholder="shared only with palmi AI"
                autoCapitalize="words"
                maxLength={80}
              />
              <TextInput
                label="Job title"
                value={jobTitle}
                onChangeText={setJobTitle}
                placeholder="e.g. product designer"
                autoCapitalize="words"
                maxLength={80}
              />
              <TextInput
                label="Company"
                value={company}
                onChangeText={setCompany}
                placeholder="where you work"
                autoCapitalize="words"
                maxLength={80}
              />
              <TextInput
                label="Department"
                value={department}
                onChangeText={setDepartment}
                placeholder="e.g. design, engineering"
                autoCapitalize="words"
                maxLength={60}
              />
              <TextInput
                label="Industry"
                value={industry}
                onChangeText={setIndustry}
                placeholder="e.g. fintech, healthcare"
                autoCapitalize="words"
                maxLength={60}
              />
              <View style={styles.fieldBlock}>
                <Text style={styles.label}>Seniority</Text>
                <View style={styles.pillRow}>
                  {SENIORITY_OPTIONS.map((opt) => {
                    const active = seniority === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setSeniority(active ? null : opt.value)}
                        style={({ pressed }) => [
                          styles.pill,
                          active && styles.pillActive,
                          pressed && styles.pillPressed,
                        ]}
                      >
                        <Text style={[styles.pillText, active && styles.pillTextActive]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </Section>

            {/* Education */}
            <Section title="EDUCATION">
              <TextInput
                label="School"
                value={school}
                onChangeText={setSchool}
                placeholder="where you studied"
                autoCapitalize="words"
                maxLength={80}
              />
              <TextInput
                label="Graduation year"
                value={graduationYear}
                onChangeText={setGraduationYear}
                placeholder="e.g. 2024"
                keyboardType="number-pad"
                maxLength={4}
              />
            </Section>

            {/* Location */}
            <Section title="LOCATION">
              <TextInput
                label="City"
                value={locationCity}
                onChangeText={setLocationCity}
                placeholder="e.g. brooklyn"
                autoCapitalize="words"
                maxLength={60}
              />
              <TextInput
                label="Country code"
                value={locationCountry}
                onChangeText={(v) => setLocationCountry(v.toUpperCase())}
                placeholder="e.g. US, GB, FR"
                autoCapitalize="characters"
                maxLength={2}
              />
            </Section>

            {/* Links */}
            <Section title="LINKS">
              <TextInput
                label="Website"
                value={websiteUrl}
                onChangeText={setWebsiteUrl}
                placeholder="https://..."
                autoCapitalize="none"
                keyboardType="url"
                maxLength={200}
              />
            </Section>

            <View style={styles.saveWrap}>
              <Button onPress={handleSave} loading={saving}>
                Save changes
              </Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  navButtonPressed: {
    backgroundColor: colors.bgPanel,
  },
  navTitle: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  section: { gap: spacing.sm },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    marginLeft: spacing.xs,
  },
  sectionBody: { gap: spacing.md },
  fieldBlock: { gap: spacing.xs },
  avatarBlock: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.bgPanel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPressed: {
    opacity: 0.85,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontFamily: typography.fontSerif,
    fontSize: 40,
    color: colors.inkMuted,
  },
  avatarCameraBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  avatarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarAction: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.accent,
  },
  avatarActionMuted: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  linkPressed: {
    opacity: 0.6,
  },
  label: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.inkMuted,
    marginLeft: spacing.xs,
  },
  multiline: {
    minHeight: 88,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderRadius: 20,
    textAlignVertical: 'top',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: colors.bgCard,
  },
  pillActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  pillPressed: {
    opacity: 0.7,
  },
  pillText: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  pillTextActive: {
    color: colors.bg,
    fontFamily: typography.fontSansMedium,
  },
  saveWrap: {
    marginTop: spacing.md,
    paddingBottom: spacing.lg,
  },
});
