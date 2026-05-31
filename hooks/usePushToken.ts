import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';

/**
 * Registers for Expo push notifications and upserts the token into
 * `parents.expo_push_token`. Idempotent. No-op on simulators and on web.
 *
 * `expo-notifications` runs DOM/localStorage side effects at module load
 * which crash under Expo's web SSR (Node injects a half-broken localStorage
 * stub). We dynamically import the package only when actually registering
 * on iOS/Android, so the web bundle never pulls it in.
 */
export function usePushTokenRegistration() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (Platform.OS === 'web') {
      dbg.hook('usePushToken: skipped — web');
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        // Dynamic import — keeps the package out of the web bundle.
        const Device = await import('expo-device');
        const Notifications = await import('expo-notifications');
        const Constants = (await import('expo-constants')).default;

        if (!Device.isDevice) {
          dbg.hook('usePushToken: skipped — not a physical device');
          return;
        }

        const settings = await Notifications.getPermissionsAsync();
        let status = settings.status;
        if (status !== 'granted') {
          const req = await Notifications.requestPermissionsAsync();
          status = req.status;
        }
        if (status !== 'granted') {
          dbg.hook('usePushToken: permission denied');
          return;
        }

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ??
          (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig
            ?.projectId;

        const tokenResp = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );

        if (cancelled || !tokenResp.data) return;

        dbg.hook('usePushToken: got token', {
          tokenPrefix: tokenResp.data.slice(0, 12),
        });

        const { error } = await supabase
          .from('parents')
          .update({ expo_push_token: tokenResp.data })
          .eq('id', user.id);

        if (error) dbg.dbError('usePushToken upsert', error);
      } catch (e) {
        dbg.hook('usePushToken: failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}
