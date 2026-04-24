import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/theme/tokens';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/(auth)/phone" style={styles.link}>
          <Text style={styles.linkText}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.bg,
  },
  title: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  link: {
    marginTop: spacing.sm,
  },
  linkText: {
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.accent,
  },
});
