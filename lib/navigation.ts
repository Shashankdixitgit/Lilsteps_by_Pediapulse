import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

import { returnToSteps } from '@/lib/authRedirect';

/**
 * Back, or Home when there is nothing to go back to (a screen opened from a
 * link or a notification). Never a dead back arrow (mobile review must-fix 12).
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** Open the link remembered by AuthGate after sign-in, with Home underneath on native. */
export function openReturnTo(path: string) {
  for (const step of returnToSteps(path, Platform.OS)) {
    if (step.op === 'replace') router.replace(step.href as Href);
    else router.push(step.href as Href);
  }
}
