import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { colors } from '@/theme/tokens';

export default function IndexScreen() {
  const { session, initialized, profile, profileLoaded } = useAuth();

  if (!initialized || (session && !profileLoaded)) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!profile) {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/(tabs)/home" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
