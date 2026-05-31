// Edge Function: video-room
//
// Returns a join code (or full token) for an appointment's 100ms room.
// Creates the room on first call.
//
// Request body: { appointmentId: string }
// Response:     { roomId, code }   (code is a 100ms role-specific room code)
//
// The CLIENT exchanges `code` with 100ms to get a per-user auth token. That
// avoids us minting + storing user-scoped JWTs server-side.
//
// Secrets needed (set via `supabase secrets set` — your 100ms dashboard has
// these under Developer → API):
//   HMS_ACCESS_KEY     — App access key (UUID)
//   HMS_SECRET         — App secret
//   HMS_TEMPLATE_ID    — 100ms template id (defines parent/doctor roles)
//
// Caller auth: standard Supabase JWT. We verify the caller is either the
// parent on the appointment or the assigned doctor.
//
// Deploy: `supabase functions deploy video-room --project-ref opdosbudlzwywdmrxlqr`

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';
import { create as createJwt, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';
import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';

const HMS_API = 'https://api.100ms.live/v2';

async function mintManagementToken(): Promise<string> {
  const accessKey = Deno.env.get('HMS_ACCESS_KEY');
  const secret = Deno.env.get('HMS_SECRET');
  if (!accessKey || !secret) throw new Error('100ms creds not set');

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

  return createJwt(
    { alg: 'HS256', typ: 'JWT' },
    {
      access_key: accessKey,
      type: 'management',
      version: 2,
      iat: getNumericDate(0),
      nbf: getNumericDate(0),
      exp: getNumericDate(60 * 60),
      jti: crypto.randomUUID(),
    },
    key,
  );
}

async function createHmsRoom(name: string, description: string): Promise<string> {
  const token = await mintManagementToken();
  const templateId = Deno.env.get('HMS_TEMPLATE_ID');
  if (!templateId) throw new Error('HMS_TEMPLATE_ID not set');

  const res = await fetch(`${HMS_API}/rooms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, template_id: templateId }),
  });
  if (!res.ok) throw new Error(`100ms /rooms ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

async function createRoomCode(roomId: string, role: 'parent' | 'doctor'): Promise<string> {
  const token = await mintManagementToken();
  const res = await fetch(`${HMS_API}/room-codes/room/${roomId}/role/${role}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`100ms /room-codes ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.code as string;
}

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

  // Verify caller has access (parent OR doctor on this appointment).
  const userId = userData.user.id;
  const { data: appt } = await admin
    .from('appointments')
    .select('id, parent_id, doctor_id, date, time')
    .eq('id', body.appointmentId)
    .maybeSingle<{
      id: string;
      parent_id: string;
      doctor_id: string;
      date: string;
      time: string;
    }>();
  if (!appt) return jsonResponse({ error: 'Appointment not found' }, 404);

  const { data: doctorAuth } = await admin
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', userId)
    .maybeSingle();

  const role: 'parent' | 'doctor' | null =
    appt.parent_id === userId
      ? 'parent'
      : doctorAuth?.doctor_id === appt.doctor_id
        ? 'doctor'
        : null;

  if (!role) return jsonResponse({ error: 'Forbidden' }, 403);

  // Get or create the room row.
  let { data: room } = await admin
    .from('video_rooms')
    .select('*')
    .eq('appointment_id', appt.id)
    .maybeSingle();

  try {
    if (!room || !room.room_id) {
      const hmsRoomId = await createHmsRoom(
        `appt-${appt.id.slice(0, 8)}`,
        `Pedia Pulse consultation ${appt.date} ${appt.time}`,
      );
      const [parentCode, doctorCode] = await Promise.all([
        createRoomCode(hmsRoomId, 'parent'),
        createRoomCode(hmsRoomId, 'doctor'),
      ]);

      const { data: upserted } = await admin
        .from('video_rooms')
        .upsert(
          {
            appointment_id: appt.id,
            room_id: hmsRoomId,
            room_code_parent: parentCode,
            room_code_doctor: doctorCode,
          },
          { onConflict: 'appointment_id' },
        )
        .select('*')
        .single();
      room = upserted;
    }
  } catch (e: any) {
    return jsonResponse({ error: e?.message ?? '100ms call failed' }, 502);
  }

  const code =
    role === 'parent' ? room?.room_code_parent : room?.room_code_doctor;
  return jsonResponse({
    roomId: room?.room_id,
    code,
    role,
  });
});
