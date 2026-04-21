import { StyleSheet, Text, View, Pressable } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { colors, spacing, typography } from '@/theme/tokens';

export default function SettingsScreen() {
  const { profile, signOut } = useAuth();

  return (
    <Screen>
      <View style={styles.content}>
        <View>
          <Text style={styles.title}>you</Text>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.display_name?.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
            <View>
              <Text style={styles.name}>{profile?.display_name}</Text>
              <Text style={styles.meta}>Member since {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : ''}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Button variant="ghost" onPress={signOut}>
            Sign out
          </Button>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
  },
  title: {
    fontFamily: typography.fontSerif,
    fontSize: typography.display,
    color: colors.ink,
    letterSpacing: typography.trackTight,
    marginBottom: spacing.xl,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.bgPanel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.title,
    color: colors.inkMuted,
  },
  name: {
    fontFamily: typography.fontSerif,
    fontSize: typography.subtitle + 2,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  meta: {
    fontFamily: typography.fontSans,
    fontSize: typography.caption,
    color: colors.inkMuted,
  },
  footer: {
    paddingBottom: spacing.xl,
  },
});
