import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** What happened to the money for a cancelled consult, in parent words. */
export type RefundState = 'refunded' | 'started' | 'none' | 'not_paid';

/** payments.status (0045) → what the parent is told. */
function refundStateOf(statuses: string[]): RefundState {
  if (statuses.includes('refunded')) return 'refunded';
  if (statuses.some((s) => s === 'refund_pending' || s === 'refund_due' || s === 'refund_failed')) return 'started';
  // Paid and kept: cancelled under 2 hours before the start (refund policy).
  if (statuses.includes('paid')) return 'none';
  return 'not_paid';
}

/** "Cancelled · refund started" etc. for the Past list. */
export function cancelledStatusLabel(state: RefundState | undefined): string {
  switch (state) {
    case 'refunded':
      return 'Cancelled · refunded';
    case 'started':
      return 'Cancelled · refund started';
    case 'none':
      return 'Cancelled · no refund';
    default:
      return 'Cancelled';
  }
}

/**
 * Refund state per cancelled appointment id, read from this parent's own
 * payments rows (payments_select_own, 0045). Missing = still loading or no
 * payment (shown as plain "Cancelled").
 */
export function useRefundStatus(appointmentIds: string[]): Map<string, RefundState> {
  const key = [...appointmentIds].sort().join(',');
  const [map, setMap] = useState<Map<string, RefundState>>(new Map());
  useEffect(() => {
    if (!key) {
      setMap(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('payments')
        .select('appointment_id, status')
        .in('appointment_id', key.split(','));
      if (cancelled || !data) return;
      const byAppt = new Map<string, string[]>();
      for (const row of data as { appointment_id: string; status: string }[]) {
        byAppt.set(row.appointment_id, [...(byAppt.get(row.appointment_id) ?? []), row.status]);
      }
      const next = new Map<string, RefundState>();
      for (const id of key.split(',')) next.set(id, refundStateOf(byAppt.get(id) ?? []));
      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);
  return map;
}
