// Edge Function: storyboard-feedback
//
// Feedback from the client on the shared storyboard page. Public (no login):
// verify_jwt is off (deploy with --no-verify-jwt) and the page sends no key. Rows live in
// public.storyboard_feedback and are only reached through this function.
//
//   GET                                   → all feedback, oldest first
//   POST {action:"create", screen_id, screen_name, author, feedback}
//        → saves it; if Gemini judges it too vague to act on, saves and
//          returns one short follow-up question (ai_followup)
//   POST {action:"reply", id, reply}      → the answer to that question

// deno-lint-ignore-file no-explicit-any
import { createAdminClient } from '../_shared/supabase.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = 'gemini-3.5-flash';
const FIELDS = 'id, screen_id, screen_name, author, feedback, ai_followup, reply, created_at, replied_at';

// Cut by code point so an emoji is never split into a lone surrogate.
const str = (v: unknown, max: number) => (typeof v === 'string' ? Array.from(v.trim()).slice(0, max).join('') : '');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One short follow-up question when the feedback is too vague to act on, else null. */
async function followUp(screenName: string, feedback: string): Promise<string | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return null;
  const prompt = `A client is reviewing screens of LilSteps, a child-health app for Indian parents (doctor consults, vaccines, growth, AI symptom check-in). They left feedback on the screen "${screenName}".

Feedback: """${feedback}"""

Decide if a designer could act on this feedback as written. It is VAGUE if it does not say what to change or what is wrong (for example "looks off", "make it better", "not good", "change this", "I don't like it").
If it is clear enough, reply with exactly: CLEAR
If it is vague, reply with ONE short, friendly follow-up question (max 25 words) that asks for the specific detail needed, in plain English. No preamble.`;
  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 80,
        reasoning_effort: 'none',
      }),
      // A stalled model must not cost the client their note.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error('gemini', res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data: any = await res.json();
    const text = String(data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text || /^CLEAR\b/i.test(text)) return null;
    return text.replace(/^["']|["']$/g, '').slice(0, 300);
  } catch (e) {
    console.error('gemini call failed', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const db = createAdminClient();

  if (req.method === 'GET') {
    const { data, error } = await db.from('storyboard_feedback').select(FIELDS).order('created_at', { ascending: true }).limit(2000);
    if (error) return json({ error: 'Could not load feedback' }, 500);
    return json({ feedback: data });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (body?.action === 'create') {
    const screen_id = str(body.screen_id, 40);
    const screen_name = str(body.screen_name, 120);
    const author = str(body.author, 80) || null;
    const feedback = str(body.feedback, 3000);
    if (!screen_id || !feedback) return json({ error: 'Write some feedback first.' }, 400);

    // Light abuse guard: at most 120 new notes an hour across the page.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count, error: countError } = await db.from('storyboard_feedback').select('id', { count: 'exact', head: true }).gte('created_at', since);
    if (countError) return json({ error: 'Please try again in a moment.' }, 503);
    if ((count ?? 0) >= 120) return json({ error: 'Too much feedback in the last hour. Please try again later.' }, 429);

    const ai_followup = await followUp(screen_name || screen_id, feedback);
    const { data, error } = await db
      .from('storyboard_feedback')
      .insert({ screen_id, screen_name, author, feedback, ai_followup })
      .select(FIELDS)
      .single();
    if (error) return json({ error: 'Could not save feedback' }, 500);
    return json({ item: data });
  }

  if (body?.action === 'reply') {
    const id = str(body.id, 40);
    const reply = str(body.reply, 3000);
    if (!UUID.test(id) || !reply) return json({ error: 'Write a reply first.' }, 400);
    const { data, error } = await db
      .from('storyboard_feedback')
      .update({ reply, replied_at: new Date().toISOString() })
      .eq('id', id)
      .not('ai_followup', 'is', null)
      .is('reply', null)
      .select(FIELDS)
      .maybeSingle();
    if (error) return json({ error: 'Could not save reply' }, 500);
    if (!data) return json({ error: 'This question was already answered.' }, 409);
    return json({ item: data });
  }

  return json({ error: 'Unknown action' }, 400);
});
