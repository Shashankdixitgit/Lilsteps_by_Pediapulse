-- 0052: refund-failure alerts (item 13) and vaccine reminders (item 10).
--
-- 1. One refund alert per payment. The team is emailed (refundAlerts.ts)
--    from three places that can race: refundPaymentRow, the razorpay-webhook
--    refund.failed handler and the 15-minute sweep in appointment-reminders.
--    Each first inserts a 'queued' notification_log row with
--    template = 'refund_alert' and payload.payment_id; this index lets only
--    one such row be queued or sent per payment. A failed send leaves its row
--    'failed' and the sweep tries again (up to 3 times). The rows carry no
--    parent / child id, so they survive account deletion on purpose (the
--    payment row does too, with parent_id set null).
-- 2. vaccine-reminders reads the doses in a 37-day window that are not given
--    and not "Not sure" every morning: a partial index on scheduled_date.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ──────────────────────────────────────────────────────────────────────
create unique index if not exists notification_log_one_refund_alert_uidx
  on public.notification_log ((payload->>'payment_id'))
  where template = 'refund_alert' and status in ('queued', 'sent');

-- ── 2. ──────────────────────────────────────────────────────────────────────
create index if not exists vaccinations_open_scheduled_date_idx
  on public.vaccinations (scheduled_date)
  where status not in ('done', 'unknown');
