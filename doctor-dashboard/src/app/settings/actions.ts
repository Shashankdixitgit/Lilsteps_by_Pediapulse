'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

async function currentDoctorId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('doctor_auth')
    .select('doctor_id')
    .eq('id', user.id)
    .maybeSingle<{ doctor_id: string }>();
  return data?.doctor_id ?? null;
}

export async function updateMeetLinkAction(link: string): Promise<{ error?: string }> {
  const url = link.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    return { error: 'Link must start with https:// (or http://)' };
  }

  const doctorId = await currentDoctorId();
  if (!doctorId) return { error: 'Not signed in as a doctor' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('doctors')
    .update({ default_meet_link: url || null })
    .eq('id', doctorId);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  revalidatePath('/');
  return {};
}

export async function saveGoogleTokenAction(params: {
  refreshToken: string;
  googleEmail: string | null;
}): Promise<{ error?: string }> {
  if (!params.refreshToken) return { error: 'No refresh token' };
  const doctorId = await currentDoctorId();
  if (!doctorId) return { error: 'Not signed in as a doctor' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('doctor_google_tokens')
    .upsert(
      {
        doctor_id: doctorId,
        refresh_token: params.refreshToken,
        google_email: params.googleEmail,
        scopes: 'https://www.googleapis.com/auth/calendar.events',
      },
      { onConflict: 'doctor_id' },
    );
  if (error) return { error: error.message };

  revalidatePath('/settings');
  return {};
}

export async function disconnectGoogleAction(): Promise<{ error?: string }> {
  const doctorId = await currentDoctorId();
  if (!doctorId) return { error: 'Not signed in as a doctor' };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('doctor_google_tokens')
    .delete()
    .eq('doctor_id', doctorId);
  if (error) return { error: error.message };
  revalidatePath('/settings');
  return {};
}
