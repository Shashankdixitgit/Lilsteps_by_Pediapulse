'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { composeOutcome, prescriptionText, type VisitNotes } from '@/lib/consultations';
import { getCurrentDoctor, type CurrentDoctor } from '@/lib/doctor';
import { formatDayShort, formatSlotTime, nowIstTime, todayIst } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type AppointmentForClose = {
  id: string;
  child_id: string;
  parent_id: string;
  doctor_id: string;
  status: string;
  date: string;
  time: string;
  ai_summary_id: string | null;
  children: { name: string } | null;
};

/**
 * 'completed' / 'no_show' close an open visit. 'update' edits the notes of a
 * visit that is already closed. There is deliberately no server-side draft:
 * the parent app lists every consultations row as a past visit, so a row is
 * only written once the visit is closed (the form keeps drafts locally).
 */
export type VisitOutcome = 'completed' | 'no_show' | 'update';

const MAX_FIELD = 2000;

/**
 * Saves the doctor's visit notes as a consultations row (one per appointment)
 * and, for complete / no-show, moves appointments.status. The parent
 * app reads consultations for "Past consultations" and the visit summary.
 */
export async function saveVisitAction(params: {
  appointmentId: string;
  notes: VisitNotes;
  outcome: VisitOutcome;
}): Promise<{ error?: string; savedAt?: string }> {
  const notes: VisitNotes = {
    diagnosis: params.notes.diagnosis.trim().slice(0, MAX_FIELD),
    advice: params.notes.advice.trim().slice(0, MAX_FIELD),
    followUp: params.notes.followUp.trim().slice(0, MAX_FIELD),
  };
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) return { error: 'Not signed in as a doctor' };

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, child_id, parent_id, doctor_id, status, date, time, ai_summary_id, children(name)')
    .eq('id', params.appointmentId)
    .eq('doctor_id', doctor.doctorId)
    .maybeSingle<AppointmentForClose>();
  if (!appt) return { error: 'Appointment not found' };
  if (appt.status === 'cancelled') return { error: 'This appointment was cancelled by the parent' };

  const closed = appt.status === 'completed' || appt.status === 'no_show';
  if (params.outcome === 'update' && !closed) return { error: 'Close the visit first' };
  if (params.outcome !== 'update' && closed) return { error: 'This visit is already closed' };
  const nextStatus = params.outcome === 'update' ? appt.status : params.outcome;
  const noShow = nextStatus === 'no_show';
  if (nextStatus === 'completed' && !notes.diagnosis && !notes.advice) {
    return { error: 'Add a diagnosis or advice before marking the visit complete' };
  }

  // Chief complaint: the AI check-in's, else what the parent typed (0020).
  const [{ data: checkin }, { data: concernRow }, rx] = await Promise.all([
    appt.ai_summary_id
      ? supabase
          .from('checkin_sessions')
          .select('ai_summary, initial_complaint')
          .eq('id', appt.ai_summary_id)
          .maybeSingle<{ ai_summary: { chiefComplaint?: string } | null; initial_complaint: string | null }>()
      : Promise.resolve({ data: null }),
    supabase
      .from('appointments')
      .select('concern')
      .eq('id', appt.id)
      .maybeSingle<{ concern: string | null }>(),
    prescriptionText(supabase, appt.id),
  ]);
  const chiefComplaint =
    checkin?.ai_summary?.chiefComplaint?.trim() ||
    concernRow?.concern?.trim() ||
    checkin?.initial_complaint?.trim() ||
    null;

  const row = {
    appointment_id: appt.id,
    child_id: appt.child_id,
    doctor_name: doctor.name,
    doctor_specialisation: doctor.specialisation,
    chief_complaint: chiefComplaint,
    outcome: composeOutcome(notes, noShow),
    prescription: rx,
    ai_summary: checkin?.ai_summary ?? null,
    doctor_notes: JSON.stringify(notes),
  };

  const { data: existing } = await supabase
    .from('consultations')
    .select('id')
    .eq('appointment_id', appt.id)
    .maybeSingle<{ id: string }>();

  const { error: writeErr } = existing
    ? await supabase.from('consultations').update(row).eq('id', existing.id)
    : await supabase.from('consultations').insert(row);
  if (writeErr) return { error: `Notes: ${writeErr.message}` };

  if (nextStatus !== appt.status) {
    const { error: statusErr } = await supabase
      .from('appointments')
      .update({ status: nextStatus })
      .eq('id', appt.id)
      .eq('doctor_id', doctor.doctorId);
    if (statusErr) return { error: `Status: ${statusErr.message}` };
    // Closed before the booked slot: the parent's upcoming card just vanished
    // (R2-12), so tell them in chat that the summary is ready.
    if (nextStatus === 'completed' && slotStillAhead(appt.date, appt.time)) {
      await tellParentClosedEarly(supabase, doctor, appt);
    }
  }

  revalidatePath('/');
  revalidatePath(`/consultations/${appt.id}`);

  if (params.outcome === 'completed' || params.outcome === 'no_show') {
    const who = appt.children?.name ?? 'the patient';
    const msg = params.outcome === 'completed' ? `Visit with ${who} marked complete` : `${who} marked as no-show`;
    redirect(`/?closed=${encodeURIComponent(msg)}`);
  }
  return { savedAt: new Date().toISOString() };
}

/** True when the booked slot (IST) has not started yet. */
function slotStillAhead(date: string, time: string): boolean {
  const today = todayIst();
  return date > today || (date === today && time > nowIstTime());
}

/**
 * Chat message to the parent when a visit is closed before its slot. Uses the
 * child's existing thread with this doctor, or starts one (same rule as
 * openChatAction). A failure here never blocks closing the visit.
 */
async function tellParentClosedEarly(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  doctor: CurrentDoctor,
  appt: AppointmentForClose,
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('child_id', appt.child_id)
      .eq('doctor_id', doctor.doctorId)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    let conversationId = existing?.id;
    if (!conversationId) {
      const { data: created } = await supabase
        .from('conversations')
        .insert({
          child_id: appt.child_id,
          parent_id: appt.parent_id,
          doctor_id: doctor.doctorId,
          appointment_id: appt.id,
        })
        .select('id')
        .single<{ id: string }>();
      conversationId = created?.id;
    }
    if (!conversationId) return;

    const firstName = appt.children?.name?.split(' ')[0];
    const visit = firstName ? `${firstName}'s visit` : 'this visit';
    const slot = `${formatDayShort(appt.date)}, ${formatSlotTime(appt.time)}`;
    const content =
      `${doctor.name} has closed ${visit} (booked for ${slot}) early and written your visit summary. ` +
      'To read it in the app, go to Home, then Consultations, then See all. You do not need to join the video call.';

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'doctor',
      sender_id: user.id,
      content,
    });
    if (error) {
      console.error(`[visit] closed-early message failed: ${error.message}`);
      return;
    }
    revalidatePath(`/conversations/${conversationId}`);
  } catch (e) {
    console.error(`[visit] closed-early message failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Opens the chat thread with this child's parent, creating it if the parent
 * has never messaged (policy conversations_insert_doctor, migration 0021).
 */
export async function openChatAction(appointmentId: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) return { error: 'Not signed in as a doctor' };

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, child_id, parent_id')
    .eq('id', appointmentId)
    .eq('doctor_id', doctor.doctorId)
    .maybeSingle<{ id: string; child_id: string; parent_id: string }>();
  if (!appt) return { error: 'Appointment not found' };

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('child_id', appt.child_id)
    .eq('doctor_id', doctor.doctorId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  let conversationId = existing?.id;
  if (!conversationId) {
    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        child_id: appt.child_id,
        parent_id: appt.parent_id,
        doctor_id: doctor.doctorId,
        appointment_id: appt.id,
      })
      .select('id')
      .single<{ id: string }>();
    if (error || !created) return { error: error?.message ?? 'Could not start the chat' };
    conversationId = created.id;
  }
  redirect(`/conversations/${conversationId}`);
}
