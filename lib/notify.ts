/**
 * Client wrapper for the `notify` Supabase Edge Function.
 *
 * Calls are fire-and-forget — if the notification fails, the function logs
 * to `notification_log` with status=failed but the caller's flow isn't
 * blocked. We surface the result so callers can opt-in to surfacing errors
 * via the debug logger if useful.
 */

import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';

export type NotifyChannel = 'sms' | 'whatsapp' | 'email' | 'push';

export interface NotifyRecipient {
  parent_id?: string;
  child_id?: string;
  appointment_id?: string;
  phone?: string;
  email?: string;
  expo_push_token?: string;
}

export async function notify(params: {
  channel: NotifyChannel;
  template: string;
  params?: Record<string, string>;
  recipient: NotifyRecipient;
}) {
  try {
    const { data, error } = await supabase.functions.invoke('notify', {
      body: params,
    });
    if (error) {
      dbg.hook('notify failed', { template: params.template, error: error.message });
      return { ok: false, error: error.message };
    }
    return { ok: true, data };
  } catch (e) {
    dbg.hook('notify exception', e);
    return { ok: false, error: e instanceof Error ? e.message : 'notify failed' };
  }
}
