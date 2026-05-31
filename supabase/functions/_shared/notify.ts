// Multi-channel dispatcher used by the `notify` Edge Function and by the
// cron-triggered reminder functions. Provider-specific calls live here so they
// can be unit-swapped (e.g. MSG91 instead of Twilio) without touching the
// dispatch logic.

// deno-lint-ignore-file no-explicit-any

export type Channel = 'sms' | 'whatsapp' | 'email' | 'push';

export interface Recipient {
  parent_id?: string;
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
}

export interface DispatchResult {
  ok: boolean;
  providerId?: string;
  error?: string;
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
    return { ok: false, error: 'Twilio not configured' };
  }
  const from = channel === 'whatsapp' ? fromWa : fromSms;
  if (!from) {
    return { ok: false, error: `Twilio ${channel} sender not configured` };
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

// ── Email (Supabase SMTP — generic SMTP fetch via Resend-style API not used).
// For now we use Supabase Auth's built-in email by triggering an auth.users
// invite; for arbitrary transactional email, send via a small SMTP relay.
// Wire your provider here when ready.

async function sendEmail(to: string, subject: string, body: string): Promise<DispatchResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM') ?? 'noreply@pediapulse.in';

  if (!apiKey) {
    // No provider configured yet — short-circuit so the dispatcher records a
    // 'skipped' entry instead of failing the whole batch.
    return { ok: false, error: 'Email provider not configured' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, text: body }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => 'unknown');
    return { ok: false, error: `Email provider ${res.status}: ${errText}` };
  }
  const data = await res.json();
  return { ok: true, providerId: data?.id };
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

import { renderTemplate } from './templates.ts';

export async function dispatch(input: NotifyInput): Promise<DispatchResult> {
  const rendered = renderTemplate(input.template, input.params ?? {});

  switch (input.channel) {
    case 'sms':
      if (!input.recipient.phone) return { ok: false, error: 'Missing phone' };
      return sendTwilioMessage(input.recipient.phone, rendered.body, 'sms');

    case 'whatsapp':
      if (!input.recipient.phone) return { ok: false, error: 'Missing phone' };
      return sendTwilioMessage(input.recipient.phone, rendered.body, 'whatsapp');

    case 'email':
      if (!input.recipient.email) return { ok: false, error: 'Missing email' };
      return sendEmail(input.recipient.email, rendered.subject ?? 'Pedia Pulse', rendered.body);

    case 'push':
      if (!input.recipient.expo_push_token) {
        return { ok: false, error: 'Missing push token' };
      }
      return sendExpoPush(
        input.recipient.expo_push_token,
        rendered.subject ?? 'Pedia Pulse',
        rendered.body,
        rendered.data,
      );

    default:
      return { ok: false, error: 'Unknown channel' };
  }
}
