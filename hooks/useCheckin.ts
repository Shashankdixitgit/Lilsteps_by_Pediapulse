import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { chatCompletion, generateSummary, GroqMessage } from '@/lib/groq';
import type { ChildWithDetails } from './useChildren';
import { formatAge } from '@/constants/bracketConfig';

export interface CheckinMessage {
  id: string;
  role: 'ai' | 'user';
  content: string;
  /** Pre-filled response options parsed from AI message (AI questions with [QUICK_OPTIONS: ...]) */
  quickOptions?: string[];
}

// Marker the AI uses to signal it has enough info
const CHECKIN_COMPLETE_MARKER = '[CHECKIN_COMPLETE]';
// Marker for quick reply options
const QUICK_OPTIONS_REGEX = /\[QUICK_OPTIONS:\s*([^\]]+)\]/;

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
  const [summary, setSummary] = useState<{
    chiefComplaint: string;
    details: { label: string; value: string }[];
    relevantHistory: string | null;
    allergyNote: string | null;
    suggestedUrgency: 'routine' | 'soon' | 'urgent';
  } | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);

  function getChildContext() {
    if (!child) throw new Error('No child selected');
    return {
      name: child.name,
      age: formatAge(new Date(child.dob)),
      weight: child.weight ?? undefined,
      height: child.height ?? undefined,
      allergies: child.allergies.map(a => a.name),
      conditions: child.conditions.map(c => c.name),
      medications: child.medications.map(m => ({
        name: m.name,
        dosage: m.dosage ?? undefined,
        frequency: m.frequency ?? undefined,
      })),
    };
  }

  function parseAiResponse(response: string): { clean: string; ready: boolean; quickOptions: string[] } {
    const ready = response.includes(CHECKIN_COMPLETE_MARKER);
    // Extract quick options before stripping markers
    const optionsMatch = response.match(QUICK_OPTIONS_REGEX);
    const quickOptions = optionsMatch
      ? optionsMatch[1].split(',').map((o) => o.trim()).filter(Boolean)
      : [];
    // Strip both markers from the displayed text
    const clean = response
      .replace(CHECKIN_COMPLETE_MARKER, '')
      .replace(QUICK_OPTIONS_REGEX, '')
      .trim();
    return { clean: clean || 'I have everything I need. Ready to generate a summary.', ready, quickOptions };
  }

  async function startCheckin(initialComplaint: string) {
    if (!user || !child) throw new Error('Not ready');
    setLoading(true);
    setError(null);

    try {
      // Create DB session
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
      setSessionId(session.id);

      // Build conversation and call Edge Function (system prompt is server-side)
      const childCtx = getChildContext();
      const groqMessages: GroqMessage[] = [
        { role: 'user', content: initialComplaint },
      ];

      const aiResponse = await chatCompletion(childCtx, groqMessages);
      const { clean, ready, quickOptions } = parseAiResponse(aiResponse);

      // Save messages to DB
      await supabase.from('checkin_messages').insert([
        { session_id: session.id, role: 'user', content: initialComplaint },
        { session_id: session.id, role: 'ai', content: clean },
      ]);

      const newMessages: CheckinMessage[] = [
        { id: nextMsgId('user'), role: 'user', content: initialComplaint },
        { id: nextMsgId('ai'), role: 'ai', content: clean, quickOptions },
      ];

      setMessages(newMessages);
      setQuestionCount(1);
      setAiReady(ready);
      return clean;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start check-in';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(content: string) {
    if (!sessionId || !child) throw new Error('No active session');
    if (sendingRef.current) return; // prevent double-send
    sendingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Add user message to state
      const userMsg: CheckinMessage = {
        id: nextMsgId('user'),
        role: 'user',
        content,
      };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);

      // Save user message to DB
      await supabase.from('checkin_messages').insert({
        session_id: sessionId,
        role: 'user',
        content,
      });

      // Build full conversation for Edge Function (system prompt is server-side)
      const childCtx = getChildContext();
      const groqMessages: GroqMessage[] = updatedMessages.map(m => ({
        role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }));

      const aiResponse = await chatCompletion(childCtx, groqMessages);
      const { clean, ready, quickOptions } = parseAiResponse(aiResponse);

      // Save AI message to DB
      await supabase.from('checkin_messages').insert({
        session_id: sessionId,
        role: 'ai',
        content: clean,
      });

      const aiMsg: CheckinMessage = {
        id: nextMsgId('ai'),
        role: 'ai',
        content: clean,
        quickOptions,
      };

      setMessages([...updatedMessages, aiMsg]);
      setQuestionCount(prev => prev + 1);
      setAiReady(ready);
      return clean;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to send message';
      setError(msg);
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

    try {
      const childCtx = getChildContext();
      const groqMessages: GroqMessage[] = messages.map(m => ({
        role: (m.role === 'ai' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      }));

      const result = await generateSummary(childCtx, groqMessages);
      setSummary(result);

      // Save summary to DB
      await supabase
        .from('checkin_sessions')
        .update({ status: 'summary_generated', ai_summary: result })
        .eq('id', sessionId);

      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate summary';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setSessionId(null);
    setMessages([]);
    setLoading(false);
    setAiReady(false);
    setSummary(null);
    setQuestionCount(0);
    setError(null);
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
    startCheckin,
    sendMessage,
    generateCheckinSummary,
    reset,
  };
}
