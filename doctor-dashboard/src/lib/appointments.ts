import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * appointments.concern (what the parent typed in "Book a doctor") is added by
 * migration 0020. Read it in its own query so a database without the column
 * still renders every page — the concern is just missing.
 */
export async function fetchConcerns(
  supabase: SupabaseClient,
  appointmentIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (appointmentIds.length === 0) return out;
  const { data, error } = await supabase
    .from('appointments')
    .select('id, concern')
    .in('id', appointmentIds)
    .returns<{ id: string; concern: string | null }[]>();
  if (error || !data) return out;
  data.forEach((r) => {
    const c = r.concern?.trim();
    if (c) out.set(r.id, c);
  });
  return out;
}

export type Urgency = 'routine' | 'soon' | 'urgent';

/**
 * The AI check-in's suggestedUrgency per appointment, read from the linked
 * checkin_sessions row (appointments.ai_summary_id). Appointments booked
 * without a check-in, or with an unknown value, are left out.
 */
export async function fetchUrgencies(
  supabase: SupabaseClient,
  rows: { id: string; ai_summary_id: string | null }[],
): Promise<Map<string, Urgency>> {
  const out = new Map<string, Urgency>();
  const sessionIds = [...new Set(rows.map((r) => r.ai_summary_id).filter((x): x is string => !!x))];
  if (sessionIds.length === 0) return out;
  const { data, error } = await supabase
    .from('checkin_sessions')
    .select('id, ai_summary')
    .in('id', sessionIds)
    .returns<{ id: string; ai_summary: { suggestedUrgency?: string } | null }[]>();
  if (error || !data) return out;
  const bySession = new Map<string, Urgency>();
  data.forEach((s) => {
    const u = s.ai_summary?.suggestedUrgency;
    if (u === 'routine' || u === 'soon' || u === 'urgent') bySession.set(s.id, u);
  });
  rows.forEach((r) => {
    const u = r.ai_summary_id ? bySession.get(r.ai_summary_id) : undefined;
    if (u) out.set(r.id, u);
  });
  return out;
}

/**
 * children.allergies_not_known: the parent answered "Not known yet" to the
 * allergy question in onboarding. The column is added by a later migration,
 * so it is read in its own query and a database without it reads as false.
 */
export async function fetchAllergiesNotKnown(supabase: SupabaseClient, childId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('children')
    .select('allergies_not_known')
    .eq('id', childId)
    .maybeSingle<{ allergies_not_known: boolean | null }>();
  if (error || !data) return false;
  return data.allergies_not_known === true;
}

/** Shown wherever a doctor might prescribe for a child whose allergies are not known (R2-01). */
export const ALLERGIES_NOT_KNOWN_LABEL = 'Allergies not known yet. Ask before prescribing';

/** What to say when a child has no allergy rows. */
export function noAllergiesLabel(notKnown: boolean, fallback = 'None recorded'): string {
  return notKnown ? ALLERGIES_NOT_KNOWN_LABEL : fallback;
}

/**
 * Children (by id) with an open, urgent visit booked for today or later:
 * the AI check-in flagged them to be seen today. Used to flag their threads.
 */
export async function fetchUrgentChildIds(
  supabase: SupabaseClient,
  doctorId: string,
  childIds: string[],
  fromDate: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (childIds.length === 0) return out;
  const { data, error } = await supabase
    .from('appointments')
    .select('id, child_id, ai_summary_id')
    .eq('doctor_id', doctorId)
    .eq('status', 'upcoming')
    .gte('date', fromDate)
    .in('child_id', childIds)
    .not('ai_summary_id', 'is', null)
    .returns<{ id: string; child_id: string; ai_summary_id: string | null }[]>();
  if (error || !data) return out;
  const urgencies = await fetchUrgencies(supabase, data);
  data.forEach((a) => {
    if (urgencies.get(a.id) === 'urgent') out.add(a.child_id);
  });
  return out;
}
