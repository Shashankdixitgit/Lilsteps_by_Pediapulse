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
  if (!appt || appt.status === 'awaiting_payment') return { error: 'Appointment not found' };
  if (appt.status === 'cancelled') return refuse(appt.id, 'This appointment was cancelled');

  const closed = appt.status === 'completed' || appt.status === 'no_show';
  // Refusals caused by the visit changing elsewhere (another tab, the
  // parent) re-render the page so it stops offering the stale controls.
  if (params.outcome === 'update' && !closed) return refuse(appt.id, 'Close the visit first');
  if (params.outcome !== 'update' && closed) return refuse(appt.id, 'This visit is already closed');
  // A visit can't be missed before it starts: the parent would be told so.
  if (params.outcome === 'no_show' && slotStillAhead(appt.date, appt.time)) {
    return { error: "This visit hasn't started yet, so it can't be a no-show" };
  }
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

function refuse(appointmentId: string, error: string): { error: string } {
  revalidatePath('/');
  revalidatePath(`/consultations/${appointmentId}`);
  return { error };
}

/** True when the booked slot (IST) has not started yet. */
function slotStillAhead(date: string, time: string): boolean {
  const today = todayIst();
  return date > today || (date === today && time > nowIstTime());
}

/** Chat message to the parent when a visit is closed before its slot. */
async function tellParentClosedEarly(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  doctor: CurrentDoctor,
  appt: AppointmentForClose,
): Promise<void> {
  const firstName = appt.children?.name?.split(' ')[0];
  const visit = firstName ? `${firstName}'s visit` : 'this visit';
  const slot = `${formatDayShort(appt.date)}, ${formatSlotTime(appt.time)}`;
  await messageParent(
    supabase,
    doctor,
    appt,
    `${doctor.name} has closed ${visit} (booked for ${slot}) early and written your visit summary. ` +
      'To read it in the app, go to Home, then Consultations, then See all. You do not need to join the video call.',
    'closed-early',
  );
}

/**
 * Posts a doctor message in the child's thread with this doctor, starting one
 * when none exists (same rule as openChatAction). A failure here never blocks
 * the action that triggered it.
 */
async function messageParent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  doctor: CurrentDoctor,
  appt: Pick<AppointmentForClose, 'id' | 'child_id' | 'parent_id'>,
  content: string,
  tag: string,
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

    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender: 'doctor',
      sender_id: user.id,
      content,
    });
    if (error) {
      console.error(`[visit] ${tag} message failed: ${error.message}`);
      return;
    }
    revalidatePath(`/conversations/${conversationId}`);
  } catch (e) {
    console.error(`[visit] ${tag} message failed: ${e instanceof Error ? e.message : String(e)}`);
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
    .select('id, child_id, parent_id, status')
    .eq('id', appointmentId)
    .eq('doctor_id', doctor.doctorId)
    .maybeSingle<{ id: string; child_id: string; parent_id: string; status: string }>();
  if (!appt || appt.status === 'awaiting_payment') return { error: 'Appointment not found' };

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
  // ?appt= tells the thread which visit its Consultation / Issue
  // prescription links are for (the thread may have started on another).
  redirect(`/conversations/${conversationId}?appt=${appt.id}`);
}

/**
 * Doctor cancels an upcoming consult. consult-payment (action 'cancel') marks
 * it cancelled with cancel_reason 'doctor', which re-opens the slot, and
 * refunds a paid consult in full. The parent is told in chat.
 */
export async function cancelConsultAction(appointmentId: string): Promise<{ error?: string }> {
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) return { error: 'Not signed in as a doctor' };

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, child_id, parent_id, doctor_id, status, date, time, ai_summary_id, children(name)')
    .eq('id', appointmentId)
    .eq('doctor_id', doctor.doctorId)
    .maybeSingle<AppointmentForClose>();
  if (!appt || appt.status === 'awaiting_payment') return { error: 'Appointment not found' };
  if (appt.status !== 'upcoming') return refuse(appt.id, 'Only an upcoming consult can be cancelled');

  const { data, error } = await supabase.functions.invoke<{ refund?: string; error?: string }>('consult-payment', {
    body: { action: 'cancel', appointmentId: appt.id },
  });
  if (error) {
    let message = 'Could not cancel the consult. Please try again.';
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* keep the generic message */
      }
    }
    return refuse(appt.id, message);
  }

  const refund = data?.refund;
  const firstName = appt.children?.name?.split(' ')[0];
  const slot = `${formatDayShort(appt.date)}, ${formatSlotTime(appt.time)}`;
  const refundLine =
    refund === 'started'
      ? ' Your payment is being refunded in full; it usually reaches your account in 5 to 7 working days.'
      : refund === 'failed'
        ? ' Your payment will be refunded in full; the clinic team will confirm once it has gone through.'
        : '';
  await messageParent(
    supabase,
    doctor,
    appt,
    `${doctor.name} has had to cancel ${firstName ? `${firstName}'s` : 'your'} consult booked for ${slot}. ` +
      `Sorry for the change.${refundLine} You can book another time in the app, or reply here.`,
    'cancelled',
  );

  revalidatePath('/');
  revalidatePath('/availability');
  revalidatePath(`/consultations/${appt.id}`);
  const who = appt.children?.name ?? 'the patient';
  const note =
    refund === 'started'
      ? 'full refund started'
      : refund === 'failed'
        ? 'refund did not go through yet, clinic team to follow up'
        : 'no payment to refund';
  redirect(`/?closed=${encodeURIComponent(`Consult with ${who} cancelled · ${note}`)}`);
}

/** The error text an edge function returned, or `fallback`. */
async function functionError(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* keep the fallback */
    }
  }
  return fallback;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Doctor moves an upcoming, paid consult to another of their open slots
 * (free). consult-payment `reschedule` runs reschedule_appointment (0051) as
 * the doctor: the old slot re-opens, the payment and the video room stay,
 * the family gets an email and a note in chat.
 */
export async function rescheduleConsultAction(
  appointmentId: string,
  slotId: string,
): Promise<{ error?: string; when?: string }> {
  if (!UUID_RE.test(appointmentId) || !UUID_RE.test(slotId)) return { error: 'Pick a time first.' };
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) return { error: 'Not signed in as a doctor' };

  const { data, error } = await supabase.functions.invoke<{ appointment?: { date: string; time: string } }>(
    'consult-payment',
    { body: { action: 'reschedule', appointmentId, slotId } },
  );
  if (error || !data?.appointment) {
    return refuse(appointmentId, await functionError(error, 'Could not move the consult. Please try again.'));
  }
  revalidatePath('/');
  revalidatePath('/availability');
  revalidatePath(`/consultations/${appointmentId}`);
  return { when: `${formatDayShort(data.appointment.date)}, ${formatSlotTime(data.appointment.time)}` };
}

/**
 * Doctor books a paid follow-up from a completed consult: consult-payment
 * `followup` holds the slot for the family (book_followup, 0051), makes the
 * ₹449 payment link and emails it to the parent. It shows on the calendar
 * as "Follow-up · waiting for payment" until it is paid.
 */
export async function bookFollowupAction(
  appointmentId: string,
  slotId: string,
): Promise<{ error?: string; when?: string; emailed?: boolean }> {
  if (!UUID_RE.test(appointmentId) || !UUID_RE.test(slotId)) return { error: 'Pick a time first.' };
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) return { error: 'Not signed in as a doctor' };

  const { data: slot } = await supabase
    .from('time_slots')
    .select('date, time')
    .eq('id', slotId)
    .maybeSingle<{ date: string; time: string }>();

  const { data, error } = await supabase.functions.invoke<{ appointmentId?: string; emailed?: boolean }>(
    'consult-payment',
    { body: { action: 'followup', appointmentId, slotId } },
  );
  if (error || !data?.appointmentId) {
    return refuse(appointmentId, await functionError(error, 'Could not book the follow-up. Please try again.'));
  }
  revalidatePath('/');
  revalidatePath('/availability');
  revalidatePath(`/consultations/${appointmentId}`);
  return {
    when: slot ? `${formatDayShort(slot.date)}, ${formatSlotTime(slot.time)}` : undefined,
    emailed: data.emailed === true,
  };
}

/**
 * Doctor withdraws a follow-up the family has not paid for yet. Through
 * consult-payment `cancel` so the payment link is cancelled too; the slot
 * re-opens.
 */
export async function cancelFollowupAction(holdId: string): Promise<{ error?: string }> {
  if (!UUID_RE.test(holdId)) return { error: 'Follow-up not found' };
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) return { error: 'Not signed in as a doctor' };

  const { data: hold } = await supabase
    .from('appointments')
    .select('id, status, followup_of')
    .eq('id', holdId)
    .eq('doctor_id', doctor.doctorId)
    .maybeSingle<{ id: string; status: string; followup_of: string | null }>();
  if (!hold || !hold.followup_of) return { error: 'Follow-up not found' };
  if (hold.status !== 'awaiting_payment') return refuse(hold.id, 'This follow-up is no longer waiting for payment.');

  const { error } = await supabase.functions.invoke('consult-payment', {
    body: { action: 'cancel', appointmentId: hold.id },
  });
  if (error) return refuse(hold.id, await functionError(error, 'Could not cancel the follow-up. Please try again.'));

  revalidatePath('/');
  revalidatePath('/availability');
  revalidatePath(`/consultations/${hold.followup_of}`);
  redirect(`/consultations/${hold.followup_of}?followup=cancelled`);
}
