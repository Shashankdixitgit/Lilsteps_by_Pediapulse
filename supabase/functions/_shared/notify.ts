// Multi-channel dispatcher used by the `notify` Edge Function and by the
// cron-triggered reminder functions. Provider-specific calls live here so they
// can be unit-swapped (e.g. MSG91 instead of Twilio) without touching the
// dispatch logic.
//
// SMS / WhatsApp are OFF (no DLT registration yet): they only send when
// SMS_ENABLED=true. Email is the default channel for parents.

// deno-lint-ignore-file no-explicit-any

export type Channel = 'sms' | 'whatsapp' | 'email' | 'push';

export const CHANNELS: readonly Channel[] = ['sms', 'whatsapp', 'email', 'push'];

export function isChannel(v: unknown): v is Channel {
  return typeof v === 'string' && (CHANNELS as readonly string[]).includes(v);
}

/** SMS / WhatsApp sending is switched on (SMS_ENABLED=true). Off until DLT is done. */
export function smsEnabled(): boolean {
  return Deno.env.get('SMS_ENABLED') === 'true';
}

export interface Recipient {
  parent_id?: string;
  doctor_id?: string;
  child_id?: string;
  appointment_id?: string;
  phone?: string;
  email?: string;
  expo_push_token?: string;
}

export interface NotifyInput {
  channel: Channel;
  template: string; // see templates.ts
  params?: Record<string, string>;
  recipient: Recipient;
  /** Email wording for a parent (default) or a doctor. */
  audience?: 'parent' | 'doctor';
}

export interface DispatchResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  /** True when the channel's provider has no credentials yet (nothing was attempted). */
  notConfigured?: boolean;
}

// ── Twilio (SMS + WhatsApp) ──────────────────────────────────────────────────

async function sendTwilioMessage(
  to: string,
  body: string,
  channel: 'sms' | 'whatsapp',
): Promise<DispatchResult> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromSms = Deno.env.get('TWILIO_FROM_SMS');           // +1...
  const fromWa = Deno.env.get('TWILIO_FROM_WHATSAPP');       // whatsapp:+1...

  if (!accountSid || !authToken) {
    return { ok: false, error: 'Twilio not configured', notConfigured: true };
  }
  const from = channel === 'whatsapp' ? fromWa : fromSms;
  if (!from) {
    return { ok: false, error: `Twilio ${channel} sender not configured`, notConfigured: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const formattedTo = channel === 'whatsapp' ? `whatsapp:${to}` : to;

  const params = new URLSearchParams({
    From: from,
    To: formattedTo,
    Body: body,
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    return { ok: false, error: `Twilio ${res.status}: ${errText}` };
  }

  const data = await res.json();
  return { ok: true, providerId: data?.sid };
}

// ── Email (SMTP, see email.ts) ───────────────────────────────────────────────

async function sendTemplateEmail(
  to: string,
  template: string,
  params: Record<string, string>,
  audience: 'parent' | 'doctor',
): Promise<DispatchResult> {
  const msg = renderEmail(template, params, audience);
  return sendEmail({ to, subject: msg.subject, text: msg.text, html: msg.html });
}

// ── Expo push ─────────────────────────────────────────────────────────────────

async function sendExpoPush(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<DispatchResult> {
  // Expo's push API is free and doesn't require a key. FCM/APNs creds, if you
  // ever bare-build, are configured in EAS, not here.
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: token, title, body, data, sound: 'default' }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    return { ok: false, error: `Expo ${res.status}: ${errText}` };
  }
  const json = await res.json();
  if (json?.data?.status === 'error') {
    return { ok: false, error: json.data.message ?? 'Expo rejected' };
  }
  return { ok: true, providerId: json?.data?.id };
}

// ── Template rendering ────────────────────────────────────────────────────────

import { renderEmail, renderTemplate } from './templates.ts';
import { sendEmail } from './email.ts';

export async function dispatch(input: NotifyInput): Promise<DispatchResult> {
  const rendered = renderTemplate(input.template, input.params ?? {});

  switch (input.channel) {
    case 'sms':
      if (!smsEnabled()) return { ok: false, error: 'SMS is switched off', notConfigured: true };
      if (!input.recipient.phone) return { ok: false, error: 'Missing phone' };
      return sendTwilioMessage(input.recipient.phone, rendered.body, 'sms');

    case 'whatsapp':
      if (!smsEnabled()) return { ok: false, error: 'WhatsApp is switched off', notConfigured: true };
      if (!input.recipient.phone) return { ok: false, error: 'Missing phone' };
      return sendTwilioMessage(input.recipient.phone, rendered.body, 'whatsapp');

    case 'email':
      if (!input.recipient.email) return { ok: false, error: 'Missing email' };
      return sendTemplateEmail(input.recipient.email, input.template, input.params ?? {}, input.audience ?? 'parent');

    case 'push':
      if (!input.recipient.expo_push_token) {
        return { ok: false, error: 'Missing push token' };
      }
      return sendExpoPush(
        input.recipient.expo_push_token,
        rendered.subject ?? 'LilSteps',
        rendered.body,
        rendered.data,
      );

    default:
      return { ok: false, error: 'Unknown channel' };
  }
}
