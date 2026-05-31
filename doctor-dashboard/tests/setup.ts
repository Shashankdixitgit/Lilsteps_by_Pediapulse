/**
 * Shared test helpers — Supabase admin client + seed/cleanup utilities.
 *
 * Tests use the service role key to bypass RLS so they can:
 *   - create / delete a temporary parent user
 *   - create children, appointments, slots on behalf of that parent
 *   - assert on results
 *
 * Every seeded row is tagged with TEST_TAG so we can clean up cleanly
 * even after a failed run.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv({ path: path.resolve(__dirname, '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
export const DOCTOR_ID = process.env.TEST_DOCTOR_ID!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DOCTOR_ID) {
  throw new Error(
    'Missing test env. Copy tests/.env.example -> tests/.env and fill in ' +
      'NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TEST_DOCTOR_ID.',
  );
}

export const TEST_TAG = 'pp-e2e-test';
export const TEST_PHONE = '+910000000000';
export const TEST_EMAIL = 'pp-e2e@example.invalid';

export function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface SeededParent {
  userId: string;
  email: string;
}

export async function createTestParent(): Promise<SeededParent> {
  const sb = admin();
  const email = `${TEST_TAG}-${Date.now()}@example.invalid`;
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password: 'TestPassword123!',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createTestParent: ${error?.message}`);
  // The handle_new_user trigger creates the parents row automatically.
  return { userId: data.user.id, email };
}

export async function createTestChild(parentId: string, dob = '2020-06-15') {
  const sb = admin();
  const { data, error } = await sb
    .from('children')
    .insert({
      parent_id: parentId,
      name: `${TEST_TAG}-child`,
      dob,
      sex: 'male',
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !data) throw new Error(`createTestChild: ${error?.message}`);
  return data.id;
}

export async function createTestSlot(date: string, time = '10:00:00') {
  const sb = admin();
  // Idempotent: tests reuse the same date/time across specs, and slot rows
  // are not cascaded by child cleanup. Wipe any prior row, then insert fresh.
  await sb
    .from('time_slots')
    .delete()
    .eq('doctor_id', DOCTOR_ID)
    .eq('date', date)
    .eq('time', time);
  const { data, error } = await sb
    .from('time_slots')
    .insert({ doctor_id: DOCTOR_ID, date, time, is_available: true })
    .select('id')
    .single<{ id: string }>();
  if (error || !data) throw new Error(`createTestSlot: ${error?.message}`);
  return data.id;
}

export async function bookTestAppointment(params: {
  parentId: string;
  childId: string;
  date: string;
  time: string;
}) {
  const sb = admin();
  const { data, error } = await sb
    .from('appointments')
    .insert({
      parent_id: params.parentId,
      child_id: params.childId,
      doctor_id: DOCTOR_ID,
      date: params.date,
      time: params.time,
      status: 'upcoming',
    })
    .select('id')
    .single<{ id: string }>();
  if (error || !data) throw new Error(`bookTestAppointment: ${error?.message}`);
  return data.id;
}

export function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function isoOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/**
 * Wipe every row this test suite has ever created.
 * Idempotent — safe to call on every test setUp / tearDown.
 */
export async function cleanupTestData() {
  const sb = admin();

  // children cascade-deletes appointments, prescriptions, vaccinations,
  // growth_measurements, etc.
  const { data: testChildren } = await sb
    .from('children')
    .select('id')
    .like('name', `${TEST_TAG}%`);
  if (testChildren && testChildren.length > 0) {
    await sb
      .from('children')
      .delete()
      .in('id', testChildren.map((c) => c.id));
  }

  // Delete the parent auth users (cascades to parents row)
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 200 });
  const testUsers = users?.users.filter((u) => u.email?.startsWith(TEST_TAG)) ?? [];
  for (const u of testUsers) {
    await sb.auth.admin.deleteUser(u.id);
  }

  // Test slots: anything in 2099 (we never seed real slots that far out)
  await sb.from('time_slots').delete().eq('doctor_id', DOCTOR_ID).gte('date', '2099-01-01');
}
