-- 0054: Care Plan sync without subscription webhooks.
--
-- The Razorpay webhook is not subscribed to subscription.* events, so the
-- Care Plan rows are kept right by a sweep instead (appointment-reminders,
-- every 15 minutes; _shared/carePlan.ts syncCarePlans): each run fetches up
-- to 50 subscriptions from Razorpay, the ones checked longest ago first, and
-- applies them through the same code path as the webhook / status check.
--
-- last_synced_at: when the sweep (or use_plan) last asked Razorpay about the
-- row. Stamped before the fetch, so a failing subscription goes to the back
-- of the queue instead of blocking the others, and two overlapping runs pick
-- different rows. Written by the edge functions (service role) only.

alter table public.care_plans
  add column if not exists last_synced_at timestamptz;

-- The sweep's queue: rows with a subscription, never-checked first.
create index if not exists care_plans_sync_queue_idx
  on public.care_plans (last_synced_at asc nulls first)
  where razorpay_subscription_id is not null;
