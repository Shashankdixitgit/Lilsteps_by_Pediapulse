/**
 * Profile → Care Plan.
 *
 * ₹999 a month for 3 video consults each billing month (lib/carePlan.ts,
 * migration 0053). Shows where the plan stands — consults left this month,
 * when it renews or ends — with Subscribe or Cancel plan. Every state comes
 * from the server (checked with Razorpay when this screen opens); the app
 * never decides that a plan is paid.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { HeroBadge, HeroCard } from '@/components/ui/HeroCard';
import { AppColors, Radius, Size } from '@/constants/theme';
import { useCarePlan } from '@/hooks/useCarePlan';
import {
  cancelCarePlan,
  CARE_PLAN_CONSULTS,
  CARE_PLAN_PRICE_LABEL,
  type CarePlanView,
  planDateLabel,
  subscribeToCarePlan,
  viewOf,
} from '@/lib/carePlan';
import { confirmAsync } from '@/lib/confirm';
import { CONSULT_PRICE_LABEL } from '@/lib/consultPayment';
import { layout, typography } from '@/styles/global';

const INCLUDED = [
  `${CARE_PLAN_CONSULTS} video consults every billing month, for any child on your account`,
  `After those ${CARE_PLAN_CONSULTS}, consults are ${CONSULT_PRICE_LABEL} each, as usual`,
  'Unused consults don’t carry over to the next month',
  'Cancel any time. The plan stays active until the end of the month you paid for',
];

function hero(view: CarePlanView): { badge: string; title: string; body: string } {
  switch (view.kind) {
    case 'active':
      return {
        badge: 'Active',
        title: `${view.left} of ${view.total} consults left`,
        body: view.renewsOn
          ? `This month. Renews on ${planDateLabel(view.renewsOn)} for ${CARE_PLAN_PRICE_LABEL}.`
          : 'This month.',
      };
    case 'ending':
    case 'ended':
      return {
        badge: 'Cancelled',
        title: `${view.left} of ${view.total} consults left`,
        body: view.endsOn
          ? `Your plan won’t renew. You can use what’s left until ${planDateLabel(view.endsOn)}.`
          : 'Your plan won’t renew.',
      };
    case 'starting':
      return {
        badge: 'Starting',
        title: 'Finishing your subscription',
        body: 'We’re waiting for Razorpay to confirm the first payment. This usually takes a moment.',
      };
    case 'retrying':
      return {
        badge: 'Payment pending',
        title: 'This month’s payment didn’t go through',
        body: 'Razorpay will try again over the next few days. Consults you have already booked are not affected.',
      };
    case 'paused':
      return {
        badge: 'Paused',
        title: 'Your plan is paused',
        body: 'We couldn’t collect the monthly payment, so no new plan consults were added. Subscribe again to restart it.',
      };
    default:
      return {
        badge: `${CARE_PLAN_PRICE_LABEL} / month`,
        title: `${CARE_PLAN_CONSULTS} consults every month`,
        body: `The LilSteps Care Plan is ${CARE_PLAN_PRICE_LABEL} a month and renews monthly until you cancel.`,
      };
  }
}

export default function CarePlanScreen() {
  const insets = useSafeAreaInsets();
  const { plan, setPlan, loading, error: loadError, reload } = useCarePlan({ check: true });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const view = viewOf(plan);
  const h = hero(view);
  const canSubscribe = view.kind === 'none' || view.kind === 'paused' || view.kind === 'starting';
  const canCancel = view.kind === 'active' || view.kind === 'retrying';
  const hasCredits = (view.kind === 'active' || view.kind === 'ending' || view.kind === 'ended') && view.left > 0;

  async function subscribe() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await subscribeToCarePlan();
      if (r.state === 'redirecting') return; // web: the page is leaving for Razorpay
      setPlan(r.plan);
      const v = viewOf(r.plan);
      if (v.kind === 'active') setNotice('Your Care Plan is active. Thank you!');
      else if (v.kind === 'starting' || v.kind === 'none') {
        setNotice('Not finished yet. If you completed the payment, it can take a minute to show here.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const ends = view.kind === 'active' && view.renewsOn ? planDateLabel(view.renewsOn) : null;
    const ok = await confirmAsync(
      'Cancel your Care Plan?',
      ends
        ? `It won’t renew. You can keep using the consults left this month until ${ends}. Consults you have booked stay booked.`
        : 'It ends now and nothing more is charged. Consults you have booked stay booked.',
      { confirmLabel: 'Cancel plan', cancelLabel: 'Keep plan', destructive: true },
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await cancelCarePlan();
      setNotice(
        r.state === 'ends' && r.endsAt
          ? `Cancelled. Your plan won’t renew, and stays active until ${planDateLabel(r.endsAt)}.`
          : 'Your Care Plan is cancelled. Nothing more will be charged.',
      );
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Care Plan" backDisabled={busy} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loading && !plan ? (
          <View style={styles.loading}>
            <ActivityIndicator color={AppColors.primary} />
          </View>
        ) : (
          <HeroCard style={styles.hero}>
            <HeroBadge label={h.badge} />
            <Text style={typography.heading} accessibilityRole="header">
              {h.title}
            </Text>
            <Text style={[typography.body, styles.heroBody]}>{h.body}</Text>
            {hasCredits ? (
              <GradientButton
                label="Book a consult"
                onPress={() => router.push('/consult/booking')}
                style={styles.heroAction}
              />
            ) : null}
          </HeroCard>
        )}

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>What’s included</Text>
          <View style={styles.card}>
            {INCLUDED.map((line) => (
              <View key={line} style={styles.includedRow}>
                <Ionicons name="checkmark" size={Size.iconMeta} color={AppColors.secondary} style={styles.check} />
                <Text style={[typography.body, styles.flex]}>{line}</Text>
              </View>
            ))}
          </View>
          <Text style={[typography.caption, styles.caption]}>
            A plan consult cancelled 2 hours or more before it starts goes back to your plan. Less than 2 hours
            before, or if you don’t attend, it counts as used. If the doctor cancels, it goes back to your plan.
          </Text>
        </View>

        {loadError && !plan ? (
          <Text style={[typography.bodySM, styles.errorText]} accessibilityRole="alert">
            {loadError}
          </Text>
        ) : null}
        {notice ? (
          <Text style={[typography.bodySM, styles.noticeText]} accessibilityLiveRegion="polite" aria-live="polite">
            {notice}
          </Text>
        ) : null}
        {error ? (
          <Text style={[typography.bodySM, styles.errorText]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {canSubscribe ? (
            <GradientButton
              label={
                view.kind === 'starting'
                  ? 'Finish subscribing'
                  : view.kind === 'paused'
                    ? `Subscribe again · ${CARE_PLAN_PRICE_LABEL} a month`
                    : `Subscribe · ${CARE_PLAN_PRICE_LABEL} a month`
              }
              onPress={subscribe}
              loading={busy}
              disabled={busy || loading}
            />
          ) : null}
          {canSubscribe ? (
            <Text style={[typography.caption, styles.centerText]}>
              Paid securely through Razorpay with card or UPI AutoPay. Renews monthly until you cancel.
            </Text>
          ) : null}
          {canCancel ? (
            <GradientButton
              variant="ghost"
              label="Cancel plan"
              onPress={cancel}
              disabled={busy}
              loading={busy}
              style={styles.selfCenter}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },
  loading: { paddingVertical: 48, alignItems: 'center' },
  hero: { gap: 8 },
  heroBody: { color: AppColors.onSurfaceVariant },
  heroAction: { marginTop: 8 },
  sectionLabel: { ...typography.sectionLabel, color: AppColors.muted, marginLeft: 4 },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 12,
  },
  includedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  check: { marginTop: 3 },
  flex: { flex: 1 },
  caption: { paddingHorizontal: 4 },
  actions: { gap: 8 },
  centerText: { textAlign: 'center' },
  selfCenter: { alignSelf: 'center' },
  noticeText: { color: AppColors.onSurfaceVariant, textAlign: 'center' },
  errorText: { color: AppColors.danger, textAlign: 'center' },
});
