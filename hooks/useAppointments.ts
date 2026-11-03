import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { appointmentEnded } from '@/components/consult/appointmentFormat';
import { type CancelOutcome, cancelConsult } from '@/lib/consultPayment';

export interface AppointmentRow {
  id: string;
  child_id: string;
  parent_id: string;
  doctor_id: string;
  date: string;
  time: string;
  /** 'awaiting_payment': hold_slot holds the slot until the consult is paid (0045). */
  status: 'awaiting_payment' | 'upcoming' | 'completed' | 'cancelled' | 'no_show';
  /** Until when an unpaid booking holds its slot. */
  hold_expires_at?: string | null;
  /** Why it was cancelled: 'payment_expired' = an unpaid hold that ran out. */
  cancel_reason?: 'payment_expired' | 'parent' | 'doctor' | null;
  summary_ready: boolean;
  ai_summary_id: string | null;
  /** What the parent typed in "Book a doctor" (0020). */
  concern: string | null;
  meet_link: string | null;
  created_at: string;
  /** Times this consult was moved with Reschedule (0051, max 3). */
  reschedule_count?: number;
  /** Booked with a Care Plan consult instead of ₹449 (0053). */
  paid_with_plan?: boolean;
  /** Set on a follow-up the doctor booked (0051): the earlier visit it comes from. */
  followup_of?: string | null;
  // joined
  doctors?: {
    name: string;
    specialisation: string;
    hospital: string;
    /** Identification headshot (doctors.avatar_url), or null. */
    avatar_url?: string | null;
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

export function useAppointments(childId: string | null) {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  /**
   * Bookings still waiting for this family to pay, while their hold lasts:
   * the parent's own unfinished payments (hold_slot, 0045) and follow-ups
   * the doctor booked (0051, followup_of set). Shown with "Finish paying".
   */
  const [paymentDue, setPaymentDue] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!childId || !user) {
      setLoading(false);
      setAppointments([]);
      setPaymentDue([]);
      return;
    }
    setLoading(true);
    setError(null);

    const select = '*, doctors(name, specialisation, hospital, avatar_url, has_meet_link, has_google_calendar), checkin_sessions(ai_summary)';
    const [{ data, error: err }, { data: due }] = await Promise.all([
      supabase
        .from('appointments')
        .select(select)
        .eq('child_id', childId)
        // Unpaid holds, and holds that ran out unpaid, are not bookings yet.
        .neq('status', 'awaiting_payment')
        .or('cancel_reason.is.null,cancel_reason.neq.payment_expired')
        .order('date', { ascending: true })
        .order('time', { ascending: true }),
      // Unpaid holds (the parent's own, and follow-ups the doctor booked):
      // the family sees them (with Pay) until they are paid or run out.
      supabase
        .from('appointments')
        .select(select)
        .eq('child_id', childId)
        .eq('status', 'awaiting_payment')
        .gt('hold_expires_at', new Date().toISOString())
        .order('date', { ascending: true })
        .order('time', { ascending: true }),
    ]);

    if (err) {
      setError(err.message);
    } else {
      setAppointments(data ?? []);
      setPaymentDue((due as AppointmentRow[] | null) ?? []);
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

    // hold_slot (0045) checks the child is ours, locks the slot row, fails
    // if it is taken or past, then holds it and creates the booking as
    // 'awaiting_payment' — all in one transaction, so two parents can never
    // get the same slot. Calling it again for a slot this parent already
    // holds returns that hold. The caller takes the payment next; the server
    // sends the confirmation SMS and makes the Meet link once it is paid.
    // (book_slot now only tells old app builds to update.)
    const { data: appt, error: err } = await supabase
      .rpc('hold_slot', {
        p_slot_id: slotId,
        p_child_id: data.child_id,
        p_ai_summary_id: data.ai_summary_id ?? null,
        p_concern: data.concern?.trim() ? data.concern.trim() : null,
      })
      .single<AppointmentRow>();

    if (err || !appt) throw new Error(err?.message ?? 'Booking failed');
    return appt;
  }

  /**
   * Through consult-payment, which refunds a paid consult cancelled 2 h or
   * more before the start. The release_appointment_slot trigger (0015)
   * re-opens the time slot.
   */
  async function cancelAppointment(appointmentId: string): Promise<CancelOutcome> {
    const result = await cancelConsult(appointmentId);
    await fetch();
    return result;
  }

  // Still to happen (or in progress): judged on clinic (IST) time, so a
  // consult that ended an hour ago no longer shows as upcoming.
  const upcoming = useMemo(() => {
    const now = new Date();
    return appointments.filter(a => a.status === 'upcoming' && !appointmentEnded(a.date, a.time, now));
  }, [appointments]);

  return { appointments, upcoming, paymentDue, loading, error, bookAppointment, cancelAppointment, refetch: fetch };
}

/** Whether this consult has a video link (per-booking Meet link or the doctor's room). */
export function appointmentHasVideoLink(a: Pick<AppointmentRow, 'meet_link' | 'doctors'>): boolean {
  return !!(a.meet_link?.trim() || a.doctors?.has_meet_link || a.doctors?.has_google_calendar);
}
