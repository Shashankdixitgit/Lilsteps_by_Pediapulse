'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function sendMessageAction(
  conversationId: string,
  content: string,
): Promise<{ error?: string }> {
  const trimmed = content.trim();
  if (!trimmed) return { error: 'Empty message' };
  if (trimmed.length > 4000) return { error: 'Message too long' };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender: 'doctor',
    sender_id: user.id,
    content: trimmed,
  });

  if (error) return { error: error.message };

  // Notify the parent. Fire-and-forget — don't block the UI on it. One SMS
  // per burst: skip it when the doctor already wrote in this thread in the
  // last 10 minutes (that message's SMS already brought the parent here).
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const [{ data: convo }, { count: recent }] = await Promise.all([
    supabase
      .from('conversations')
      .select('parent_id, doctors(name)')
      .eq('id', conversationId)
      .maybeSingle<{ parent_id: string; doctors: { name: string } | null }>(),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('sender', 'doctor')
      .gte('created_at', since),
  ]);

  // `recent` includes the message just sent.
  if (convo && (recent ?? 0) <= 1) {
    supabase.functions
      .invoke('notify', {
        body: {
          channel: 'sms',
          template: 'new_message',
          params: { doctor: convo.doctors?.name ?? 'your doctor' },
          recipient: { parent_id: convo.parent_id },
        },
      })
      .catch(() => {
        /* notify failures are logged in notification_log; don't fail the send */
      });
  }

  revalidatePath(`/conversations/${conversationId}`);
  return {};
}

/**
 * Marks the parent's messages in this thread read. The page does this when it
 * renders, but a message that arrives while the thread is open (realtime
 * refresh) needs it too, or the unread badge counts a message already on screen.
 */
export async function markThreadReadAction(conversationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('sender', 'parent')
    .is('read_at', null);
}
