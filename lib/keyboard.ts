import { Platform } from 'react-native';

/**
 * KeyboardAvoidingView behaviour for every screen with a text box.
 *
 * Android is always edge-to-edge now (Android 15+, Expo SDK 54+): the system
 * no longer resizes the window for the keyboard, so a screen that turned
 * keyboard handling off on Android had its message box, "Describe issue"
 * box and sheet Save buttons hidden under the keyboard (mobile review
 * must-fix 11). iOS: padding; Android: height; web: the browser handles it.
 */
export const KEYBOARD_BEHAVIOR: 'padding' | 'height' | undefined =
  Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined;
