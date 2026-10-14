import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';

import { dbg } from '@/lib/debug';

/** 'unsupported' on web, where push notifications are not used. */
export type NotificationPermission = 'loading' | 'granted' | 'denied' | 'undetermined' | 'unsupported';

/**
 * The phone's push-notification permission for LilSteps, re-read whenever the
 * app comes back to the foreground (e.g. after the parent changes it in the
 * phone's settings).
 *
 * The OS owns this permission: the app can ask for it once, but turning it
 * off (or back on after a "Don't allow") happens in the phone's settings, so
 * `setEnabled` opens them in those cases.
 *
 * expo-notifications is imported dynamically (see usePushToken) so the web
 * bundle never loads it.
 */
export function useNotificationPermission() {
  const [status, setStatus] = useState<NotificationPermission>(
    Platform.OS === 'web' ? 'unsupported' : 'loading',
  );
  const [canAskAgain, setCanAskAgain] = useState(true);

  const refresh = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const Notifications = await import('expo-notifications');
      const res = await Notifications.getPermissionsAsync();
      setStatus(res.status as NotificationPermission);
      setCanAskAgain(res.canAskAgain);
    } catch (e) {
      dbg.hook('useNotificationPermission: read failed', e);
      setStatus('undetermined');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {
      Alert.alert('Open your phone settings', 'Go to Settings, then Apps, then LilSteps, then Notifications.');
    });
  }, []);

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (Platform.OS === 'web') return;
      if (!next) {
        Alert.alert(
          'Turn off notifications',
          'You will stop getting consult reminders, doctor replies and vaccine reminders. You can turn them off in your phone settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open settings', onPress: openSettings },
          ],
        );
        return;
      }
      if (!canAskAgain) {
        openSettings();
        return;
      }
      try {
        const Notifications = await import('expo-notifications');
        const res = await Notifications.requestPermissionsAsync();
        setStatus(res.status as NotificationPermission);
        setCanAskAgain(res.canAskAgain);
        if (res.status !== 'granted' && !res.canAskAgain) openSettings();
      } catch (e) {
        dbg.hook('useNotificationPermission: request failed', e);
        openSettings();
      }
    },
    [canAskAgain, openSettings],
  );

  return { status, setEnabled, refresh };
}
