import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/auth';
import { dbg } from '@/lib/debug';
import { PUSH_CHANNEL_ID, pushTarget } from '@/lib/pushRoutes';
import { supabase } from '@/lib/supabase';

/**
 * Push notifications (mobile review should-fix 2):
 *  - the system permission prompt is never shown on first launch: Home
 *    explains reminders first (NotificationPrimer) and asks only on a tap;
 *    this hook registers the token only once permission is granted;
 *  - a notification is shown while the app is open, and tapping one opens
 *    what it is about (pushTarget: data.url from the server);
 *  - Android: reminders use a high-importance channel so they pop up.
 *
 * `expo-notifications` runs DOM/localStorage side effects at module load
 * which crash under Expo's web SSR, so it is imported dynamically and only
 * on iOS/Android.
 */
export async function registerPushToken(userId: string, opts: { ask?: boolean } = {}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const Device = await import('expo-device');
    const Notifications = await import('expo-notifications');
    const Constants = (await import('expo-constants')).default;
    if (!Device.isDevice) {
      dbg.hook('usePushToken: skipped — not a physical device');
      return false;
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && opts.ask) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') {
      dbg.hook('usePushToken: no permission yet', { status });
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
      // A channel's importance can't be raised once created, so reminders
      // get their own high-importance channel (heads-up on Android).
      await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
        name: 'Consult and vaccine reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    const tokenResp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    if (!tokenResp.data) return false;
    dbg.hook('usePushToken: got token', { tokenPrefix: tokenResp.data.slice(0, 12) });

    const { error } = await supabase.from('parents').update({ expo_push_token: tokenResp.data }).eq('id', userId);
    if (error) dbg.dbError('usePushToken upsert', error);
    return true;
  } catch (e) {
    dbg.hook('usePushToken: failed', e);
    return false;
  }
}

export function usePushTokenRegistration() {
  const { user } = useAuth();

  // Register only when permission is already granted (never prompts here).
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    void registerPushToken(user.id);
  }, [user]);

  // Show notifications in the foreground, and open what a tapped one is about.
  useEffect(() => {
    if (!user || Platform.OS === 'web') return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        const open = (data: unknown) => {
          const target = pushTarget(data);
          if (target) router.push(target as Href);
        };
        // Cold start from a tap.
        const last = Notifications.getLastNotificationResponse();
        if (last && !cancelled) {
          open(last.notification.request.content.data);
          Notifications.clearLastNotificationResponse();
        }
        if (cancelled) return;
        sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
      } catch (e) {
        dbg.hook('usePushToken: listeners failed', e);
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [user]);
}
