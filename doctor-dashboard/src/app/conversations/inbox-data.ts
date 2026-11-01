import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchUrgentChildIds } from '@/lib/appointments';
import { CLINIC_TZ, computeAge, formatClock, istDatePlus, todayIst } from '@/lib/format';
import { chatParentLabel } from './parent-label';

type ConversationRow = {
  id: string;
  last_message_at: string;
  children: { id: string; name: string; dob: string } | null;
  parents: { name: string | null; phone: string | null } | null;
};

type MessageLite = {
  conversation_id: string;
  sender: 'parent' | 'doctor';
  content: string;
  read_at: string | null;
  created_at: string;
};

/** One row of the inbox list, ready to render (plain data for the client). */
export type InboxThread = {
  id: string;
  childName: string;
  childAge: string | null;
  parent: string;
  preview: string;
  lastFromDoctor: boolean;
  hasMessages: boolean;
  /** Timestamp of the last message: tells a thread read on screen from one with news since. */
  lastAt: string;
  /** Compact time of the last message: "5:25 pm", "Yesterday", "Thu", "15 Oct". */
  when: string;
  /** Full timestamp for the tooltip. */
  whenTitle: string;
  unread: number;
  urgent: boolean;
  awaitingReply: boolean;
};

/** IST calendar day of a timestamp, YYYY-MM-DD. */
function istDay(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

/** X-style compact time for the list. */
function compactWhen(ts: string): string {
  const day = istDay(ts);
  if (day === todayIst()) return formatClock(ts);
  if (day === istDatePlus(-1)) return 'Yesterday';
  if (day > istDatePlus(-7)) return new Date(ts).toLocaleDateString('en-IN', { weekday: 'short', timeZone: CLINIC_TZ });
  const sameYear = day.slice(0, 4) === todayIst().slice(0, 4);
  return new Date(ts).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: CLINIC_TZ,
  });
}

/** Most recent threads the list shows. */
const THREAD_LIMIT = 100;
/** Recent messages fetched in one go to find each thread's latest. */
const RECENT_MESSAGES = 400;
/** Cap on unread rows counted (the badge shows 99+ beyond that anyway). */
const UNREAD_LIMIT = 2000;

/**
 * The doctor's threads for the inbox list: last message, unread count
 * (parent messages the doctor hasn't opened) and the urgent flag, for the
 * THREAD_LIMIT most recent threads. Urgent
 * threads still waiting on the doctor go first (R2-11): the child has an
 * open visit the AI check-in marked urgent and the parent spoke last. The
 * rest stay most recent first.
 */
export async function loadInbox(
  supabase: SupabaseClient,
  doctorId: string,
): Promise<{ threads: InboxThread[]; error: string | null }> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, last_message_at, children(id, name, dob), parents(name, phone)')
    .eq('doctor_id', doctorId)
    .order('last_message_at', { ascending: false })
    .limit(THREAD_LIMIT)
    .returns<ConversationRow[]>();
  if (error) return { threads: [], error: error.message };

  const rows = data ?? [];
  const ids = rows.map((c) => c.id);
  const childIds = [...new Set(rows.map((c) => c.children?.id).filter((x): x is string => !!x))];
  const none = Promise.resolve({ data: [] as MessageLite[] });
  const [{ data: recent }, { data: unreadRows }, urgentChildren] = await Promise.all([
    // The latest messages across these threads, newest first: the first
    // one seen per thread is its last message.
    ids.length
      ? supabase
          .from('messages')
          .select('conversation_id, sender, content, read_at, created_at')
          .in('conversation_id', ids)
          .order('created_at', { ascending: false })
          .limit(RECENT_MESSAGES)
          .returns<MessageLite[]>()
      : none,
    // Unread = parent messages the doctor hasn't opened; only the thread id
    // is fetched.
    ids.length
      ? supabase
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', ids)
          .eq('sender', 'parent')
          .is('read_at', null)
          .limit(UNREAD_LIMIT)
          .returns<{ conversation_id: string }[]>()
      : Promise.resolve({ data: [] as { conversation_id: string }[] }),
    // Threads whose child has an open visit the AI check-in marked urgent.
    fetchUrgentChildIds(supabase, doctorId, childIds, todayIst()),
  ]);
  const lastByConvo = new Map<string, MessageLite>();
  (recent ?? []).forEach((m) => {
    if (!lastByConvo.has(m.conversation_id)) lastByConvo.set(m.conversation_id, m);
  });
  // Older, quiet threads can fall outside that window: one newest-message
  // lookup each (rare, and bounded by THREAD_LIMIT).
  const missing = ids.filter((id) => !lastByConvo.has(id));
  if (missing.length && (recent ?? []).length >= RECENT_MESSAGES) {
    const extra = await Promise.all(
      missing.map((id) =>
        supabase
          .from('messages')
          .select('conversation_id, sender, content, read_at, created_at')
          .eq('conversation_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle<MessageLite>(),
      ),
    );
    extra.forEach(({ data: m }) => {
      if (m) lastByConvo.set(m.conversation_id, m);
    });
  }
  const unreadByConvo = new Map<string, number>();
  (unreadRows ?? []).forEach((m) =>
    unreadByConvo.set(m.conversation_id, (unreadByConvo.get(m.conversation_id) ?? 0) + 1),
  );

  const threads = rows.map<InboxThread>((c) => {
    const last = lastByConvo.get(c.id);
    const urgent = !!c.children && urgentChildren.has(c.children.id);
    const ts = last?.created_at ?? c.last_message_at;
    return {
      id: c.id,
      childName: c.children?.name ?? 'Unknown',
      // Age tells apart two children with the same name.
      childAge: c.children?.dob ? computeAge(c.children.dob) : null,
      parent: chatParentLabel(c.parents),
      preview: last ? last.content.replace(/\s+/g, ' ').slice(0, 160) : 'No messages yet',
      lastFromDoctor: last?.sender === 'doctor',
      hasMessages: !!last,
      lastAt: ts,
      when: compactWhen(ts),
      whenTitle: new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: CLINIC_TZ }),
      unread: unreadByConvo.get(c.id) ?? 0,
      urgent,
      awaitingReply: last?.sender === 'parent',
    };
  });
  // Stable sort: urgent-and-waiting first, the rest keep the query order.
  const first = (t: InboxThread) => Number(t.urgent && t.awaitingReply);
  threads.sort((a, b) => first(b) - first(a));
  return { threads, error: null };
}
