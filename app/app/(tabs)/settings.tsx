import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth, tierFromProfile } from '@/hooks/useAuth';
import { tierLabel } from '@/lib/billing';
import { colors, spacing, typography } from '@/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, profile, signOut } = useAuth();

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

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PREMIUM</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/memory' as any)}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>memory search</Text>
              <Text style={styles.rowSubtitle}>find your own posts and answers across circles</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/reflection' as any)}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>monthly reflection</Text>
              <Text style={styles.rowSubtitle}>your private paragraph for the month</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/yearbook' as any)}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>yearbook export</Text>
              <Text style={styles.rowSubtitle}>turn the year into a PDF you can keep</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
        </View>

        {/* Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => router.push('/notifications' as any)}
          >
            <View style={styles.rowMain}>
              <Text style={styles.rowTitle}>notification preferences</Text>
              <Text style={styles.rowSubtitle}>device status and per-circle moments</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>what palmi pings you for</Text>
            <Text style={styles.noteBody}>
              daily question drops, join approvals, and circle activity you opted into.
            </Text>
          </View>
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
  noteCard: {
    borderRadius: 12,
    backgroundColor: colors.bgPanel,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 4,
  },
  noteTitle: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.ink,
  },
  noteBody: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
    lineHeight: typography.caption * typography.lineRelaxed,
  },

  signOutWrap: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
});
