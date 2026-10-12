import { Ionicons } from '@expo/vector-icons';
import { Ref } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, TextInput, View, ViewStyle } from 'react-native';

import { AppColors, FontFamily } from '@/constants/theme';

export interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Send button inactive (empty draft, sending, waiting on a reply). */
  sendDisabled: boolean;
  editable?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** Submit on return (single-line chats); the send button always works. */
  submitOnEnter?: boolean;
  inputRef?: Ref<TextInput>;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shared chat composer (check-in + doctor chat): one 44-high growing field,
 * `surfaceContainer` fill, no border, with a 36 forest send circle inside it.
 * Disabled send = `surfaceContainerHigh` fill + `outlineVariant` icon (no
 * faded forest). Web: no browser outline, no resize handle.
 */
export function ChatComposer({
  value,
  onChangeText,
  onSend,
  sendDisabled,
  editable = true,
  placeholder = 'Message',
  maxLength,
  submitOnEnter,
  inputRef,
  style,
}: ChatComposerProps) {
  return (
    <View style={[styles.field, style]}>
      <TextInput
        ref={inputRef}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={AppColors.placeholder}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        maxLength={maxLength}
        multiline
        // Web renders a 2-row textarea by default; keep it one 44-high line.
        {...(Platform.OS === 'web' ? { numberOfLines: 1 } : null)}
        {...(submitOnEnter
          ? { onSubmitEditing: onSend, returnKeyType: 'send' as const, blurOnSubmit: false }
          : null)}
      />
      <Pressable
        onPress={onSend}
        disabled={sendDisabled}
        accessibilityRole="button"
        accessibilityLabel="Send"
        accessibilityState={{ disabled: sendDisabled }}
        hitSlop={4}
        style={({ pressed }) => [
          styles.send,
          sendDisabled && styles.sendDisabled,
          pressed && !sendDisabled && styles.sendPressed,
        ]}
      >
        <Ionicons
          name="arrow-up"
          size={18}
          color={sendDisabled ? AppColors.outlineVariant : AppColors.onPrimary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 44,
    backgroundColor: AppColors.surfaceContainer,
    borderRadius: 22,
    borderCurve: 'continuous',
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    paddingTop: Platform.OS === 'ios' ? 9 : 7,
    paddingBottom: 7,
    fontFamily: FontFamily.regular,
    fontSize: 16, // 16 keeps iOS from zooming on focus
    lineHeight: 22,
    color: AppColors.onSurface,
    ...(Platform.OS === 'web'
      ? ({ outlineWidth: 0, resize: 'none' } as object)
      : null),
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: AppColors.surfaceContainerHigh },
  sendPressed: { backgroundColor: AppColors.primaryDim },
});
