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

const MEET_LINK_ERROR =
  "That isn't a Google Meet link. Paste the link Meet gives you, like https://meet.google.com/xxx-xxxx-xxx (your own letters).";

const EXAMPLE_LINK_ERROR =
  "That's the example link, not a real room. Open meet.google.com/new, copy your own link and paste it here.";

/**
 * Meeting codes from docs, screenshots and our own old placeholder. Pasting
 * one sends every parent to an empty room (Dr. Madhav, QA round 2). The
 * database refuses the same list (doctors_default_meet_link_not_example, 0040).
 */
const EXAMPLE_MEET_CODES = new Set(['abc-defg-hij', 'abc-mnop-xyz', 'xxx-xxxx-xxx', 'xxx-yyyy-zzz', 'aaa-bbbb-ccc']);

/** A code made of one repeated letter ("aaa-aaaa-aaa") is never a real room either. */
function isExampleCode(code: string): boolean {
  return EXAMPLE_MEET_CODES.has(code) || /^([a-z])\1{2}-\1{4}-\1{3}$/.test(code);
}

/**
 * Turn what the doctor pasted into a clean Google Meet URL, or explain why
 * not. Accepts a meeting code link (three-four-three letters) or a lookup link, with or
 * without https://; drops any ?query or #hash. The database has a matching
 * check (doctors_default_meet_link_is_meet, migration 0030).
 */
function normaliseMeetLink(input: string): { link: string | null; error?: string } {
  let raw = input.trim();
  if (!raw) return { link: null };
  if (/^meet\.google\.com\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { link: null, error: MEET_LINK_ERROR };
  }
  if (!/^https?:$/.test(url.protocol) || url.hostname.toLowerCase() !== 'meet.google.com') {
    return { link: null, error: MEET_LINK_ERROR };
  }
  const path = url.pathname.replace(/\/+$/, '');
  const code = path.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})$/i);
  if (code) {
    const clean = code[1].toLowerCase();
    if (isExampleCode(clean)) return { link: null, error: EXAMPLE_LINK_ERROR };
    return { link: `https://meet.google.com/${clean}` };
  }
  const lookup = path.match(/^\/lookup\/([A-Za-z0-9_-]+)$/);
  if (lookup) return { link: `https://meet.google.com/lookup/${lookup[1]}` };
  return { link: null, error: MEET_LINK_ERROR };
}

export async function updateMeetLinkAction(
  link: string,
): Promise<{ error?: string; link?: string | null }> {
  const { link: url, error: invalid } = normaliseMeetLink(link);
  if (invalid) return { error: invalid };

  const doctorId = await currentDoctorId();
  if (!doctorId) return { error: 'Not signed in as a doctor' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('doctors')
    .update({ default_meet_link: url })
    .eq('id', doctorId);

  if (error) {
    console.error(`[settings] meet link save failed: ${error.message}`);
    return { error: "Couldn't save the link. Please try again." };
  }

  revalidatePath('/settings');
  revalidatePath('/');
  return { link: url };
}

const MAX_REGISTRATION = 60;

/**
 * The doctor's medical council registration number (doctors.registration_number,
 * migration 0040). The telemedicine rules want it on every prescription, and
 * parents see it there. Blank clears it.
 */
export async function updateRegistrationAction(
  value: string,
): Promise<{ error?: string; registration?: string | null }> {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length > MAX_REGISTRATION) {
    return { error: `Keep it under ${MAX_REGISTRATION} characters.` };
  }
  const doctorId = await currentDoctorId();
  if (!doctorId) return { error: 'Not signed in as a doctor' };

  const supabase = await createSupabaseServerClient();
  const registration = clean || null;
  const { error } = await supabase
    .from('doctors')
    .update({ registration_number: registration })
    .eq('id', doctorId);
  if (error) {
    console.error(`[settings] registration save failed: ${error.message}`);
    return { error: "Couldn't save the registration number. Please try again." };
  }
  revalidatePath('/settings');
  return { registration };
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
