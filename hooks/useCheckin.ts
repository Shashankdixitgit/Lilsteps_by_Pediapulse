import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import {
  AiCheckinError,
  chatCompletion,
  generateSummary,
  GroqMessage,
  type CheckinSummary,
  type SupportLevel,
} from '@/lib/groq';
import type { ChildWithDetails } from './useChildren';
import { formatAge } from '@/constants/bracketConfig';

export interface CheckinMessage {
  id: string;
  role: 'ai' | 'user';
  content: string;
  /** Pre-filled response options parsed from AI message (AI questions with [QUICK_OPTIONS: ...]) */
  quickOptions?: string[];
  /** A parent answer that didn't reach the assistant (shown as "Not sent"). */
  failed?: boolean;
  /**
   * Set on the AI reply that first saw a mental-health concern (or the first
   * that saw a crisis): the support card shows right after it (C2).
   */
  support?: SupportLevel;
}

/** What the Retry button repeats. */
export type CheckinFailure =
  | { kind: 'start'; text: string }
  | { kind: 'resume'; sessionId: string }
  | { kind: 'send'; text: string }
  | { kind: 'summary' };

/** Network / edge-function failures never show raw error text. */
const SEND_ERROR = "Couldn't reach LilSteps. Check your internet and try again.";
const SUMMARY_ERROR = "Couldn't make the summary. Check your internet and try again.";
/**
 * LilSteps was reached but the assistant couldn't answer (R2-03): never
 * blame the parent's internet, and keep 112 in view.
 */
const unavailableText = (childName: string) =>
  `The assistant couldn't answer just now. If ${childName} seems very unwell, call 112.`;
const SUMMARY_UNAVAILABLE = "The assistant couldn't make the summary just now. Please try again in a moment.";
const RESUME_ERROR = "Couldn't open your check-in. Check your internet and try again.";
/** The child's profile (or the sign-in) hasn't loaded yet (C2). */
const NOT_READY_ERROR = "Couldn't load your child's profile. Check your internet and try again.";

/**
 * The server's friendly text (rate limit, assistant busy); `unavailable` when
 * the server was reached but the assistant failed; else `fallback` (network).
 */
function errorText(e: unknown, fallback: string, unavailable: string): string {
  if (e instanceof AiCheckinError) {
    if (e.userMessage) return e.userMessage;
    if (e.code === 'unavailable') return unavailable;
    return fallback;
  }
  // Not an ai-checkin failure: a database save or an unreadable summary.
  return e instanceof Error && /Failed to parse AI summary/.test(e.message) ? unavailable : fallback;
}

/** An AI reply still waiting for an answer: a question, or answer chips. */
function hasOpenQuestion(clean: string, quickOptions: string[]): boolean {
  return quickOptions.length > 0 || clean.includes('?');
}

const SUPPORT_RANK: Record<SupportLevel, number> = { concern: 1, crisis: 2 };

/** An in-progress check-in older than this is not offered again. */
const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

// Marker the AI uses to signal it has enough info
const CHECKIN_COMPLETE_MARKER = '[CHECKIN_COMPLETE]';
// Marker for quick reply options
const QUICK_OPTIONS_REGEX = /\[QUICK_OPTIONS:\s*([^\]]+)\]/;
// Danger signs the edge function found so far (C3): "[DANGER_SIGNS: a | b]".
const DANGER_SIGNS_REGEX = /\[DANGER_SIGNS:\s*([^\]]*)\]/;
// Their level (R3-03): "[DANGER_LEVEL: emergency]" or "[DANGER_LEVEL: urgent]".
const DANGER_LEVEL_REGEX = /\[DANGER_LEVEL:\s*([^\]]*)\]/;

/**
 * 'emergency': a fit, blue lips or skin, can't be woken or severe breathing
 * difficulty: call 112 / go to hospital now. 'urgent': be seen today.
 * Pending Dr Atish sign-off (C5).
 */
export type DangerLevel = 'emergency' | 'urgent';

/**
 * Answer chips for a saved question (R3-21). Chips aren't stored with the
 * message, so a resumed check-in re-reads them: from a [QUICK_OPTIONS] marker
 * if the text still has one, else from the question itself, using the same
 * standard sets the assistant is told to use. Empty when it can't tell (the
 * parent types the answer).
 */
export function quickOptionsFor(text: string): string[] {
  const marker = text.match(QUICK_OPTIONS_REGEX);
  if (marker) return splitQuickOptions(marker[1]);
  const questions = text.split(/(?<=[.!?])\s+|\n+/).filter((x) => x.trim().endsWith('?'));
  const q = questions[questions.length - 1]?.trim().toLowerCase();
  if (!q) return [];
  if (/how long|since when|when did (it|this|the|they|he|she)/.test(q)) {
    return ['Just started', 'Since yesterday', '2-3 days', 'A week or more'];
  }
  if (/how (high|much) (is|was) (the|his|her|their) (fever|temperature)|what (is|was) (the|his|her|their) temperature/.test(q)) {
    return ['Below 100°F', '100-101°F', '101-103°F', 'Above 103°F'];
  }
  if (/how (bad|severe|strong)/.test(q)) return ['Mild', 'Moderate', 'Severe'];
  // A yes/no question about one thing (not "is it dry or wet?", not "can you tell me...").
  if (/^(can|could) you (tell|describe|share)/.test(q)) return [];
  if (/^(is|are|does|do|did|has|have|can|could|was|were|will|would)\b/.test(q) && !/\s(or|ya)\s/.test(q)) {
    return ['Yes', 'No', 'Not sure'];
  }
  // The same in Hinglish ("Kya Aarav theek se kha raha hai?").
  if (/^kya\b/.test(q) && !/\s(or|ya)\s/.test(q)) return ['Haan', 'Nahi', 'Pata nahi'];
  return [];
}

/**
 * Rows for checkin_messages with explicit, strictly increasing created_at
 * (C1). The parent's answer and the assistant's reply used to share one
 * default now(), so a resumed chat (and the doctor's copy) came back in
 * random order. Each row is 1 ms after the previous one.
 */
function timedRows(sessionId: string, rows: { role: 'user' | 'ai'; content: string }[]) {
  const t0 = Date.now();
  return rows.map((r, i) => ({ session_id: sessionId, ...r, created_at: new Date(t0 + i).toISOString() }));
}

/**
 * Oldest first. Rows saved before C1 can share a created_at: the parent's
 * message then comes before the reply (same rule as the doctor dashboard).
 */
function byTimeThenParentFirst(a: { created_at: string; role: string }, b: { created_at: string; role: string }) {
  const t = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (t !== 0 && !Number.isNaN(t)) return t;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return (a.role === 'user' ? 0 : 1) - (b.role === 'user' ? 0 : 1);
}

/**
 * Options are '|'-separated ("Yes, allergy symptoms too | No"), so an option
 * may contain a comma. Older replies used commas; fall back to ',' only when
 * there is no '|' at all. Duplicates are dropped (they'd share a React key).
 */
export function splitQuickOptions(raw: string): string[] {
  const parts = raw.includes('|') ? raw.split('|') : raw.split(',');
  return Array.from(new Set(parts.map((o) => o.trim()).filter(Boolean)));
}

let msgIdCounter = 0;
function nextMsgId(role: 'ai' | 'user'): string {
  return `msg-${role}-${Date.now()}-${++msgIdCounter}`;
}

export function useCheckin(child: ChildWithDetails | null) {
  const { user } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CheckinMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [summary, setSummary] = useState<CheckinSummary | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<CheckinFailure | null>(null);
  const sendingRef = useRef(false);
  // Highest mental-health level seen in this check-in (C2).
  const [support, setSupport] = useState<SupportLevel | null>(null);
  const supportRef = useRef<SupportLevel | null>(null);
  // The assistant sent [CHECKIN_COMPLETE] with a question still open; the
  // next reply without a question counts as the end.
  const completeSeenRef = useRef(false);
  // Danger signs reported so far (C3): the chat keeps a Call 112 card up.
  const [dangerSigns, setDangerSigns] = useState<string[]>([]);
  // Their highest level (R3-03); 'emergency' never drops back to 'urgent'.
  const [dangerLevel, setDangerLevel] = useState<DangerLevel | null>(null);
  const dangerLevelRef = useRef<DangerLevel | null>(null);

  function getChildContext() {
    if (!child) throw new Error('No child selected');
    // children.allergies_not_known may not exist yet (added with R3-05);
    // read it defensively.
    const notKnownFlag = (child as { allergies_not_known?: unknown }).allergies_not_known === true;
    const dob = new Date(child.dob);
    const ageDays = Number.isNaN(dob.getTime())
      ? undefined
      : Math.max(0, Math.floor((Date.now() - dob.getTime()) / 86_400_000));
    return {
      name: child.name,
      age: formatAge(child.dob),
      ageDays,
      weight: child.weight ?? undefined,
      height: child.height ?? undefined,
      allergies: child.allergies.map(a => a.name),
      // The edge function shows "Not known yet" instead of "None known".
      allergiesNotKnown: notKnownFlag && child.allergies.length === 0,
      conditions: child.conditions.map(c => c.name),
      medications: child.medications.map(m => ({
        name: m.name,
        dosage: m.dosage ?? undefined,
        frequency: m.frequency ?? undefined,
      })),
    };
  }

  function parseAiResponse(response: string): { clean: string; ready: boolean; quickOptions: string[] } {
    const marker = response.includes(CHECKIN_COMPLETE_MARKER);
    // Extract quick options before stripping markers
    const optionsMatch = response.match(QUICK_OPTIONS_REGEX);
    const quickOptions = optionsMatch ? splitQuickOptions(optionsMatch[1]) : [];
    const dangerMatch = response.match(DANGER_SIGNS_REGEX);
    if (dangerMatch) {
      const signs = dangerMatch[1].split('|').map((x) => x.trim()).filter(Boolean);
      // Never cleared within a check-in: once reported, the card stays.
      if (signs.length > 0) setDangerSigns((prev) => Array.from(new Set([...prev, ...signs])));
    }
    const levelMatch = response.match(DANGER_LEVEL_REGEX);
    const level = levelMatch?.[1].trim();
    if ((level === 'emergency' || level === 'urgent') && dangerLevelRef.current !== 'emergency') {
      dangerLevelRef.current = level;
      setDangerLevel(level);
    }
    // Strip the markers from the displayed (and saved) text
    const clean = response
      .replace(CHECKIN_COMPLETE_MARKER, '')
      .replace(QUICK_OPTIONS_REGEX, '')
      .replace(DANGER_SIGNS_REGEX, '')
      .replace(DANGER_LEVEL_REGEX, '')
      .trim();
    const text = clean || 'I have everything I need. Ready to generate a summary.';
    // "Generate summary" never shows while a question is still open.
    if (marker) completeSeenRef.current = true;
    const ready = (marker || completeSeenRef.current) && !hasOpenQuestion(text, quickOptions);
    return { clean: text, ready, quickOptions };
  }

  /** Records a higher support level; returns it when this reply raised it. */
  function raiseSupport(level: SupportLevel | null, sid: string): SupportLevel | undefined {
    if (!level) return undefined;
    const prev = supportRef.current;
    if (prev && SUPPORT_RANK[prev] >= SUPPORT_RANK[level]) return undefined;
    supportRef.current = level;
    setSupport(level);
    // Saved so the card comes back when the check-in is reopened.
    void supabase.from('checkin_sessions').update({ support_level: level }).eq('id', sid);
    return level;
  }

  function toGroq(list: CheckinMessage[]): GroqMessage[] {
    return list.map(m => ({
      role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.content,
    }));
  }

  /**
   * Opens a check-in. Reuses `existingSessionId` (a retry, or a resumed
   * session with no answers yet) instead of creating a second row.
   */
  async function startCheckin(initialComplaint: string, existingSessionId?: string) {
    if (!user || !child) {
      // Shown with Retry; the screen waits for the child before calling.
      setError(NOT_READY_ERROR);
      setFailed({ kind: 'start', text: initialComplaint });
      throw new Error('Not ready');
    }
    setLoading(true);
    setError(null);
    setFailed(null);
    const userMsg: CheckinMessage = { id: nextMsgId('user'), role: 'user', content: initialComplaint };
    setMessages([userMsg]);

    try {
      let sid = existingSessionId ?? sessionId;
      if (!sid) {
        const { data: session, error: err } = await supabase
          .from('checkin_sessions')
          .insert({
            child_id: child.id,
            parent_id: user.id,
            initial_complaint: initialComplaint,
            status: 'in_progress',
          })
          .select()
          .single();
        if (err) throw new Error(err.message);
        sid = session.id as string;
      }
      setSessionId(sid);

      // System prompt is server-side.
      const reply = await chatCompletion(getChildContext(), [{ role: 'user', content: initialComplaint }]);
      const { clean, ready, quickOptions } = parseAiResponse(reply.content);
      const raised = raiseSupport(reply.support, sid);

      // Saved only once the assistant replied, so a retry never doubles it.
      await supabase.from('checkin_messages').insert(
        timedRows(sid, [
          { role: 'user', content: initialComplaint },
          { role: 'ai', content: clean },
        ]),
      );

      setMessages([userMsg, { id: nextMsgId('ai'), role: 'ai', content: clean, quickOptions, support: raised }]);
      setQuestionCount(1);
      setAiReady(ready);
      return clean;
    } catch (e) {
      setMessages([{ ...userMsg, failed: true }]);
      setError(errorText(e, SEND_ERROR, unavailableText(child.name)));
      setFailed({ kind: 'start', text: initialComplaint });
      throw e;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Re-opens an in_progress session (under 24 h old) with its saved
   * messages. Quick-reply chips are not stored, so the last question's chips
   * are worked out again from its text (quickOptionsFor, R3-21).
   */
  async function resumeCheckin(resumeId: string) {
    if (!user || !child) {
      setError(NOT_READY_ERROR);
      setFailed({ kind: 'resume', sessionId: resumeId });
      throw new Error('Not ready');
    }
    setLoading(true);
    setError(null);
    setFailed(null);
    try {
      const { data: session, error: sErr } = await supabase
        .from('checkin_sessions')
        .select('id, initial_complaint, status, support_level')
        .eq('id', resumeId)
        .maybeSingle<{ id: string; initial_complaint: string; status: string; support_level: SupportLevel | null }>();
      if (sErr || !session) throw new Error(sErr?.message ?? 'Check-in not found');

      const { data: rows, error: mErr } = await supabase
        .from('checkin_messages')
        .select('role, content, created_at')
        .eq('session_id', resumeId)
        .order('created_at', { ascending: true });
      if (mErr) throw new Error(mErr.message);

      const ordered = ((rows ?? []) as { role: string; content: string; created_at: string }[])
        .slice()
        .sort(byTimeThenParentFirst);
      const saved: CheckinMessage[] = ordered.map((r) => ({
        id: nextMsgId(r.role === 'ai' ? 'ai' : 'user'),
        role: r.role === 'ai' ? 'ai' : 'user',
        content: r.content,
      }));
      setSessionId(session.id);
      setLoading(false);
      // Bring back the support card (C2) on the last reply.
      if (session.support_level) {
        supportRef.current = session.support_level;
        setSupport(session.support_level);
        const lastAi = saved.map((m) => m.role).lastIndexOf('ai');
        if (lastAi >= 0) saved[lastAi] = { ...saved[lastAi], support: session.support_level };
      }

      if (saved.length === 0) {
        // The first reply never arrived: ask again.
        await startCheckin(session.initial_complaint, session.id).catch(() => {});
        return;
      }
      const last = saved[saved.length - 1];
      setQuestionCount(saved.filter((m) => m.role === 'ai').length);
      if (last.role === 'user') {
        // The parent's last answer has no reply yet: resend it.
        setMessages(saved.slice(0, -1));
        await sendMessage(last.content, {
          history: saved.slice(0, -1),
          alreadySaved: true,
          sessionId: session.id,
        }).catch(() => {});
        return;
      }
      // The completion marker isn't stored; a closing message has no question.
      const open = last.content.includes('?');
      setMessages(open ? [...saved.slice(0, -1), { ...last, quickOptions: quickOptionsFor(last.content) }] : saved);
      setAiReady(!open);
    } catch (e) {
      setError(RESUME_ERROR);
      setFailed({ kind: 'resume', sessionId: resumeId });
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(
    content: string,
    opts: { history?: CheckinMessage[]; alreadySaved?: boolean; sessionId?: string } = {},
  ) {
    // resumeCheckin passes the id: state set in the same tick isn't read yet.
    const sid = opts.sessionId ?? sessionId;
    if (!sid) throw new Error('No active session');
    if (!child) throw new Error('No child selected');
    if (sendingRef.current) return; // prevent double-send
    sendingRef.current = true;
    setLoading(true);
    setError(null);
    setFailed(null);

    // A failed answer is replaced, not repeated, when the parent retries
    // or types something new.
    const base = (opts.history ?? messages).filter(m => !m.failed);
    const userMsg: CheckinMessage = { id: nextMsgId('user'), role: 'user', content };
    const updatedMessages = [...base, userMsg];
    setMessages(updatedMessages);

    try {
      const reply = await chatCompletion(getChildContext(), toGroq(updatedMessages));
      const { clean, ready, quickOptions } = parseAiResponse(reply.content);
      const raised = raiseSupport(reply.support, sid);

      await supabase.from('checkin_messages').insert(
        timedRows(sid, [
          ...(opts.alreadySaved ? [] : [{ role: 'user' as const, content }]),
          { role: 'ai', content: clean },
        ]),
      );

      const aiMsg: CheckinMessage = { id: nextMsgId('ai'), role: 'ai', content: clean, quickOptions, support: raised };
      setMessages([...updatedMessages, aiMsg]);
      setQuestionCount(prev => prev + 1);
      setAiReady(ready);
      return clean;
    } catch (e) {
      setMessages(updatedMessages.map(m => (m.id === userMsg.id ? { ...m, failed: true } : m)));
      setError(errorText(e, SEND_ERROR, unavailableText(child.name)));
      setFailed({ kind: 'send', text: content });
      throw e;
    } finally {
      sendingRef.current = false;
      setLoading(false);
    }
  }

  async function generateCheckinSummary() {
    if (!sessionId || !child) throw new Error('No active session');
    setLoading(true);
    setError(null);
    setFailed(null);

    try {
      const generated = await generateSummary(getChildContext(), toGroq(messages.filter(m => !m.failed)));
      // R3-03: an emergency sign in this chat (the server also sets it on the
      // summary it returns; lib/groq.ts may not pass it through).
      const result: StoredCheckinSummary = {
        ...generated,
        emergencyNow:
          (generated as { emergencyNow?: unknown }).emergencyNow === true || dangerLevelRef.current === 'emergency',
      };
      setSummary(result);

      // Save summary to DB. The summary screen and the doctor both read it
      // from this row, so a failed save is a failed summary.
      const { error: saveErr } = await supabase
        .from('checkin_sessions')
        .update({ status: 'summary_generated', ai_summary: result })
        .eq('id', sessionId);
      if (saveErr) throw new Error(saveErr.message);

      return result;
    } catch (e) {
      setError(errorText(e, SUMMARY_ERROR, SUMMARY_UNAVAILABLE));
      setFailed({ kind: 'summary' });
      throw e;
    } finally {
      setLoading(false);
    }
  }

  /** Repeats the chat call that failed (start, resume or answer). */
  async function retryLast() {
    if (!failed) return;
    if (failed.kind === 'start') await startCheckin(failed.text);
    else if (failed.kind === 'resume') await resumeCheckin(failed.sessionId);
    else if (failed.kind === 'send') await sendMessage(failed.text);
  }

  function reset() {
    setSessionId(null);
    setMessages([]);
    setLoading(false);
    setAiReady(false);
    setSummary(null);
    setQuestionCount(0);
    setError(null);
    setFailed(null);
    setSupport(null);
    setDangerSigns([]);
    setDangerLevel(null);
    dangerLevelRef.current = null;
    supportRef.current = null;
    completeSeenRef.current = false;
    sendingRef.current = false;
  }

  return {
    sessionId,
    messages,
    loading,
    aiReady,
    summary,
    questionCount,
    error,
    failed,
    support,
    dangerSigns,
    dangerLevel,
    startCheckin,
    resumeCheckin,
    sendMessage,
    generateCheckinSummary,
    retryLast,
    reset,
  };
}

/**
 * A saved summary. `medicinesGiven` is optional: the edge function also folds
 * it into `details` as a "Medicines given" row, which is what older rows and
 * the doctor dashboard read.
 */
export type StoredCheckinSummary = CheckinSummary & {
  medicinesGiven?: string | null;
  /**
   * R3-03: an EMERGENCY-NOW sign was reported (fit, blue lips or skin, can't
   * be woken, severe breathing difficulty). Optional: older summaries lack it.
   */
  emergencyNow?: boolean;
};

/** Reads a stored ai_summary (jsonb) defensively; null if it isn't one. */
function parseStoredSummary(raw: unknown): StoredCheckinSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.chiefComplaint !== 'string' || !Array.isArray(r.details)) return null;
  const urgency = r.suggestedUrgency;
  return {
    chiefComplaint: r.chiefComplaint,
    parentSummary: typeof r.parentSummary === 'string' && r.parentSummary.trim() ? r.parentSummary : null,
    details: (r.details as { label?: unknown; value?: unknown }[]).map((d) => ({
      label: String(d?.label ?? ''),
      value: String(d?.value ?? ''),
    })),
    relevantHistory: typeof r.relevantHistory === 'string' ? r.relevantHistory : null,
    allergyNote: typeof r.allergyNote === 'string' ? r.allergyNote : null,
    suggestedUrgency: urgency === 'urgent' || urgency === 'soon' ? urgency : 'routine',
    medicinesGiven: typeof r.medicinesGiven === 'string' && r.medicinesGiven.trim() ? r.medicinesGiven : null,
    mentalHealth: r.mentalHealth === 'concern' || r.mentalHealth === 'crisis' ? r.mentalHealth : null,
    emergencyNow: r.emergencyNow === true,
  };
}

/**
 * Loads one saved check-in session (by id, from the route) for the summary
 * screen. The chat screen and summary screen are separate routes, so the
 * summary must come from the DB row, not from useCheckin()'s local state.
 */
export function useCheckinSession(sessionId: string | null) {
  const [summary, setSummary] = useState<StoredCheckinSummary | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [booking, setBooking] = useState<CheckinBooking | null>(null);
  const [loading, setLoading] = useState(!!sessionId);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      setSummary(null);
      setError("We couldn't find this check-in. Please start a new one.");
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('checkin_sessions')
      .select('id, child_id, ai_summary')
      .eq('id', sessionId)
      .maybeSingle<{ id: string; child_id: string; ai_summary: unknown }>();
    if (err) {
      setError("We couldn't load the summary. Check your connection and try again.");
    } else if (!data) {
      setError("We couldn't find this check-in. Please start a new one.");
    } else {
      const parsed = parseStoredSummary(data.ai_summary);
      setChildId(data.child_id);
      // A consult already booked from this summary (the parent came back to it).
      const { data: appt } = await supabase
        .from('appointments')
        .select('id, doctor_id, date, time')
        .eq('ai_summary_id', sessionId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle<CheckinBooking>();
      setBooking(appt ?? null);
      if (parsed) setSummary(parsed);
      else setError("The summary isn't ready yet. Try again in a moment.");
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  return { summary, childId, booking, loading, error, retry: load };
}

/** A consult booked from a check-in summary. */
export interface CheckinBooking {
  id: string;
  doctor_id: string;
  date: string;
  time: string;
}

export interface ResumableCheckin {
  id: string;
  initialComplaint: string;
  createdAt: string;
}

/**
 * The newest unfinished check-in (status in_progress, under 24 h old) for
 * this child, so the entry screen can offer to continue it. Refetched each
 * time the screen gains focus.
 */
export function useResumableCheckin(childId: string | null) {
  const { user } = useAuth();
  const [resumable, setResumable] = useState<ResumableCheckin | null>(null);

  const load = useCallback(async () => {
    if (!user || !childId) {
      setResumable(null);
      return;
    }
    const since = new Date(Date.now() - RESUME_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from('checkin_sessions')
      .select('id, initial_complaint, created_at')
      .eq('child_id', childId)
      .eq('parent_id', user.id)
      .eq('status', 'in_progress')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; initial_complaint: string; created_at: string }>();
    setResumable(
      data ? { id: data.id, initialComplaint: data.initial_complaint, createdAt: data.created_at } : null,
    );
  }, [user, childId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  /** "Start a new one": the old session is marked abandoned and not offered again. */
  const dismiss = useCallback(async () => {
    if (!resumable) return;
    setResumable(null);
    await supabase.from('checkin_sessions').update({ status: 'abandoned' }).eq('id', resumable.id);
  }, [resumable]);

  return { resumable, dismiss };
}
