import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { notify } from '@/lib/notify';
import { appointmentEnded } from '@/components/consult/appointmentFormat';

export interface AppointmentRow {
  id: string;
  child_id: string;
  parent_id: string;
  doctor_id: string;
  date: string;
  time: string;
  status: 'upcoming' | 'completed' | 'cancelled' | 'no_show';
  summary_ready: boolean;
  ai_summary_id: string | null;
  /** What the parent typed in "Book a doctor" (0020). */
  concern: string | null;
  meet_link: string | null;
  created_at: string;
  // joined
  doctors?: {
    name: string;
    specialisation: string;
    hospital: string;
    /** Yes/no only; the link itself is private (0035/0036). */
    has_meet_link?: boolean;
    has_google_calendar?: boolean;
  };
  /** The linked check-in (ai_summary_id); only its urgency is read here. */
  checkin_sessions?: { ai_summary: { suggestedUrgency?: string | null } | null } | null;
}

/** True when the linked check-in summary said the child should be seen today. */
export function isUrgentAppointment(a: Pick<AppointmentRow, 'checkin_sessions'>): boolean {
  return a.checkin_sessions?.ai_summary?.suggestedUrgency === 'urgent';
}

/**
 * Tie the child↔doctor chat to a consult, so the doctor sees which booking a
 * message is about (link_conversation_appointment, 0027). Best effort: the
 * chat works either way.
 */
export async function linkConversationToAppointment(conversationId: string, appointmentId: string) {
  await supabase.rpc('link_conversation_appointment', {
    p_conversation_id: conversationId,
    p_appointment_id: appointmentId,
  });
}

/**
 * Ask create-meet-event for a per-consult Meet link, but only when the
 * doctor has connected Google Calendar (doctor_has_google_calendar, 0027).
 * Otherwise the function can only answer 400, so we don't call it and the
 * parent's Join video falls back to doctors.default_meet_link.
 */
async function requestMeetLink(appointmentId: string, doctorId: string) {
  try {
    const { data: connected, error } = await supabase.rpc('doctor_has_google_calendar', {
      p_doctor_id: doctorId,
    });
    if (error || connected !== true) return;
    await supabase.functions.invoke('create-meet-event', { body: { appointmentId } });
  } catch {
    // Logged on the function side; the UI falls back to the default link.
  }
}

export function useAppointments(childId: string | null) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!childId || !user) {
      setLoading(false);
      setAppointments([]);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('appointments')
      .select('*, doctors(name, specialisation, hospital, has_meet_link, has_google_calendar), checkin_sessions(ai_summary)')
      .eq('child_id', childId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setAppointments(data ?? []);
    }
    setLoading(false);
  }, [childId, user]);

  useEffect(() => { fetch(); }, [fetch]);

  async function bookAppointment(data: {
    child_id: string;
    doctor_id: string;
    date: string;
    time: string;
    /** time_slots.id when the caller has it; otherwise looked up by doctor/date/time. */
    slot_id?: string;
    /** checkin_sessions.id — the doctor reads the AI summary through this. */
    ai_summary_id?: string;
    /** Free-text concern from "Book a doctor"; saved to appointments.concern. */
    concern?: string;
  }) {
    if (!user) throw new Error('Not authenticated');

    let slotId = data.slot_id;
    if (!slotId) {
      const { data: slot, error: slotErr } = await supabase
        .from('time_slots')
        .select('id')
        .eq('doctor_id', data.doctor_id)
        .eq('date', data.date)
        .eq('time', data.time)
        .maybeSingle<{ id: string }>();
      if (slotErr) throw new Error(slotErr.message);
      if (!slot) throw new Error('This slot no longer exists.');
      slotId = slot.id;
    }

    // book_slot (0015) checks the child is ours, locks the slot row, fails if
    // it is taken or past, then marks it booked and creates the appointment —
    // all in one transaction, so two parents can never get the same slot.
    const { data: appt, error: err } = await supabase
      .rpc('book_slot', {
        p_slot_id: slotId,
        p_child_id: data.child_id,
        p_ai_summary_id: data.ai_summary_id ?? null,
        p_concern: data.concern?.trim() ? data.concern.trim() : null,
      })
      .single<AppointmentRow>();

    if (err || !appt) throw new Error(err?.message ?? 'Booking failed');

    // Fire-and-forget confirmation SMS to the parent.
    const { data: doctor } = await supabase
      .from('doctors')
      .select('name')
      .eq('id', data.doctor_id)
      .maybeSingle();

    notify({
      channel: 'sms',
      template: 'appointment_confirmation',
      params: {
        doctor: doctor?.name ?? 'your doctor',
        date: data.date,
        time: data.time.slice(0, 5),
      },
      recipient: {
        parent_id: user.id,
        child_id: data.child_id,
        appointment_id: appt.id,
      },
    });

    // Fire-and-forget: a per-appointment Google Meet link via the doctor's
    // connected Calendar. The appointment is booked either way.
    void requestMeetLink(appt.id, data.doctor_id);

    await fetch();
    return appt;
  }

  async function cancelAppointment(appointmentId: string) {
    // The release_appointment_slot trigger (0015) re-opens the time slot.
    const { error: err } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId);

    if (err) throw new Error(err.message);

    await fetch();
  }

  // Still to happen (or in progress): judged on clinic (IST) time, so a
  // consult that ended an hour ago no longer shows as upcoming.
  const upcoming = useMemo(() => {
    const now = new Date();
    return appointments.filter(a => a.status === 'upcoming' && !appointmentEnded(a.date, a.time, now));
  }, [appointments]);

  return { appointments, upcoming, loading, error, bookAppointment, cancelAppointment, refetch: fetch };
}

/** Whether this consult has a video link (per-booking Meet link or the doctor's room). */
export function appointmentHasVideoLink(a: Pick<AppointmentRow, 'meet_link' | 'doctors'>): boolean {
  return !!(a.meet_link?.trim() || a.doctors?.has_meet_link || a.doctors?.has_google_calendar);
}
