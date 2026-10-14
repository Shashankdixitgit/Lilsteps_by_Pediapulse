import * as SecureStore from 'expo-secure-store';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';

/**
 * In-app "what's new" for the parent: doctor messages not yet read
 * (messages.read_at is null, sender doctor), prescriptions issued since
 * the parent last looked, and visit summaries ready after the doctor closes
 * a consult (R2-12, including a visit closed early). Covers every child of the parent, so a reply for
 * a sibling still lights the bell.
 *
 * There is no "seen" column on prescriptions, so the last-seen state lives on
 * the device (localStorage on web, SecureStore on native), per parent:
 * { seenAt, ids } — everything issued before `seenAt` is old, and `ids` are
 * the newer ones opened one by one. A prescription or visit summary stops
 * being new only when the parent opens it, never just by opening the bell
 * (R2-22).
 */

export interface UnreadThread {
  conversationId: string;
  childId: string;
  childName: string;
  doctorName: string;
  /** Newest unread doctor message. */
  latest: string;
  latestAt: string;
  count: number;
}

export interface NewPrescription {
  id: string;
  childId: string;
  childName: string;
  doctorName: string;
  issuedAt: string;
}

export interface NewVisitSummary {
  /** consultations.id (route /consult/[id]). */
  id: string;
  appointmentId: string | null;
  childId: string;
  childName: string;
  doctorName: string;
  readyAt: string;
}

interface SeenState {
  seenAt: string;
  ids: string[];
}

/** First run on a device: treat the last two weeks as new. */
const FIRST_RUN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function storageKey(userId: string) {
  return `lilsteps.updatesSeen.${userId}`;
}

function webStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls && typeof ls.getItem === 'function' ? ls : null;
  } catch {
    return null;
  }
}

async function readSeen(userId: string): Promise<SeenState> {
  const fallback: SeenState = { seenAt: new Date(Date.now() - FIRST_RUN_WINDOW_MS).toISOString(), ids: [] };
  try {
    const ls = webStorage();
    const raw = ls ? ls.getItem(storageKey(userId)) : await SecureStore.getItemAsync(storageKey(userId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SeenState>;
    return {
      seenAt: typeof parsed.seenAt === 'string' ? parsed.seenAt : fallback.seenAt,
      ids: Array.isArray(parsed.ids) ? parsed.ids.filter((i): i is string => typeof i === 'string') : [],
    };
  } catch {
    return fallback;
  }
}

async function writeSeen(userId: string, state: SeenState) {
  const raw = JSON.stringify(state);
  try {
    const ls = webStorage();
    if (ls) ls.setItem(storageKey(userId), raw);
    else await SecureStore.setItemAsync(storageKey(userId), raw);
  } catch {
    // Not fatal: the item just shows as new again next time.
  }
}

interface MessageJoinRow {
  id: string;
  conversation_id: string;
  content: string;
  created_at: string;
  conversations: {
    child_id: string;
    doctors: { name: string } | null;
    children: { name: string } | null;
  } | null;
}

interface ConsultationJoinRow {
  id: string;
  appointment_id: string | null;
  child_id: string;
  doctor_name: string | null;
  created_at: string;
  children: { name: string } | null;
}

interface PrescriptionJoinRow {
  id: string;
  child_id: string;
  issued_at: string;
  doctors: { name: string } | null;
  children: { name: string } | null;
}

export function useUpdates() {
  const { user } = useAuth();
  const [threads, setThreads] = useState<UnreadThread[]>([]);
  const [prescriptions, setPrescriptions] = useState<NewPrescription[]>([]);
  const [summaries, setSummaries] = useState<NewVisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const userId = user?.id ?? null;

  const fetch = useCallback(async () => {
    if (!userId) {
      setThreads([]);
      setPrescriptions([]);
      setSummaries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const seen = await readSeen(userId);

    const [msgRes, rxRes, visitRes] = await Promise.all([
      supabase
        .from('messages')
        .select('id, conversation_id, content, created_at, conversations!inner(child_id, parent_id, doctors(name), children(name))')
        .eq('sender', 'doctor')
        .is('read_at', null)
        .eq('conversations.parent_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('prescriptions')
        .select('id, child_id, issued_at, doctors(name), children(name)')
        .gt('issued_at', seen.seenAt)
        .order('issued_at', { ascending: false })
        .limit(50),
      // RLS (consultations_select) returns only the parent's own children.
      supabase
        .from('consultations')
        .select('id, appointment_id, child_id, doctor_name, created_at, children(name)')
        .gt('created_at', seen.seenAt)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (!msgRes.error) {
      const byConvo = new Map<string, UnreadThread>();
      for (const m of (msgRes.data ?? []) as unknown as MessageJoinRow[]) {
        const existing = byConvo.get(m.conversation_id);
        if (existing) {
          existing.count += 1;
          continue;
        }
        byConvo.set(m.conversation_id, {
          conversationId: m.conversation_id,
          childId: m.conversations?.child_id ?? '',
          childName: m.conversations?.children?.name ?? '',
          doctorName: m.conversations?.doctors?.name ?? 'Your doctor',
          latest: m.content,
          latestAt: m.created_at,
          count: 1,
        });
      }
      setThreads([...byConvo.values()]);
    }

    if (!rxRes.error) {
      setPrescriptions(
        ((rxRes.data ?? []) as unknown as PrescriptionJoinRow[])
          .filter((p) => !seen.ids.includes(p.id))
          .map((p) => ({
            id: p.id,
            childId: p.child_id,
            childName: p.children?.name ?? '',
            doctorName: p.doctors?.name ?? 'Your doctor',
            issuedAt: p.issued_at,
          })),
      );
    }
    if (!visitRes.error) {
      setSummaries(
        ((visitRes.data ?? []) as unknown as ConsultationJoinRow[])
          .filter((c) => !seen.ids.includes(c.id))
          .map((c) => ({
            id: c.id,
            appointmentId: c.appointment_id,
            childId: c.child_id,
            childName: c.children?.name ?? '',
            doctorName: c.doctor_name ?? 'Your doctor',
            readyAt: c.created_at,
          })),
      );
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // A doctor reply or a new prescription while the app is open. Realtime
  // only delivers rows the parent may read (RLS), so no filter is needed.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`updates:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        fetch();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'prescriptions' }, () => {
        fetch();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetch]);

  /** One item opened (prescription or visit summary): only that one stops being new. */
  const markSeen = useCallback(
    async (id: string) => {
      if (!userId) return;
      const seen = await readSeen(userId);
      if (!seen.ids.includes(id)) await writeSeen(userId, { ...seen, ids: [...seen.ids, id] });
      setPrescriptions((prev) => prev.filter((p) => p.id !== id));
      setSummaries((prev) => prev.filter((v) => v.id !== id));
    },
    [userId],
  );
  /** One prescription opened (Home card, Updates row). */
  const markPrescriptionSeen = markSeen;
  /** One visit summary opened (Updates row). */
  const markSummarySeen = markSeen;

  /** Every prescription and visit summary so far is seen (an explicit "mark all"). */
  const markAllPrescriptionsSeen = useCallback(async () => {
    if (!userId) return;
    await writeSeen(userId, { seenAt: new Date().toISOString(), ids: [] });
  }, [userId]);

  const unreadMessageCount = useMemo(() => threads.reduce((n, t) => n + t.count, 0), [threads]);
  const count = unreadMessageCount + prescriptions.length + summaries.length;

  return {
    threads,
    prescriptions,
    summaries,
    markSummarySeen,
    unreadMessageCount,
    count,
    hasUnread: count > 0,
    loading,
    refetch: fetch,
    markPrescriptionSeen,
    markAllPrescriptionsSeen,
  };
}
