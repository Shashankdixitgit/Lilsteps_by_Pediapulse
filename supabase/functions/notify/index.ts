// Edge Function: notify
//
// Multi-channel notification dispatcher. Called from the parent app and the
// doctor dashboard after key events (booking, prescription, new message).
//
// Request body:
//   {
//     channel: 'sms' | 'whatsapp' | 'email' | 'push'   ('sms'/'whatsapp' are sent as
//              'email' while SMS_ENABLED is off — older dashboards/apps still ask for 'sms'),
//     template: TemplateKey (see ../_shared/templates.ts),
//     params?: Record<string, string>,
//     recipient: { parent_id? | doctor_id?, child_id?, appointment_id? }
//   }
//
// Who may notify whom:
//   • anyone → themselves (recipient.parent_id = caller)
//   • a doctor → a parent they have an appointment or conversation with
//   • a parent → the doctor of one of their appointments (email only — doctors
//     have no phone / push token on record)
// Contact details (phone / email / push token) are ALWAYS looked up server-side
// from the recipient's record; any phone/email/token in the request is ignored,
// so the function can't be used to message arbitrary numbers.
//
// Rate limit: RATE_LIMIT_PER_HOUR rows in notification_log per caller (sent_by).
//
// Providers: if a channel's provider has no secrets yet (SMTP / Twilio), the
// row is logged as 'skipped' and the function returns 200 { ok: false,
// skipped: true } — callers are fire-and-forget and must not break on it.
//
// Deploy: MCP deploy_edge_function (include ../_shared/*.ts), verify_jwt on.
// Secrets needed:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_SMS, TWILIO_FROM_WHATSAPP
//   SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, EMAIL_FROM (see _shared/email.ts)
//   SMS_ENABLED=true only once SMS (DLT) is live
//
// Cron reminder functions call the shared dispatch helper directly, not this
// HTTP endpoint.

// deno-lint-ignore-file no-explicit-any
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { type Channel, dispatch, isChannel, type Recipient, smsEnabled } from '../_shared/notify.ts';
import { canReceiveEmail, firstName, parentContact } from '../_shared/parentNotify.ts';
import { DOCTOR_EMAIL_TEMPLATES, isTemplateKey, SERVER_ONLY_TEMPLATES } from '../_shared/templates.ts';
import { createAdminClient, callerFailureResponse, resolveCaller } from '../_shared/supabase.ts';

const RATE_LIMIT_PER_HOUR = 20;
const MAX_PARAMS = 8;
const MAX_PARAM_LENGTH = 80;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function optionalUuid(v: unknown): string | undefined | null {
  if (v === undefined || v === null || v === '') return undefined;
  return typeof v === 'string' && UUID_RE.test(v) ? v : null; // null = invalid
}

function cleanParams(raw: unknown): Record<string, string> | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_PARAMS) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!/^\w{1,32}$/.test(k)) return null;
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    // Single line, capped — these land in SMS bodies.
    out[k] = String(v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_PARAM_LENGTH);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient();
  // Bad / expired token: 401 session_ended. Auth service down: 503 (try again).
  const resolved = await resolveCaller(req, admin);
  if ('failure' in resolved) return callerFailureResponse(resolved.failure);
  const caller = resolved.user;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  // ── Validate shape ─────────────────────────────────────────────────────────
  if (!isChannel(body?.channel)) return jsonResponse({ error: 'Invalid channel' }, 400);
  // SMS is off until DLT is done: those messages go by email instead.
  const channel: Channel =
    (body.channel === 'sms' || body.channel === 'whatsapp') && !smsEnabled() ? 'email' : body.channel;
  if (!isTemplateKey(body?.template)) return jsonResponse({ error: 'Invalid template' }, 400);
  // Payment-link messages are only ever sent by the server itself.
  if (SERVER_ONLY_TEMPLATES.includes(body.template)) return jsonResponse({ error: 'Invalid template' }, 400);
  const params = cleanParams(body?.params);
  if (!params) return jsonResponse({ error: 'Invalid params' }, 400);

  const r = body?.recipient ?? {};
  const ids = [r.parent_id, r.doctor_id, r.child_id, r.appointment_id].map(optionalUuid);
  if (ids.includes(null)) return jsonResponse({ error: 'Invalid recipient' }, 400);
  const [parentId, doctorId, childId, appointmentId] = ids as (string | undefined)[];
  if (!!parentId === !!doctorId) {
    return jsonResponse({ error: 'Recipient needs exactly one of parent_id or doctor_id' }, 400);
  }

  // ── Who is calling? ────────────────────────────────────────────────────────
  const { data: doctorAuth } = await admin
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', caller.id)
    .maybeSingle<{ doctor_id: string }>();
  const callerDoctorId = doctorAuth?.doctor_id ?? null;

  // ── Authorise the recipient ────────────────────────────────────────────────
  // The (parent, doctor) pair this message is about; appointment/child must belong to it.
  let pairParentId: string;
  let pairDoctorId: string | null = null;

  if (parentId) {
    pairParentId = parentId;
    if (parentId !== caller.id) {
      if (!callerDoctorId) return jsonResponse({ error: 'Forbidden' }, 403);
      pairDoctorId = callerDoctorId;
      const [{ count: apptCount }, { count: convoCount }] = await Promise.all([
        admin
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .eq('parent_id', parentId)
          .eq('doctor_id', callerDoctorId),
        admin
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('parent_id', parentId)
          .eq('doctor_id', callerDoctorId),
      ]);
      if ((apptCount ?? 0) + (convoCount ?? 0) === 0) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
    }
  } else {
    // Parent → their appointment's doctor.
    pairParentId = caller.id;
    pairDoctorId = doctorId!;
    const { count } = await admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', caller.id)
      .eq('doctor_id', doctorId!);
    if ((count ?? 0) === 0) return jsonResponse({ error: 'Forbidden' }, 403);
    if (channel !== 'email') {
      return jsonResponse({ error: 'Doctors can only be notified by email' }, 400);
    }
    if (!(DOCTOR_EMAIL_TEMPLATES as readonly string[]).includes(body.template)) {
      return jsonResponse({ error: 'This message cannot be sent to a doctor' }, 400);
    }
  }

  if (appointmentId) {
    let q = admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('id', appointmentId)
      .eq('parent_id', pairParentId);
    if (pairDoctorId) q = q.eq('doctor_id', pairDoctorId);
    const { count } = await q;
    if ((count ?? 0) === 0) return jsonResponse({ error: 'Forbidden' }, 403);
  }
  if (childId) {
    const { count } = await admin
      .from('children')
      .select('id', { count: 'exact', head: true })
      .eq('id', childId)
      .eq('parent_id', pairParentId);
    if ((count ?? 0) === 0) return jsonResponse({ error: 'Forbidden' }, 403);
  }

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count: recent, error: rlErr } = await admin
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('sent_by', caller.id)
    .gte('created_at', since);
  if (rlErr) {
    console.error('[notify] rate-limit query failed', rlErr.message);
    return jsonResponse({ error: 'Could not send notification' }, 500);
  }
  if ((recent ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return jsonResponse({ error: 'Too many notifications, try again later' }, 429);
  }

  // ── Resolve contact details server-side ────────────────────────────────────
  const recipient: Recipient = {
    parent_id: parentId,
    doctor_id: doctorId,
    child_id: childId,
    appointment_id: appointmentId,
  };
  if (parentId) {
    // Email = the address they sign in with (verified), not an editable profile field.
    const contact = await parentContact(admin, parentId);
    recipient.phone = contact.phone;
    recipient.email = contact.email;
    recipient.expo_push_token = contact.expo_push_token;
    if (contact.name) params.parent = firstName(contact.name) ?? params.parent;
    // A doctor sender is named from the database, never from the request.
    if (callerDoctorId) {
      const { data: d } = await admin.from('doctors').select('name').eq('id', callerDoctorId).maybeSingle();
      if (d?.name) params.doctor = String(d.name);
    }
  } else {
    // To a doctor: the caller's own words are ignored; every value comes
    // from the database (parent's first name, doctor's name, child's name).
    for (const k of Object.keys(params)) delete params[k];
    const [{ data: me }, { data: d }] = await Promise.all([
      admin.from('parents').select('name').eq('id', caller.id).maybeSingle(),
      admin.from('doctors').select('name').eq('id', doctorId!).maybeSingle(),
    ]);
    const parentFirst = firstName(me?.name ?? undefined);
    if (parentFirst) params.parent = parentFirst;
    if (d?.name) params.doctor = String(d.name);
    const { data: link } = await admin
      .from('doctor_auth')
      .select('id')
      .eq('doctor_id', doctorId!)
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (link?.id) {
      const { data: du } = await admin.auth.admin.getUserById(link.id);
      const email = du?.user?.email?.toLowerCase();
      // Test doctor logins (@lilsteps.dev) and domains without mail get nothing.
      recipient.email = email && (await canReceiveEmail(email)) ? email : undefined;
    }
  }

  if (childId) {
    const { data: child } = await admin.from('children').select('name').eq('id', childId).maybeSingle();
    if (child?.name) params.child = String(child.name).slice(0, MAX_PARAM_LENGTH);
  }

  const address =
    channel === 'email'
      ? recipient.email
      : channel === 'push'
        ? recipient.expo_push_token
        : recipient.phone;

  // ── Log + dispatch ─────────────────────────────────────────────────────────
  const { data: queued, error: qErr } = await admin
    .from('notification_log')
    .insert({
      channel,
      template: body.template,
      recipient: address ?? 'unknown',
      parent_id: parentId ?? null,
      child_id: childId ?? null,
      appointment_id: appointmentId ?? null,
      sent_by: caller.id,
      status: 'queued',
      payload: { template: body.template, params, doctor_id: doctorId ?? undefined },
    })
    .select('id')
    .single();

  // 23505: this one-off booking message is already queued or sent (0046
  // unique index) — another caller got there first, so it counts as sent.
  if (qErr?.code === '23505') return jsonResponse({ ok: true, duplicate: true });
  if (qErr || !queued) {
    console.error('[notify] log insert failed', qErr?.message);
    return jsonResponse({ error: 'Could not send notification' }, 500);
  }

  const result = address
    ? await dispatch({
        channel,
        template: body.template,
        params,
        recipient,
        audience: doctorId ? 'doctor' : 'parent',
      })
    : { ok: false, error: `No ${channel} contact on record`, notConfigured: true };

  const status = result.ok ? 'sent' : result.notConfigured ? 'skipped' : 'failed';
  await admin
    .from('notification_log')
    .update({
      status,
      provider_id: result.providerId ?? null,
      error: result.error ?? null,
      sent_at: result.ok ? new Date().toISOString() : null,
    })
    .eq('id', queued.id);

  if (result.ok) {
    return jsonResponse({ ok: true, id: queued.id });
  }
  if (result.notConfigured) {
    // Nothing to retry from the client — provider or contact isn't set up yet.
    return jsonResponse({ ok: false, skipped: true, id: queued.id });
  }
  // Provider error text stays in notification_log / logs, not the response.
  console.error('[notify] dispatch failed', queued.id, result.error);
  return jsonResponse({ ok: false, error: 'Notification could not be delivered', id: queued.id }, 502);
});
