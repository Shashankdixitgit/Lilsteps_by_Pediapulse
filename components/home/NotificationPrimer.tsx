import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { registerPushToken } from '@/hooks/usePushToken';

const DISMISSED_KEY = 'lilsteps.pushPrimerDismissed';

/**
 * Explains reminders before the system asks (mobile review should-fix 2):
 * the permission prompt used to appear on first launch with no context.
 * Shown on Home only while the phone has never been asked; "Turn on" shows
 * the system prompt, "Not now" hides the card (Profile can still turn
 * notifications on).
 */
export function NotificationPrimer() {
  const { user } = useAuth();
  const { status, refresh } = useNotificationPermission();
  const [dismissed, setDismissed] = useState<boolean | null>(Platform.OS === 'web' ? true : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    SecureStore.getItemAsync(DISMISSED_KEY)
      .then((v) => setDismissed(v === '1'))
      .catch(() => setDismissed(false));
  }, []);

  if (dismissed !== false || status !== 'undetermined' || !user) return null;

  async function turnOn() {
    if (!user) return;
    setBusy(true);
    await registerPushToken(user.id, { ask: true });
    await refresh();
    setBusy(false);
  }

  function notNow() {
    setDismissed(true);
    SecureStore.setItemAsync(DISMISSED_KEY, '1').catch(() => undefined);
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.well}>
          <Ionicons name="notifications-outline" size={Size.iconRow} color={AppColors.primary} />
        </View>
        <View style={styles.text}>
          <Text style={styles.title}>Get reminders</Text>
          <Text style={styles.sub}>
            We remind you before a consult, when a vaccine is due and when the doctor replies. Nothing else.
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <TextButton label="Not now" onPress={notNow} />
        <GradientButton label="Turn on" size="sm" onPress={turnOn} loading={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
  },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  well: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  sub: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
