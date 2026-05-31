// Edge Function: notify
//
// Multi-channel notification dispatcher. Called from the parent app, doctor
// dashboard, or cron-triggered reminder functions.
//
// Request body:
//   {
//     channel: 'sms' | 'whatsapp' | 'email' | 'push',
//     template: string,
//     params?: Record<string, string>,
//     recipient: { parent_id?, child_id?, appointment_id?, phone?, email?, expo_push_token? }
//   }
//
// If recipient.parent_id is set but phone/email/expo_push_token isn't, the
// function looks the parent up and uses whatever is on record for the channel.
//
// Deploy: `supabase functions deploy notify --project-ref opdosbudlzwywdmrxlqr`
// Secrets needed:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_SMS, TWILIO_FROM_WHATSAPP
//   RESEND_API_KEY (or any SMTP-relay key — adapt _shared/notify.ts)
//   EMAIL_FROM
//
// Auth: requires a Supabase JWT (any logged-in user). Reminder cron functions
// invoke this with the service role key directly via the shared dispatch
// helper, NOT via HTTP, so they bypass JWT auth.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { dispatch, type Channel, type NotifyInput } from '../_shared/notify.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization' }, 401);
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Verify caller JWT.
  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  let body: NotifyInput;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  if (!body?.channel || !body?.template || !body?.recipient) {
    return jsonResponse({ error: 'Missing channel/template/recipient' }, 400);
  }

  // Hydrate recipient from parent_id if needed.
  if (body.recipient.parent_id) {
    const { data: parent } = await adminClient
      .from('parents')
      .select('phone, email, expo_push_token')
      .eq('id', body.recipient.parent_id)
      .maybeSingle();
    if (parent) {
      body.recipient.phone ??= parent.phone ?? undefined;
      body.recipient.email ??= parent.email ?? undefined;
      body.recipient.expo_push_token ??=
        parent.expo_push_token ?? undefined;
    }
  }

  // Queue row
  const { data: queued, error: qErr } = await adminClient
    .from('notification_log')
    .insert({
      channel: body.channel as Channel,
      template: body.template,
      recipient:
        body.recipient.phone ??
        body.recipient.email ??
        body.recipient.expo_push_token ??
        'unknown',
      parent_id: body.recipient.parent_id ?? null,
      child_id: body.recipient.child_id ?? null,
      appointment_id: body.recipient.appointment_id ?? null,
      status: 'queued',
      payload: { template: body.template, params: body.params },
    })
    .select('id')
    .single();

  if (qErr || !queued) {
    return jsonResponse({ error: qErr?.message ?? 'log insert failed' }, 500);
  }

  const result = await dispatch(body);

  await adminClient
    .from('notification_log')
    .update({
      status: result.ok ? 'sent' : 'failed',
      provider_id: result.providerId ?? null,
      error: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
    })
    .eq('id', queued.id);

  if (!result.ok) {
    return jsonResponse({ ok: false, error: result.error }, 502);
  }
  return jsonResponse({ ok: true, id: queued.id, providerId: result.providerId });
});
