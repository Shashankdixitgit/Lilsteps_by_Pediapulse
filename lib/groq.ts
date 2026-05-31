/**
 * Client wrapper for the `ai-checkin` Supabase Edge Function.
 *
 * The Groq API key lives server-side as a Supabase secret, not in the app
 * bundle — see `supabase/functions/ai-checkin/index.ts`. The system prompt
 * and summary prompt are also constructed server-side, so the client only
 * sends raw conversation turns + child context.
 */

import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChildContext {
  name: string;
  age: string;
  weight?: number;
  height?: number;
  allergies: string[];
  conditions: string[];
  medications: { name: string; dosage?: string; frequency?: string }[];
}

export interface CheckinSummary {
  chiefComplaint: string;
  details: { label: string; value: string }[];
  relevantHistory: string | null;
  allergyNote: string | null;
  suggestedUrgency: 'routine' | 'soon' | 'urgent';
}

async function invokeAiCheckin<T extends 'chat' | 'summary'>(
  action: T,
  child: ChildContext,
  messages: GroqMessage[],
): Promise<string> {
  dbg.groq('invoke ai-checkin', { action, messageCount: messages.length });

  const { data, error } = await supabase.functions.invoke<{ content?: string; error?: string }>(
    'ai-checkin',
    { body: { action, child, messages } },
  );

  if (error) {
    dbg.groqError('ai-checkin invoke failed', error);
    throw new Error(error.message ?? 'AI service unavailable');
  }
  if (!data?.content) {
    dbg.groqError('ai-checkin returned no content', data);
    throw new Error(data?.error ?? 'AI returned an empty response');
  }

  return data.content;
}

export async function chatCompletion(
  child: ChildContext,
  messages: GroqMessage[],
): Promise<string> {
  return invokeAiCheckin('chat', child, messages);
}

export async function generateSummary(
  child: ChildContext,
  messages: GroqMessage[],
): Promise<CheckinSummary> {
  const response = await invokeAiCheckin('summary', child, messages);

  // The model is asked for raw JSON, but defend against markdown fences.
  let jsonStr = response;
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (!parsed.chiefComplaint || !Array.isArray(parsed.details)) {
      throw new Error('Missing required fields in summary');
    }

    return {
      chiefComplaint: String(parsed.chiefComplaint),
      details: parsed.details.map((d: { label: string; value: string }) => ({
        label: String(d.label),
        value: String(d.value),
      })),
      relevantHistory: parsed.relevantHistory ?? null,
      allergyNote: parsed.allergyNote ?? null,
      suggestedUrgency: ['routine', 'soon', 'urgent'].includes(parsed.suggestedUrgency)
        ? parsed.suggestedUrgency
        : 'routine',
    };
  } catch (e) {
    throw new Error(
      `Failed to parse AI summary: ${e instanceof Error ? e.message : 'Invalid JSON'}`,
    );
  }
}
