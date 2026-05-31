import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { notify } from '@/lib/notify';

export interface AppointmentRow {
  id: string;
  child_id: string;
  parent_id: string;
  doctor_id: string;
  date: string;
  time: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  summary_ready: boolean;
  ai_summary_id: string | null;
  created_at: string;
  // joined
  doctors?: { name: string; specialisation: string; hospital: string };
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
      .select('*, doctors(name, specialisation, hospital)')
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
    ai_summary_id?: string;
  }) {
    if (!user) throw new Error('Not authenticated');

    // Mark the time slot as unavailable FIRST to prevent double-booking
    const { error: slotErr } = await supabase
      .from('time_slots')
      .update({ is_available: false })
      .eq('doctor_id', data.doctor_id)
      .eq('date', data.date)
      .eq('time', data.time)
      .eq('is_available', true); // Only update if still available

    if (slotErr) throw new Error(`Slot no longer available: ${slotErr.message}`);

    const { data: appt, error: err } = await supabase
      .from('appointments')
      .insert({
        child_id: data.child_id,
        parent_id: user.id,
        doctor_id: data.doctor_id,
        date: data.date,
        time: data.time,
        status: 'upcoming',
        summary_ready: !!data.ai_summary_id,
        ai_summary_id: data.ai_summary_id ?? null,
      })
      .select()
      .single();

    if (err) {
      // Rollback: re-open the slot since booking failed
      await supabase
        .from('time_slots')
        .update({ is_available: true })
        .eq('doctor_id', data.doctor_id)
        .eq('date', data.date)
        .eq('time', data.time);
      throw new Error(err.message);
    }

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

    // Fire-and-forget — create a per-appointment Google Meet link via the
    // doctor's connected Calendar. If the doctor hasn't connected Google
    // (or anything else fails), the appointment is still booked and the
    // parent's Join video button falls back to doctors.default_meet_link.
    supabase.functions
      .invoke('create-meet-event', { body: { appointmentId: appt.id } })
      .catch(() => {
        /* logged on the function side; UI falls back to default link */
      });

    await fetch();
    return appt;
  }

  async function cancelAppointment(appointmentId: string) {
    // Find the appointment first to re-open the slot
    const appt = appointments.find(a => a.id === appointmentId);

    const { error: err } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId);

    if (err) throw new Error(err.message);

    // Re-open the time slot
    if (appt) {
      await supabase
        .from('time_slots')
        .update({ is_available: true })
        .eq('doctor_id', appt.doctor_id)
        .eq('date', appt.date)
        .eq('time', appt.time);
    }

    await fetch();
  }

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return appointments.filter(a => a.status === 'upcoming' && a.date >= today);
  }, [appointments]);

  return { appointments, upcoming, loading, error, bookAppointment, cancelAppointment, refetch: fetch };
}
