import { Linking, Platform } from 'react-native';

import { confirmAsync, notify } from '@/lib/confirm';

/**
 * Camera access was refused (review should-fix 3): say why it is needed and
 * offer to open the phone's settings, instead of a dead-end "OK". (Choosing
 * a photo needs no permission at all: the system photo picker is used.)
 */
export async function cameraAccessDenied(canAskAgain: boolean): Promise<void> {
  const message = canAskAgain
    ? 'LilSteps needs the camera to take a photo of a report or vaccine card. You can also choose a photo instead.'
    : 'Camera access is off for LilSteps. Turn it on in Settings to take a photo, or choose a photo instead.';
  if (Platform.OS === 'web' || canAskAgain) {
    await notify('Camera not allowed', message);
    return;
  }
  const open = await confirmAsync('Camera not allowed', message, { confirmLabel: 'Open Settings', cancelLabel: 'Not now' });
  if (open) await Linking.openSettings().catch(() => undefined);
}
