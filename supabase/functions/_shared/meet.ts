// Per-consult Google Meet link. Used by create-meet-event (parent / doctor
// JWT callers) and by _shared/razorpay.ts once a consult is paid. Never
// throws: the consult stands either way and the app falls back to
// doctors.default_meet_link.
//
// Two ways to get the link:
// 1. Clinic account (preferred, used when GOOGLE_MEET_REFRESH_TOKEN is set):
//    one LilSteps Google Workspace account (dev@lilstepsclinics.com) creates
//    a fresh Meet space per consult through the Meet REST API, with open
//    access (family and doctor join from the link without knocking) and
//    recording/transcripts off. Secrets: GOOGLE_MEET_CLIENT_ID,
//    GOOGLE_MEET_CLIENT_SECRET (internal Desktop OAuth client in GCP project
//    lilsteps-prod), GOOGLE_MEET_REFRESH_TOKEN (scope meetings.space.created).
// 2. Doctor's own Google Calendar (fallback): the doctor's stored refresh
//    token mints a Calendar event with Meet attached. Secrets:
//    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (the same OAuth client as the
//    Google provider in Supabase Auth).
// Google error bodies are logged, never returned.

// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

const CLINIC_TZ = 'Asia/Kolkata';
const SLOT_DURATION_MIN = 30;

export type MeetResult =
  | { ok: true; meetLink: string; reused?: boolean; eventId?: string }
  | { ok: false; status: number; error: string };

export interface MeetAppointment {
  id: string;
  date: string;
  time: string;
  status: string;
  doctor_id: string;
  parent_id: string;
  child_id: string;
  meet_link: string | null;
}

export async function createMeetForAppointment(
  admin: SupabaseClient,
  appt: MeetAppointment,
): Promise<MeetResult> {
  // Idempotent — if already has a Meet link from a prior call, return it.
  if (appt.meet_link) return { ok: true, meetLink: appt.meet_link, reused: true };

  // No calendar invite for a consult that isn't booked (unpaid, cancelled,
  // or already happened).
  if (appt.status !== 'upcoming') {
    return { ok: false, status: 409, error: 'This consult is no longer upcoming' };
  }

  if (Deno.env.get('GOOGLE_MEET_REFRESH_TOKEN')) {
    return await createClinicMeetSpace(admin, appt);
  }

  // Doctor's Google refresh token
  const { data: tok } = await admin
    .from('doctor_google_tokens')
    .select('refresh_token, google_email')
    .eq('doctor_id', appt.doctor_id)
    .maybeSingle();
  if (!tok?.refresh_token) {
    return { ok: false, status: 400, error: 'Doctor has not connected Google Calendar' };
  }

  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return { ok: false, status: 500, error: 'Google OAuth secrets not configured' };
  }

  try {
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
      console.error(`[meet] token refresh ${tokenRes.status} for doctor ${appt.doctor_id}: ${err}`);
      return { ok: false, status: 502, error: 'Could not reach Google Calendar' };
    }
    const tokenData = await tokenRes.json();
    const accessToken: string | undefined = tokenData.access_token;
    if (!accessToken) return { ok: false, status: 502, error: 'No access token returned' };

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
          summary: `LilSteps video consult — ${child?.name ?? 'your patient'}`,
          description: 'Paediatric video consultation booked in the LilSteps app.',
          start: { dateTime: startIsoForApi, timeZone: CLINIC_TZ },
          end: { dateTime: endIso, timeZone: CLINIC_TZ },
          attendees,
          conferenceData: {
            createRequest: {
              requestId: `lilsteps-${appt.id}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          },
        }),
      },
    );
    if (!eventRes.ok) {
      const err = await eventRes.text().catch(() => 'unknown');
      console.error(`[meet] Calendar API ${eventRes.status} for appt ${appt.id}: ${err}`);
      return { ok: false, status: 502, error: 'Could not create the calendar event' };
    }
    const event = await eventRes.json();
    const meetLink: string | undefined =
      event.hangoutLink ??
      event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;
    if (!meetLink) return { ok: false, status: 502, error: 'Calendar event created but no Meet link returned' };

    // 4. Persist on the appointment
    const { error: updateErr } = await admin
      .from('appointments')
      .update({ meet_link: meetLink })
      .eq('id', appt.id);
    if (updateErr) {
      console.error(`[meet] meet_link update failed for ${appt.id}: ${updateErr.message}`);
      return { ok: false, status: 500, error: 'Could not save the meeting link' };
    }

    return { ok: true, meetLink, eventId: event.id };
  } catch (e) {
    console.error(`[meet] ${appt.id}: ${(e as Error).message}`);
    return { ok: false, status: 502, error: 'Could not reach Google Calendar' };
  }
}

/** Fresh Meet space from the clinic account; see the header for secrets. */
async function createClinicMeetSpace(
  admin: SupabaseClient,
  appt: MeetAppointment,
): Promise<MeetResult> {
  const clientId = Deno.env.get('GOOGLE_MEET_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_MEET_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_MEET_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, status: 500, error: 'Google Meet secrets not configured' };
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!tokenRes.ok) {
      const err = await tokenRes.text().catch(() => 'unknown');
      console.error(`[meet] clinic token refresh ${tokenRes.status}: ${err}`);
      return { ok: false, status: 502, error: 'Could not reach Google Meet' };
    }
    const accessToken: string | undefined = (await tokenRes.json()).access_token;
    if (!accessToken) return { ok: false, status: 502, error: 'No access token returned' };

    const spaceRes = await fetch('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { accessType: 'OPEN', entryPointAccess: 'ALL' } }),
    });
    if (!spaceRes.ok) {
      const err = await spaceRes.text().catch(() => 'unknown');
      console.error(`[meet] Meet API ${spaceRes.status} for appt ${appt.id}: ${err}`);
      return { ok: false, status: 502, error: 'Could not create the Meet room' };
    }
    const space = await spaceRes.json();
    const meetLink: string | undefined = space.meetingUri;
    if (!meetLink) return { ok: false, status: 502, error: 'Meet room created but no link returned' };

    // Only the first writer wins, so two racing calls can't leave the doctor
    // and the family in different rooms.
    const { data: saved, error: updateErr } = await admin
      .from('appointments')
      .update({ meet_link: meetLink })
      .eq('id', appt.id)
      .is('meet_link', null)
      .select('meet_link')
      .maybeSingle();
    if (updateErr) {
      console.error(`[meet] meet_link update failed for ${appt.id}: ${updateErr.message}`);
      return { ok: false, status: 500, error: 'Could not save the meeting link' };
    }
    if (!saved) {
      const { data: current } = await admin
        .from('appointments')
        .select('meet_link')
        .eq('id', appt.id)
        .maybeSingle();
      if (current?.meet_link) return { ok: true, meetLink: current.meet_link, reused: true };
      return { ok: false, status: 500, error: 'Could not save the meeting link' };
    }

    return { ok: true, meetLink, eventId: space.name };
  } catch (e) {
    console.error(`[meet] ${appt.id}: ${(e as Error).message}`);
    return { ok: false, status: 502, error: 'Could not reach Google Meet' };
  }
}
