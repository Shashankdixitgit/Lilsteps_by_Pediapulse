// Edge Function: delete-account
//
// In-app account deletion (Apple App Store guideline 5.1.1(v), Google Play
// account-deletion policy). Called from Profile → Privacy & security →
// "Delete my account" with the signed-in parent's session.
//
// What it deletes (policy: everything the parent put in or that is about
// their children; nothing that belongs to a doctor):
//   1. Files in Storage
//        documents/<parent_id>/**            (uploaded health records)
//        health-photos/<parent_id>/**        (health-log photos)
//        prescriptions/<prescription_id>/**  (PDFs for this parent's children)
//   2. notification_log rows for the parent or their children (they hold the
//      phone number / push token; the FK is ON DELETE SET NULL so they would
//      otherwise survive).
//   3. The auth user. public.parents.id references auth.users ON DELETE
//      CASCADE, and children, check-ins (+ messages), appointments (upcoming
//      slots are released by the release_appointment_slot trigger),
//      conversations (+ messages), consultations, prescriptions (+ items),
//      documents, vaccinations, growth, health notes, allergies, conditions
//      and medications all cascade from parents / children.
//
// Doctors are refused: a doctor account is removed by the LilSteps team, not
// from the parent app.
//
// Request:  POST { "confirm": "DELETE" }  with Authorization: Bearer <user JWT>
// Response: { ok: true } or { error }
//
// Deploy:
//   supabase functions deploy delete-account --project-ref <project-ref>

import { CORS_HEADERS, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, getCaller } from '../_shared/supabase.ts';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.3';

/** Every object path under `prefix` in `bucket` (walks sub-folders). */
async function listAll(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [prefix];
  while (queue.length) {
    const folder = queue.shift()!;
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(folder, { limit: 1000, offset });
      if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
      if (!data?.length) break;
      for (const item of data) {
        const path = `${folder}/${item.name}`;
        // Folders come back with a null id.
        if (item.id === null) queue.push(path);
        else out.push(path);
      }
      if (data.length < 1000) break;
    }
  }
  return out;
}

async function removeAll(admin: SupabaseClient, bucket: string, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(unique.slice(i, i + 100));
    if (error) throw new Error(`remove ${bucket}: ${error.message}`);
  }
  return unique.length;
}

/** A stored path, never a full URL (old rows may hold a file:// or https URL). */
function asObjectPath(v: string | null | undefined): string | null {
  if (!v || /^[a-z]+:\/\//i.test(v)) return null;
  return v.replace(/^\/+/, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient();
  const caller = await getCaller(req, admin);
  if (!caller) return jsonResponse({ error: 'Invalid session' }, 401);

  let body: { confirm?: string } = {};
  try {
    body = await req.json();
  } catch {
    // fall through to the confirm check
  }
  if (body.confirm !== 'DELETE') {
    return jsonResponse({ error: 'Missing confirmation' }, 400);
  }

  const uid = caller.id;

  const { data: doctorAuth } = await admin
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', uid)
    .maybeSingle();
  if (doctorAuth) {
    return jsonResponse(
      { error: 'Doctor accounts are closed by the LilSteps team. Please contact support.' },
      403,
    );
  }

  try {
    const { data: kids, error: kidsErr } = await admin
      .from('children')
      .select('id')
      .eq('parent_id', uid);
    if (kidsErr) throw new Error(`children: ${kidsErr.message}`);
    const childIds = (kids ?? []).map((k) => k.id as string);

    // ── 1. Storage files ────────────────────────────────────────────────
    const docPaths = await listAll(admin, 'documents', uid);
    const photoPaths = await listAll(admin, 'health-photos', uid);
    let rxPaths: string[] = [];
    if (childIds.length) {
      const [{ data: docs }, { data: notes }, { data: rx }] = await Promise.all([
        admin.from('documents').select('file_url').in('child_id', childIds),
        admin.from('health_notes').select('photo_url').in('child_id', childIds),
        admin.from('prescriptions').select('id, pdf_url').in('child_id', childIds),
      ]);
      // Files referenced from rows but stored outside the parent's folder.
      for (const d of docs ?? []) {
        const p = asObjectPath(d.file_url as string | null);
        if (p) docPaths.push(p);
      }
      for (const n of notes ?? []) {
        const p = asObjectPath(n.photo_url as string | null);
        if (p) photoPaths.push(p);
      }
      for (const r of rx ?? []) {
        rxPaths.push(...(await listAll(admin, 'prescriptions', r.id as string)));
        const p = asObjectPath(r.pdf_url as string | null);
        if (p) rxPaths.push(p);
      }
    }
    rxPaths = [...new Set(rxPaths)];
    const files =
      (await removeAll(admin, 'documents', docPaths)) +
      (await removeAll(admin, 'health-photos', photoPaths)) +
      (await removeAll(admin, 'prescriptions', rxPaths));

    // ── 2. Notification log (phone / push token) ───────────────────────
    const { error: logErr } = await admin.from('notification_log').delete().eq('parent_id', uid);
    if (logErr) throw new Error(`notification_log: ${logErr.message}`);
    if (childIds.length) {
      const { error: logErr2 } = await admin
        .from('notification_log')
        .delete()
        .in('child_id', childIds);
      if (logErr2) throw new Error(`notification_log (children): ${logErr2.message}`);
    }

    // ── 3. Rows: delete the parent explicitly first so a failure here is
    //    caught before the login disappears, then the auth user. ─────────
    const { error: parentErr } = await admin.from('parents').delete().eq('id', uid);
    if (parentErr) throw new Error(`parents: ${parentErr.message}`);

    const { error: authErr } = await admin.auth.admin.deleteUser(uid);
    if (authErr) throw new Error(`auth user: ${authErr.message}`);

    console.log(`[delete-account] deleted user ${uid}: ${childIds.length} children, ${files} files`);
    return jsonResponse({ ok: true });
  } catch (e) {
    // Details stay in the logs; the parent sees a plain message.
    console.error(`[delete-account] failed for ${uid}:`, e instanceof Error ? e.message : e);
    return jsonResponse(
      { error: 'We could not delete your account right now. Please try again.' },
      500,
    );
  }
});
