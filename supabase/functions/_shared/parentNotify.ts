// Notify a parent on every channel they can be reached on, with one
// notification_log row per channel. Used by the server-side senders
// (consult confirmed / cancelled, reminders, vaccine reminders, notify).
//
// Channels: email (their sign-in address from Supabase Auth, which they
// proved they own), push (if they have a token), SMS only when SMS_ENABLED.
// Test logins (@lilsteps.dev, @demo.lilsteps.dev) and domains that can't
// receive mail are never emailed.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { type Channel, dispatch, smsEnabled } from './notify.ts';

/** A 'queued' row with no result after this long is treated as failed (the sender died). */
export const STALE_QUEUED_MS = 10 * 60_000;
/** Give up on a one-off message (e.g. a reminder) after this many tries. */
export const MAX_ATTEMPTS = 3;

/** Our own test domains: no real inboxes. */
export function isTestAddress(email: string): boolean {
  const e = email.toLowerCase();
  return e.endsWith('@lilsteps.dev') || e.endsWith('.lilsteps.dev');
}

type DnsResolver = (domain: string) => Promise<boolean>;

const mailDomainCache = new Map<string, boolean>();

/**
 * True unless DNS says the domain doesn't exist / has no MX or A record.
 * A DNS lookup that can't run at all (API missing, timeout) counts as
 * deliverable: better to try than to drop a booking email.
 */
export const defaultMailDomainCheck: DnsResolver = async (domain) => {
  const resolve = (Deno as any).resolveDns as undefined | ((d: string, t: string) => Promise<unknown[]>);
  if (!resolve) return true;
  const lookup = async (type: 'MX' | 'A') => {
    try {
      return (await resolve(domain, type)).length > 0;
    } catch (e) {
      return /not ?found|nxdomain|no (data|record)/i.test(`${(e as Error).name} ${(e as Error).message}`) ? false : null;
    }
  };
  const mx = await lookup('MX');
  if (mx) return true;
  const a = await lookup('A');
  if (a) return true;
  // Both lookups answered "no such record": the domain can't take mail.
  return !(mx === false && a === false);
};

export async function canReceiveEmail(email: string, check: DnsResolver = defaultMailDomainCheck): Promise<boolean> {
  if (isTestAddress(email)) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  const cached = mailDomainCache.get(domain);
  if (cached !== undefined) return cached;
  const ok = await check(domain);
  mailDomainCache.set(domain, ok);
  return ok;
}

export interface ParentContact {
  email?: string;
  phone?: string;
  expo_push_token?: string;
  name?: string;
}

export async function parentContact(admin: SupabaseClient, parentId: string): Promise<ParentContact> {
  const [{ data: parent }, { data: auth }] = await Promise.all([
    admin.from('parents').select('name, phone, expo_push_token').eq('id', parentId).maybeSingle(),
    admin.auth.admin.getUserById(parentId),
  ]);
  const email = auth?.user?.email?.toLowerCase();
  return {
    email: email && (await canReceiveEmail(email)) ? email : undefined,
    phone: (parent as any)?.phone ?? auth?.user?.phone ?? undefined,
    expo_push_token: (parent as any)?.expo_push_token ?? undefined,
    name: (parent as any)?.name ?? undefined,
  };
}

export interface NotifyParentInput {
  parentId: string;
  template: string;
  params: Record<string, string>;
  childId?: string | null;
  appointmentId?: string | null;
  /** Extra payload saved in notification_log (e.g. vaccinationId for idempotency). */
  payload?: Record<string, unknown>;
  sentBy?: string | null;
  /** Restrict to these channels (default: every available one). */
  channels?: Channel[];
}

export interface NotifyParentResult {
  channel: Channel;
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/** Plain first name for the greeting ("Hi Priya,"). */
export function firstName(name: string | undefined): string | undefined {
  const n = (name ?? '').trim().split(/\s+/)[0];
  return n ? n.slice(0, 40) : undefined;
}

/**
 * Mark 'queued' rows that never got a result (the sender died) as failed, so
 * the one-per-appointment index lets the message be tried again.
 */
async function expireStaleQueued(admin: SupabaseClient, appointmentId: string, template: string): Promise<void> {
  await admin
    .from('notification_log')
    .update({ status: 'failed', error: 'no result within 10 minutes' })
    .eq('appointment_id', appointmentId)
    .eq('template', template)
    .eq('status', 'queued')
    .lt('created_at', new Date(Date.now() - STALE_QUEUED_MS).toISOString());
}

export async function notifyParent(admin: SupabaseClient, input: NotifyParentInput): Promise<NotifyParentResult[]> {
  const contact = await parentContact(admin, input.parentId);
  const params = { ...input.params };
  if (!params.parent) {
    const fn = firstName(contact.name);
    if (fn) params.parent = fn;
  }
  if (input.appointmentId) await expireStaleQueued(admin, input.appointmentId, input.template);

  const wanted = input.channels ?? ['email', 'push', 'sms'];
  const plan: Array<{ channel: Channel; address: string }> = [];
  if (wanted.includes('email') && contact.email) plan.push({ channel: 'email', address: contact.email });
  if (wanted.includes('push') && contact.expo_push_token) plan.push({ channel: 'push', address: contact.expo_push_token });
  if (wanted.includes('sms') && smsEnabled() && contact.phone) plan.push({ channel: 'sms', address: contact.phone });

  const results: NotifyParentResult[] = [];
  for (const { channel, address } of plan) {
    const { data: queued, error: queueErr } = await admin
      .from('notification_log')
      .insert({
        channel,
        template: input.template,
        recipient: address,
        parent_id: input.parentId,
        child_id: input.childId ?? null,
        appointment_id: input.appointmentId ?? null,
        sent_by: input.sentBy ?? null,
        status: 'queued',
        payload: { template: input.template, params, ...(input.payload ?? {}) },
      })
      .select('id')
      .single();
    // 23505: this one-off message is already queued or sent for this
    // appointment on this channel (0046 unique index) — another caller won.
    if (queueErr?.code === '23505') {
      results.push({ channel, ok: true, skipped: true });
      continue;
    }

    const r = await dispatch({
      channel,
      template: input.template,
      params,
      recipient: {
        email: channel === 'email' ? address : undefined,
        expo_push_token: channel === 'push' ? address : undefined,
        phone: channel === 'sms' ? address : undefined,
      },
    });

    const status = r.ok ? 'sent' : r.notConfigured ? 'skipped' : 'failed';
    if (queued?.id) {
      await admin
        .from('notification_log')
        .update({
          status,
          provider_id: r.providerId ?? null,
          error: r.error ?? null,
          sent_at: r.ok ? new Date().toISOString() : null,
        })
        .eq('id', queued.id);
    }
    if (!r.ok && !r.notConfigured) console.error(`[notify] ${input.template} ${channel} failed: ${r.error}`);
    results.push({ channel, ok: r.ok, skipped: r.notConfigured, error: r.error });
  }
  return results;
}

/**
 * Whether a one-off message for this appointment should not be (re)sent:
 * already sent, being sent right now (queued < 10 min ago), or tried
 * MAX_ATTEMPTS times already (failed / skipped runs stop retrying).
 */
export async function alreadyNotified(
  admin: SupabaseClient,
  appointmentId: string,
  template: string,
): Promise<boolean> {
  const freshQueued = new Date(Date.now() - STALE_QUEUED_MS).toISOString();
  const [{ count: done }, { count: attempts }] = await Promise.all([
    admin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId)
      .eq('template', template)
      .or(`status.eq.sent,and(status.eq.queued,created_at.gte.${freshQueued})`),
    admin
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId)
      .eq('template', template),
  ]);
  return (done ?? 0) > 0 || (attempts ?? 0) >= MAX_ATTEMPTS;
}

/**
 * Keep work going after the response is sent (Supabase Edge Runtime), so a
 * slow email never delays a payment / cancel answer. Falls back to running
 * it un-awaited where waitUntil doesn't exist (tests, local).
 */
export function inBackground(label: string, work: Promise<unknown>): void {
  const guarded = work.catch((e) => console.error(`[${label}] ${(e as Error).message}`));
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(guarded);
}
