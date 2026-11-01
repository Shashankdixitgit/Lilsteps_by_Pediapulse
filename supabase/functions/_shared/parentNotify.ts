// Notify a parent on every channel they can be reached on, with one
// notification_log row per channel. Used by the server-side senders
// (consult confirmed / cancelled, reminders, vaccine reminders, notify).
//
// Channels: email (their sign-in address from Supabase Auth, which they
// proved they own), push (if they have a token), SMS only when SMS_ENABLED.
// Test accounts (@demo.lilsteps.dev) are never emailed: they can't receive mail.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { type Channel, dispatch, smsEnabled } from './notify.ts';

export const NO_EMAIL_DOMAINS = ['@demo.lilsteps.dev'];

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
    email: email && !NO_EMAIL_DOMAINS.some((d) => email.endsWith(d)) ? email : undefined,
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
function firstName(name: string | undefined): string | undefined {
  const n = (name ?? '').trim().split(/\s+/)[0];
  return n ? n.slice(0, 40) : undefined;
}

export async function notifyParent(admin: SupabaseClient, input: NotifyParentInput): Promise<NotifyParentResult[]> {
  const contact = await parentContact(admin, input.parentId);
  const params = { ...input.params };
  if (!params.parent) {
    const fn = firstName(contact.name);
    if (fn) params.parent = fn;
  }

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
 * True when this one-off message (e.g. the booking confirmation) was already
 * sent or is being sent for this appointment, on any channel.
 */
export async function alreadyNotified(
  admin: SupabaseClient,
  appointmentId: string,
  template: string,
): Promise<boolean> {
  const { count } = await admin
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', appointmentId)
    .eq('template', template)
    .in('status', ['sent', 'queued']);
  return (count ?? 0) > 0;
}
