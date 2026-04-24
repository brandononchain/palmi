import { Stack, Redirect, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
} from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';

import { useAuth } from '@/hooks/useAuth';
import { registerForPushAsync } from '@/lib/notifications';
import { colors } from '@/theme/tokens';

function AuthGate() {
  const { session, initialized, profile, profileLoaded } = useAuth();
  const segments = useSegments();

  // Refresh push token on app launch for signed-in users.
  useEffect(() => {
    if (session?.user?.id && profile) {
      void registerForPushAsync(session.user.id).catch(() => {});
    }
  }, [session?.user?.id, profile]);

  if (!initialized) return null;
  // Wait for the profile fetch before routing — otherwise we flash the
  // onboarding screen on every cold start because `profile` is momentarily
  // null while the query is in flight.
  if (session && !profileLoaded) return null;

  const group = segments[0];
  const inAuthGroup = group === '(auth)';
  const inOnboarding = group === 'onboarding';

  if (!session && !inAuthGroup) {
    return <Redirect href="/(auth)/welcome" />;
  }
  if (session && !profile && !inOnboarding) {
    return <Redirect href="/onboarding" />;
  }
  if (session && profile && (inAuthGroup || inOnboarding)) {
    return <Redirect href="/(tabs)/home" />;
  }

  return null;
}

export default function RootLayout() {
  const { initialized } = useAuth();
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
  });

  if (!fontsLoaded) {
    return (
      <View style={[styles.root, styles.splash]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="+not-found" />
        </Stack>
        <AuthGate />
        {!initialized && (
          <View style={styles.splash}>
            <ActivityIndicator color={colors.ink} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
