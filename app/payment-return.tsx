/**
 * Where Razorpay's payment page sends the browser back (lib/consultPayment
 * RETURN_PATH).
 *
 * - Native: the in-app browser normally closes on this URL before the app
 *   routes here, and the booking screen underneath does the status check.
 *   If the router does land here (Android can deliver the deep link too),
 *   step back to that screen.
 * - Web: the whole page went to Razorpay (a popup would be blocked), so this
 *   page finishes the job: it asks the server about the booking saved before
 *   leaving (readPendingWebPayment), passing Razorpay's signed return query,
 *   and says what happened. The web origin must be in PAYMENT_RETURN_ORIGINS.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { AppColors } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import {
  checkConsultPayment,
  clearPendingWebPayment,
  type PaymentStatus,
  readPendingWebPayment,
  REFUND_FAILED_TEXT,
} from '@/lib/consultPayment';
import { typography } from '@/styles/global';

WebBrowser.maybeCompleteAuthSession();

type Shown = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string; tone: 'success' | 'calm' };

function describe(status: PaymentStatus, label?: string): Shown {
  if (status.state === 'paid') {
    return {
      icon: 'checkmark',
      tone: 'success',
      title: "You're booked",
      body: label ? `Your consult with ${label} is confirmed.` : 'Your consult is confirmed.',
    };
  }
  if (status.state === 'pending') {
    return {
      icon: 'time-outline',
      tone: 'calm',
      title: 'Payment not finished',
      body: 'Your slot is still held for a few minutes. To finish paying, find it under "Waiting for payment" on Home or in the Consult tab.',
    };
  }
  const lead =
    status.state === 'cancelled' ? 'This booking was cancelled.' : 'The time to pay ran out and the slot was released.';
  return {
    icon: 'close-circle-outline',
    tone: 'calm',
    title: status.state === 'cancelled' ? 'Booking cancelled' : 'Slot released',
    body: status.refundFailed
      ? `${lead} ${REFUND_FAILED_TEXT}`
      : status.refunded
        ? `${lead} The amount taken is being refunded to you.`
        : `${lead} Please pick another time.`,
  };
}

export default function PaymentReturnScreen() {
  const insets = useSafeAreaInsets();
  const { session, loading } = useAuth();
  const [shown, setShown] = useState<Shown | null>(null);
  const [failed, setFailed] = useState(false);

  // Native: back to the booking screen, which checks the payment itself.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  // Web: check the booking we left the page for.
  useEffect(() => {
    if (Platform.OS !== 'web' || loading) return;
    const pending = readPendingWebPayment();
    if (!pending || !session) {
      router.replace('/(tabs)');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const returned = globalThis.location?.href ?? null;
        let status = await checkConsultPayment(pending.appointmentId, returned);
        // The webhook can land a moment after the redirect.
        for (let i = 0; i < 3 && status.state === 'pending'; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          status = await checkConsultPayment(pending.appointmentId, returned);
        }
        if (cancelled) return;
        if (status.state !== 'pending') clearPendingWebPayment();
        setShown(describe(status, pending.label));
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session]);

  if (Platform.OS === 'web' && (shown || failed)) {
    const s: Shown = shown ?? {
      icon: 'cloud-offline-outline',
      tone: 'calm',
      title: "Couldn't check your payment",
      body: 'Please check your connection. If you paid, your booking appears in Upcoming consultations shortly.',
    };
    return (
      <View style={[styles.screen, styles.result, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.body}>
          <View style={[styles.icon, s.tone === 'success' ? styles.iconSuccess : styles.iconCalm]}>
            <Ionicons
              name={s.icon}
              size={28}
              color={s.tone === 'success' ? AppColors.success : AppColors.primary}
            />
          </View>
          <Text style={[typography.heading, styles.center]}>{s.title}</Text>
          <Text style={[typography.body, styles.center]}>{s.body}</Text>
        </View>
        <GradientButton label="Go to home" onPress={() => router.replace('/(tabs)')} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, styles.loading]}>
      <ActivityIndicator color={AppColors.primary} />
      <Text style={typography.meta}>Checking your payment…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  loading: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  result: { paddingHorizontal: 20, justifyContent: 'space-between' },
  body: { alignItems: 'center', gap: 12, paddingTop: 48 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconSuccess: { backgroundColor: AppColors.successSurface },
  iconCalm: { backgroundColor: AppColors.mintSurface },
  center: { textAlign: 'center' },
});
