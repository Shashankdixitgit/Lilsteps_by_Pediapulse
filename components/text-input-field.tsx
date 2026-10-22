import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { AppColors, FontFamily, Radius, Shadow } from '@/constants/theme';

interface TextInputFieldProps extends TextInputProps {
  label?: string;
  /** 12 muted helper shown UNDER the field (e.g. "With country code"). */
  hint?: string;
  /** Show `hint` beside the label instead of under the field (short units like "(kg)"). */
  hintInline?: boolean;
  /** Error message shown under the field (danger border + icon). */
  error?: string;
  /** Leading icon / element inside the field. */
  leading?: ReactNode;
}

/**
 * Text input per DESIGN.md: white field, always-present 1.5px `fieldBorder`
 * (3.6:1, WCAG 1.4.11), 10px radius. Focus swaps the border to secondary and
 * adds a lavender focus ring via box-shadow (no layout shift).
 */
export function TextInputField({ label, hint, hintInline, error, leading, style, ...props }: TextInputFieldProps) {
  const [focused, setFocused] = useState(false);
  const hasError = !!error;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={styles.label}>
          {label}
          {hint && hintInline ? <Text style={styles.hintInline}>{`  ${hint}`}</Text> : null}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          hasError && styles.fieldError,
        ]}
      >
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <TextInput
          {...props}
          // Lighter than typed text (fields are pure white, where `outline`
          // is allowed as text), so a hint like "e.g. 12.5" never reads as
          // an answer already filled in.
          placeholderTextColor={props.placeholderTextColor ?? AppColors.outline}
          // Screen readers announce the visible label, not the placeholder.
          accessibilityLabel={props.accessibilityLabel ?? (label ? (hint && hintInline ? `${label} ${hint}` : label) : undefined)}
          accessibilityHint={props.accessibilityHint ?? (hint && !hintInline ? hint : undefined)}
          style={[styles.input, style]}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
        />
      </View>
      {hint && !hintInline && !hasError ? <Text style={styles.hint}>{hint}</Text> : null}
      {hasError ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={14} color={AppColors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  label: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
  },
  hint: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.muted,
    marginLeft: 2,
  },
  hintInline: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    color: AppColors.muted,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.card,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1.5,
    borderColor: AppColors.fieldBorder,
    minHeight: 48,
    // Lets the field shrink below the input's intrinsic width at narrow
    // widths / 200% zoom instead of pushing the page sideways (R2-12).
    minWidth: 0,
  },
  fieldFocused: {
    borderColor: AppColors.secondary,
    boxShadow: Shadow.focusRing,
  },
  fieldError: {
    borderColor: AppColors.danger,
  },
  leading: {
    paddingLeft: 14,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 45,
    paddingHorizontal: 14,
    fontFamily: FontFamily.regular,
    fontSize: 16, // 16 keeps iOS from zooming on focus
    color: AppColors.onSurface,
    // The token focus ring replaces the browser's blue outline on web.
    // outlineStyle is needed too, or Chrome still draws it on multi-line fields;
    // resize: none hides the textarea drag handle.
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'solid', outlineWidth: 0, resize: 'none' } as object)
      : null),
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 2,
  },
  errorText: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    color: AppColors.danger,
  },
});
