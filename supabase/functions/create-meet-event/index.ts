// Edge Function: create-meet-event
//
// Called from the parent app right after `bookAppointment` succeeds. Uses
// the doctor's stored Google refresh token to mint a Calendar event for the
// appointment with a Hangouts Meet conference attached, then writes the
// resulting meet link back to appointments.meet_link.
//
// Fire-and-forget from the caller's perspective — if this errors (no
// connected Google account, refresh token expired, etc.) the booking still
// stands and UIs fall back to doctors.default_meet_link.
//
// Secrets needed:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//
// Deploy:
//   supabase functions deploy create-meet-event --project-ref opdosbudlzwywdmrxlqr

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';

const CLINIC_TZ = 'Asia/Kolkata';
const SLOT_DURATION_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization' }, 401);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const jwt = authHeader.replace('Bearer ', '');
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Invalid session' }, 401);
  }

  let body: { appointmentId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }
  if (!body.appointmentId) return jsonResponse({ error: 'Missing appointmentId' }, 400);

  // Fetch appointment (RLS bypassed via service role)
  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, date, time, doctor_id, parent_id, child_id, meet_link')
    .eq('id', body.appointmentId)
    .maybeSingle();
  if (apptErr || !appt) return jsonResponse({ error: 'Appointment not found' }, 404);

  // Idempotent — if already has a Meet link from a prior call, return it.
  if (appt.meet_link) return jsonResponse({ ok: true, meetLink: appt.meet_link, reused: true });

  // Doctor's Google refresh token
  const { data: tok } = await admin
    .from('doctor_google_tokens')
    .select('refresh_token, google_email')
    .eq('doctor_id', appt.doctor_id)
    .maybeSingle();
  if (!tok?.refresh_token) {
    return jsonResponse(
      { error: 'Doctor has not connected Google Calendar' },
      400,
    );
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return jsonResponse({ error: 'Google OAuth secrets not configured' }, 500);
  }

  // 1. Refresh access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tok.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!tokenRes.ok) {
    const err = await tokenRes.text().catch(() => 'unknown');
    return jsonResponse({ error: `Token refresh failed: ${err}` }, 502);
  }
  const tokenData = await tokenRes.json();
  const accessToken: string | undefined = tokenData.access_token;
  if (!accessToken) return jsonResponse({ error: 'No access token returned' }, 502);

  // 2. Fetch parent + child for event copy
  const [parentRes, childRes] = await Promise.all([
    admin.from('parents').select('email, name').eq('id', appt.parent_id).maybeSingle(),
    admin.from('children').select('name').eq('id', appt.child_id).maybeSingle(),
  ]);
  const parent = parentRes.data as { email: string | null; name: string | null } | null;
  const child = childRes.data as { name: string | null } | null;

  // 3. Compose Calendar event
  const startIso = `${appt.date}T${appt.time.slice(0, 8)}+05:30`; // IST -> ISO
  const startMs = new Date(startIso).getTime();
  const endIso = new Date(startMs + SLOT_DURATION_MIN * 60_000).toISOString();
  const startIsoForApi = new Date(startMs).toISOString();

  const attendees: { email: string }[] = [];
  if (parent?.email) attendees.push({ email: parent.email });

  const eventRes = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: `Pedia Pulse — ${child?.name ?? 'Consultation'}`,
        description: 'Paediatric video consultation booked via Pedia Pulse.',
        start: { dateTime: startIsoForApi, timeZone: CLINIC_TZ },
        end: { dateTime: endIso, timeZone: CLINIC_TZ },
        attendees,
        conferenceData: {
          createRequest: {
            requestId: `pp-${appt.id}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  );
  if (!eventRes.ok) {
    const err = await eventRes.text().catch(() => 'unknown');
    return jsonResponse({ error: `Calendar API ${eventRes.status}: ${err}` }, 502);
  }
  const event = await eventRes.json();
  const meetLink: string | undefined =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;
  if (!meetLink) return jsonResponse({ error: 'Calendar event created but no Meet link returned' }, 502);

  // 4. Persist on the appointment
  const { error: updateErr } = await admin
    .from('appointments')
    .update({ meet_link: meetLink })
    .eq('id', appt.id);
  if (updateErr) {
    return jsonResponse({ error: `DB update failed: ${updateErr.message}` }, 500);
  }

  return jsonResponse({ ok: true, meetLink, eventId: event.id });
});
