/**
 * Client wrapper for the `ai-checkin` Supabase Edge Function.
 *
 * The Groq API key lives server-side as a Supabase secret, not in the app
 * bundle — see `supabase/functions/ai-checkin/index.ts`. The system prompt
 * and summary prompt are also constructed server-side, so the client only
 * sends raw conversation turns + child context.
 */

import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';

/**
 * Mental-health support level the edge function found in the parent's words
 * (C2): 'concern' shows the Tele-MANAS card, 'crisis' shows 112 first.
 */
export type SupportLevel = 'concern' | 'crisis';

/**
 * A failed ai-checkin call. `userMessage` is the server's friendly text for
 * the cases a parent can act on (rate limit, assistant busy); null otherwise.
 * 'unavailable' means LilSteps was reached but the assistant couldn't answer
 * (not the parent's internet); 'network' means the server wasn't reached.
 */
export class AiCheckinError extends Error {
  constructor(
    message: string,
    public code: 'rate_limited' | 'busy' | 'unavailable' | 'network',
    public userMessage: string | null,
  ) {
    super(message);
  }
}

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
  /** Clinical one-liner for the doctor. */
  chiefComplaint: string;
  /**
   * Plain-words headline for the parent (R2-08); never a clinical label.
   * Older summaries don't have it: fall back to chiefComplaint.
   */
  parentSummary?: string | null;
  details: { label: string; value: string }[];
  relevantHistory: string | null;
  allergyNote: string | null;
  suggestedUrgency: 'routine' | 'soon' | 'urgent';
  /** Medicines the parent already gave (optional; also folded into details). */
  medicinesGiven?: string | null;
  /** Set by the edge function when the parent raised a mood / self-harm concern. */
  mentalHealth?: SupportLevel | null;
}

export interface ChatReply {
  content: string;
  support: SupportLevel | null;
}

function asSupport(v: unknown): SupportLevel | null {
  return v === 'concern' || v === 'crisis' ? v : null;
}

async function invokeAiCheckin<T extends 'chat' | 'summary'>(
  action: T,
  child: ChildContext,
  messages: GroqMessage[],
): Promise<{ content: string; support: SupportLevel | null }> {
  dbg.groq('invoke ai-checkin', { action, messageCount: messages.length });

  const { data, error } = await supabase.functions.invoke<{ content?: string; error?: string; support?: unknown }>(
    'ai-checkin',
    { body: { action, child, messages } },
  );

  if (error) {
    dbg.groqError('ai-checkin invoke failed', error);
    // Rate limit (429) and "assistant busy" (503) carry a friendly message
    // the parent can act on; anything else gets the app's generic text.
    if (error instanceof FunctionsHttpError) {
      const body = await (error.context as Response).json().catch(() => null);
      const code = body?.code;
      if ((code === 'rate_limited' || code === 'busy') && typeof body?.error === 'string') {
        throw new AiCheckinError(body.error, code, body.error);
      }
      throw new AiCheckinError(error.message, 'unavailable', null);
    }
    throw new AiCheckinError(error.message ?? 'AI service unavailable', 'network', null);
  }
  if (!data?.content) {
    dbg.groqError('ai-checkin returned no content', data);
    throw new AiCheckinError(data?.error ?? 'AI returned an empty response', 'unavailable', null);
  }

  return { content: data.content, support: asSupport(data.support) };
}

export async function chatCompletion(
  child: ChildContext,
  messages: GroqMessage[],
): Promise<ChatReply> {
  return invokeAiCheckin('chat', child, messages);
}

export async function generateSummary(
  child: ChildContext,
  messages: GroqMessage[],
): Promise<CheckinSummary> {
  const { content: response } = await invokeAiCheckin('summary', child, messages);

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
      parentSummary:
        typeof parsed.parentSummary === 'string' && parsed.parentSummary.trim()
          ? parsed.parentSummary.trim()
          : null,
      details: parsed.details.map((d: { label: string; value: string }) => ({
        label: String(d.label),
        value: String(d.value),
      })),
      relevantHistory: parsed.relevantHistory ?? null,
      allergyNote: parsed.allergyNote ?? null,
      medicinesGiven:
        typeof parsed.medicinesGiven === 'string' && parsed.medicinesGiven.trim()
          ? parsed.medicinesGiven.trim()
          : null,
      mentalHealth: asSupport(parsed.mentalHealth),
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
