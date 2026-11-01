// Edge Function: create-meet-event
//
// Called by the parent or the doctor for a booked consult. Since 0045 the
// server also does this itself once a consult is paid (_shared/razorpay.ts),
// so the app no longer calls it after booking. Uses
// the doctor's stored Google refresh token to mint a Calendar event for the
// appointment with a Hangouts Meet conference attached, then writes the
// resulting meet link back to appointments.meet_link.
//
// Fire-and-forget from the caller's perspective — if this errors (no
// connected Google account, refresh token expired, etc.) the booking still
// stands and UIs fall back to doctors.default_meet_link.
//
// Secrets needed:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET — the SAME Google OAuth client
//   that is set on the Google provider in Supabase Auth. The doctor's refresh
//   token comes from that client (dashboard Settings → Connect Google), and
//   Google only refreshes it for the client that issued it.
//
// Deploy:
//   supabase functions deploy create-meet-event --project-ref ahikfefphptmtivwukpv

// Caller must be the parent on the appointment or its doctor. Google error
// bodies are logged, never returned.

import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { createMeetForAppointment, type MeetAppointment } from '../_shared/meet.ts';
import { createAdminClient, getCaller } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient();
  const caller = await getCaller(req, admin);
  if (!caller) return jsonResponse({ error: 'Invalid session' }, 401);

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
    .select('id, date, time, status, doctor_id, parent_id, child_id, meet_link')
    .eq('id', body.appointmentId)
    .maybeSingle<MeetAppointment>();
  if (apptErr || !appt) return jsonResponse({ error: 'Appointment not found' }, 404);

  // Only the parent on the appointment or its doctor may create the event.
  if (appt.parent_id !== caller.id) {
    const { data: doctorAuth } = await admin
      .from('doctor_auth')
      .select('doctor_id')
      .eq('id', caller.id)
      .maybeSingle();
    if (doctorAuth?.doctor_id !== appt.doctor_id) {
      return jsonResponse({ error: 'Appointment not found' }, 404);
    }
  }

  const result = await createMeetForAppointment(admin, appt);
  if (!result.ok) return jsonResponse({ error: result.error }, result.status);
  return jsonResponse({ ok: true, meetLink: result.meetLink, reused: result.reused, eventId: result.eventId });
});
