import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useAuth } from '@/hooks/useAuth';
import { registerForPushAsync, sendTestPush } from '@/lib/notifications';
import { colors, spacing, typography } from '@/theme/tokens';

export default function SettingsScreen() {
  const { profile, user, signOut } = useAuth();
  const [testing, setTesting] = useState(false);

  const handleTestPush = async () => {
    if (!user) return;
    setTesting(true);
    const reg = await registerForPushAsync(user.id).catch(() => null);
    if (!reg || reg.status !== 'granted' || !reg.token) {
      setTesting(false);
      Alert.alert(
        'Notifications are off',
        'Enable notifications for palmi in your device settings to receive a test.',
      );
      return;
    }
    const ok = await sendTestPush(user.id);
    setTesting(false);
    if (!ok) {
      Alert.alert('Could not send', 'The test push did not reach Expo. Try again.');
    }
  };

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
          <View style={styles.debug}>
            <Text style={styles.debugLabel}>DEBUG</Text>
            <Button variant="secondary" onPress={handleTestPush} loading={testing}>
              Send test notification
            </Button>
          </View>
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
    gap: spacing.md,
  },
  debug: {
    gap: spacing.xs,
  },
  debugLabel: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.micro - 2,
    color: colors.inkFaint,
    letterSpacing: 1.5,
  },
});
