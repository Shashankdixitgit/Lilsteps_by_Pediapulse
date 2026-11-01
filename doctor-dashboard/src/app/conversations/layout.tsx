import { redirect } from 'next/navigation';
import { getCurrentDoctor } from '@/lib/doctor';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadInbox } from './inbox-data';
import { InboxList } from './inbox-list';
import { InboxRealtime } from './inbox-realtime';
import { InboxShell } from './inbox-shell';

/**
 * Messages, as two panes (the feel of X's DMs): the conversation list on the
 * left stays put while the open thread changes on the right. On a phone only
 * one pane shows at a time: the list at /conversations, the thread at
 * /conversations/[id] with a back arrow.
 */
export default async function ConversationsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const doctor = await getCurrentDoctor(supabase);
  if (!doctor) redirect('/login');

  const { threads, error } = await loadInbox(supabase, doctor.doctorId);

  return (
    <InboxShell list={<InboxList threads={threads} error={error} />}>
      <InboxRealtime />
      {children}
    </InboxShell>
  );
}
