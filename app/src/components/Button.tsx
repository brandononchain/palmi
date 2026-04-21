import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, ViewStyle, ActivityIndicator } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps {
  onPress: () => void;
  children: ReactNode;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function Button({
  onPress,
  children,
  variant = 'primary',
  disabled,
  loading,
  style,
  fullWidth = true,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        variantStyles[variant].container,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles[variant].spinnerColor} size="small" />
      ) : (
        <Text style={[styles.label, variantStyles[variant].label]}>{children}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.body,
    letterSpacing: 0.2,
  },
});

const variantStyles = {
  primary: {
    container: { backgroundColor: colors.ink },
    label: { color: colors.bg },
    spinnerColor: colors.bg,
  },
  secondary: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: { color: colors.ink },
    spinnerColor: colors.ink,
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    label: { color: colors.inkMuted },
    spinnerColor: colors.inkMuted,
  },
} as const;
