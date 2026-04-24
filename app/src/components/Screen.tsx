import { ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme/tokens';

interface ScreenProps {
  children: ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  /**
   * When true, taps outside inputs dismiss the keyboard. Disabled by default
   * because wrapping scrollables in a tap handler breaks scroll/swipe gestures.
   * Turn on for form-heavy screens and use `keyboardShouldPersistTaps="handled"`
   * on any inner scrollable.
   */
  dismissKeyboardOnTap?: boolean;
  /** Wrap in KeyboardAvoidingView — use on screens with text inputs. */
  avoidKeyboard?: boolean;
}

/**
 * Screen wrapper used at the root of every screen.
 * Applies safe-area insets and the warm off-white bg.
 * Does NOT intercept touches by default — scrolling/swiping work freely.
 */
export function Screen({
  children,
  style,
  padded = true,
  dismissKeyboardOnTap = false,
  avoidKeyboard = false,
}: ScreenProps) {
  const inner = <View style={[styles.container, padded && styles.padded, style]}>{children}</View>;

  const body = dismissKeyboardOnTap ? (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      {inner}
    </TouchableWithoutFeedback>
  ) : (
    inner
  );

  const wrapped = avoidKeyboard ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {wrapped}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
});
