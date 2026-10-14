import type { SupabaseClient } from '@supabase/supabase-js';

export type CurrentDoctor = {
  doctorId: string;
  name: string;
  specialisation: string | null;
  defaultMeetLink: string | null;
  googleConnected: boolean;
};

/**
 * The signed-in doctor's row, or null when the user is not a doctor.
 * `googleConnected` means per-appointment Meet links can be created; with
 * neither that nor `defaultMeetLink`, parents have no video link to join.
 */
export async function getCurrentDoctor(supabase: SupabaseClient): Promise<CurrentDoctor | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: auth } = await supabase
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', user.id)
    .maybeSingle<{ doctor_id: string }>();
  if (!auth) return null;

  // default_meet_link is not readable through the table (0036); the doctor's
  // own room comes from get_my_meet_link.
  const [{ data: doc }, { data: link }, { data: tok }] = await Promise.all([
    supabase
      .from('doctors')
      .select('name, specialisation')
      .eq('id', auth.doctor_id)
      .maybeSingle<{ name: string; specialisation: string | null }>(),
    supabase.rpc('get_my_meet_link').returns<string | null>(),
    supabase
      .from('doctor_google_tokens')
      .select('doctor_id')
      .eq('doctor_id', auth.doctor_id)
      .maybeSingle<{ doctor_id: string }>(),
  ]);

  return {
    doctorId: auth.doctor_id,
    name: doc?.name ?? 'Doctor',
    specialisation: doc?.specialisation ?? null,
    defaultMeetLink: (link as string | null)?.trim() || null,
    googleConnected: !!tok,
  };
}

export function hasVideoLink(doctor: CurrentDoctor | null): boolean {
  return !!doctor && (!!doctor.defaultMeetLink || doctor.googleConnected);
}
