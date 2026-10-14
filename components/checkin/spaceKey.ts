import { Platform } from 'react-native';

/**
 * Web: react-native-web only presses a Pressable on Enter, but a radio or
 * checkbox must also select on Space (A1). Spread the result onto the
 * Pressable; on native it adds nothing.
 */
export function spaceSelects(onSelect: () => void, disabled = false) {
  if (Platform.OS !== 'web' || disabled) return null;
  return {
    onKeyDown: (e: { key: string; preventDefault: () => void }) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        onSelect();
      }
    },
  };
}
