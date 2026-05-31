/**
 * Observability stubs — Sentry (crash reporting) + PostHog (analytics).
 *
 * Both vendors are deferred (D6/D7) but call sites are wired here so the swap
 * is a one-file change at launch time:
 *   • Install `sentry-expo` and replace `crash.*` impls.
 *   • Install `posthog-react-native` and replace `track*` impls.
 *
 * Keep events PHI-free — never log child names, DOBs, phone numbers, or
 * symptom text. Use opaque IDs only (per Proposal §6 DPDP alignment).
 */

import { dbg } from '@/lib/debug';

// ── Sentry stub ───────────────────────────────────────────────────────────────

export const crash = {
  init() {
    dbg.app('crash.init (Sentry stub — not wired)');
  },
  setUser(userId: string | null) {
    dbg.app('crash.setUser', { userId });
  },
  captureException(err: unknown, context?: Record<string, unknown>) {
    dbg.app('crash.captureException (stub)', { err, context });
  },
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    dbg.app('crash.captureMessage (stub)', { message, level });
  },
};

// ── PostHog stub ──────────────────────────────────────────────────────────────

export const analytics = {
  init() {
    dbg.app('analytics.init (PostHog stub — not wired)');
  },
  identify(userId: string, traits?: Record<string, unknown>) {
    dbg.app('analytics.identify', { userId, traits });
  },
  track(event: AnalyticsEvent, props?: Record<string, unknown>) {
    dbg.app('analytics.track (stub)', { event, props });
  },
  reset() {
    dbg.app('analytics.reset (stub)');
  },
};

// Funnel events to track once PostHog is wired (per TODO.txt §14):
// app open → check-in start → summary → booking → confirmation
export type AnalyticsEvent =
  | 'app_opened'
  | 'auth_otp_sent'
  | 'auth_otp_verified'
  | 'onboarding_completed'
  | 'checkin_started'
  | 'checkin_message_sent'
  | 'checkin_summary_generated'
  | 'appointment_booked'
  | 'appointment_cancelled'
  | 'health_note_logged'
  | 'growth_measurement_logged'
  | 'vaccination_marked_done'
  | 'document_uploaded';
