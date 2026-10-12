import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Thin wrapper over reanimated's useReducedMotion(), plus safe haptics.
 * Every looping / celebratory animation must check `reduceMotion` and render
 * a static state when it is on.
 */
export function useMotion() {
  const reduceMotion = useReducedMotion();
  return { reduceMotion };
}

type HapticKind = 'selection' | 'light' | 'success' | 'warning';

/** Fire a haptic. No-op on web; never throws. */
export function haptic(kind: HapticKind) {
  if (Platform.OS === 'web') return;
  try {
    if (kind === 'selection') void Haptics.selectionAsync();
    else if (kind === 'light') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (kind === 'success') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // haptics unavailable: ignore
  }
}
