import { forwardRef } from 'react';
import {
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  View,
} from 'react-native';

import { colors, radius, spacing, typography } from '../theme/tokens';

interface TextInputProps extends RNTextInputProps {
  label?: string;
  error?: string | null;
  helper?: string;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  ({ label, error, helper, style, ...rest }, ref) => {
    return (
      <View style={styles.wrapper}>
        {label && <Text style={styles.label}>{label}</Text>}
        <RNTextInput
          ref={ref}
          placeholderTextColor={colors.inkFaint}
          style={[
            styles.input,
            error ? styles.inputError : null,
            style,
          ]}
          {...rest}
        />
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : helper ? (
          <Text style={styles.helperText}>{helper}</Text>
        ) : null}
      </View>
    );
  }
);

TextInput.displayName = 'TextInput';

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: typography.fontSansMedium,
    fontSize: typography.caption,
    color: colors.inkMuted,
    marginLeft: spacing.xs,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontFamily: typography.fontSans,
    fontSize: typography.body,
    color: colors.ink,
    minHeight: 52,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.danger,
    marginLeft: spacing.sm,
  },
  helperText: {
    fontFamily: typography.fontSans,
    fontSize: typography.micro,
    color: colors.inkFaint,
    marginLeft: spacing.sm,
  },
});
