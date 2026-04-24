import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth, tierFromProfile } from '@/hooks/useAuth';
import { tierLabel } from '@/lib/billing';
import { registerForPushAsync, sendTestPush } from '@/lib/notifications';
import { colors, spacing, typography } from '@/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const [testing, setTesting] = useState(false);

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  const phone = user?.phone ? `••• ••• ••${user.phone.slice(-4)}` : null;

  const tier = tierFromProfile(profile);
  const renewal = profile?.current_period_end
    ? new Date(profile.current_period_end).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const handleTestPush = async () => {
    if (!user) return;
    setTesting(true);
    const reg = await registerForPushAsync(user.id).catch(() => null);
    if (!reg || reg.status !== 'granted' || !reg.token) {
      setTesting(false);
      Alert.alert(
        'Notifications are off',
        'Enable notifications for palmi in your device settings to receive a test.'
      );
      return;
    }
    const ok = await sendTestPush(user.id);
    setTesting(false);
    if (!ok) {
      Alert.alert('Could not send', 'The test push did not reach Expo. Try again.');
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need to verify your phone number again to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>settings</Text>

        {/* Profile card */}
        <Pressable
          onPress={() => router.push('/profile-edit')}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>
                  {profile?.display_name?.charAt(0).toUpperCase() ?? '?'}
                </Text>
              )}
            </View>
            <View style={styles.nameBlock}>
              <Text style={styles.displayName} numberOfLines={1}>
                {profile?.display_name ?? 'you'}
              </Text>
              {memberSince && <Text style={styles.meta}>member since {memberSince}</Text>}
              <Text style={styles.editHint}>tap to edit profile</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </View>
          {phone && (
            <>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>phone</Text>
                <Text style={styles.infoValue}>{phone}</Text>
              </View>
            </>
          )}
        </Pressable>

        {/* Membership */}
        <Pressable
          onPress={() => router.push('/membership')}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.profileRow}>
            <View style={styles.nameBlock}>
              <Text style={styles.displayName}>{tierLabel(tier)}</Text>
              {tier === 'free' ? (
                <Text style={styles.editHint}>
                  unlock premium for full recap history &amp; more
                </Text>
              ) : renewal ? (
                <Text style={styles.meta}>renews {renewal}</Text>
              ) : (
                <Text style={styles.editHint}>manage membership</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </View>
        </Pressable>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={handleTestPush}
            disabled={testing}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>Send test notification</Text>
              <Text style={styles.rowSubtitle}>
                {testing ? 'sending…' : 'check push notifications are working'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <View style={styles.row}>
            <Text style={styles.rowTitle}>version</Text>
            <Text style={styles.rowMeta}>1.0.0</Text>
          </View>
        </View>

        {/* Sign out */}
        <View style={styles.signOutWrap}>
          <Button variant="ghost" onPress={confirmSignOut}>
            Sign out
          </Button>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    color: colors.ink,
    letterSpacing: typography.trackTight,
  },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    overflow: 'hidden',
  },
  cardPressed: {
    backgroundColor: colors.bgPanel,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontFamily: typography.fontSerif,
    fontSize: 22,
    color: colors.inkMuted,
  },
  nameBlock: {
    flex: 1,
    gap: 2,
  },
  displayName: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body + 2,
    color: colors.ink,
  },
  meta: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  editHint: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro,
    color: colors.accent,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoLabel: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  infoValue: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.ink,
    letterSpacing: 1,
  },

  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: {
    backgroundColor: colors.bgPanel,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
  },
  rowSubtitle: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkFaint,
  },
  rowMeta: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    letterSpacing: 0.5,
  },

  signOutWrap: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
});
