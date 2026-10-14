/**
 * Yes/no confirmation and one-button messages that work on every platform.
 *
 * - iOS / Android (this file): the native Alert.
 * - Web (confirm.web.tsx): an in-app dialog in the design system. React
 *   Native's Alert does nothing on web, and the browser's own confirm box
 *   looks foreign and blocks the page.
 *
 * Both files export the same API; Metro picks the platform file.
 */
import { Alert } from 'react-native';

export interface ConfirmOptions {
  /** Label of the button that resolves true. Default "OK". */
  confirmLabel?: string;
  /** Label of the button that resolves false. Default "Cancel". */
  cancelLabel?: string;
  /** Red confirm button (delete, sign out, cancel a consult). */
  destructive?: boolean;
}

export function confirmAsync(
  title: string,
  message: string,
  { confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false }: ConfirmOptions = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** A one-button message. Resolves when it is dismissed. */
export function notify(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
}
