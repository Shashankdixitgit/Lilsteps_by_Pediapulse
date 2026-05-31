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

  // Notify the parent. Fire-and-forget — don't block the UI on it.
  const { data: convo } = await supabase
    .from('conversations')
    .select('parent_id, doctors(name)')
    .eq('id', conversationId)
    .maybeSingle<{ parent_id: string; doctors: { name: string } | null }>();

  if (convo) {
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
