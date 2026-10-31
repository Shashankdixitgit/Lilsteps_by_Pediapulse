/**
 * Where Razorpay's payment page sends the browser back (lib/consultPayment
 * RETURN_PATH). Normally the in-app browser closes on this URL before the
 * app ever routes here; this screen covers the other cases:
 *  - web: the payment opens in a popup, which must hand the URL back to the
 *    opener and close (maybeCompleteAuthSession).
 *  - Android may also deliver the deep link to the router.
 * Either way the booking screen underneath does the status check, so this
 * just steps back to it.
 */
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';
import { typography } from '@/styles/global';

WebBrowser.maybeCompleteAuthSession();

export default function PaymentReturnScreen() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, []);

  return (
    <View style={styles.screen}>
      <ActivityIndicator color={AppColors.primary} />
      <Text style={typography.meta}>Checking your payment…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: AppColors.surface,
  },
});
