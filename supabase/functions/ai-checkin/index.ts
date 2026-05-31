// Edge Function: ai-checkin
//
// Proxies Groq calls so the API key never reaches the client app bundle.
// Verifies the caller's Supabase JWT, builds the system prompt server-side
// for the requested action, and returns Groq's response unchanged.
//
// Deploy: `supabase functions deploy ai-checkin --project-ref opdosbudlzwywdmrxlqr`
// Set secret: `supabase secrets set GROQ_API_KEY=<key> --project-ref opdosbudlzwywdmrxlqr`

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.3";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChildContext {
  name: string;
  age: string;
  weight?: number;
  height?: number;
  allergies: string[];
  conditions: string[];
  medications: { name: string; dosage?: string; frequency?: string }[];
}

type ChatRequest = {
  action: "chat";
  child: ChildContext;
  messages: GroqMessage[];
};

type SummaryRequest = {
  action: "summary";
  child: ChildContext;
  messages: GroqMessage[];
};

type RequestBody = ChatRequest | SummaryRequest;

function buildSystemPrompt(child: ChildContext): string {
  const allergyList =
    child.allergies.length > 0 ? child.allergies.join(", ") : "None known";
  const conditionList =
    child.conditions.length > 0 ? child.conditions.join(", ") : "None known";
  const medList =
    child.medications.length > 0
      ? child.medications
          .map(
            (m) =>
              `${m.name}${m.dosage ? ` ${m.dosage}` : ""}${
                m.frequency ? ` (${m.frequency})` : ""
              }`,
          )
          .join(", ")
      : "None";

  return `You are a warm, professional pediatric health assistant helping a parent prepare for a doctor visit. You are collecting symptoms — NOT diagnosing.

CHILD PROFILE:
- Name: ${child.name}
- Age: ${child.age}
- Weight: ${child.weight ? `${child.weight} kg` : "Not recorded"}
- Height: ${child.height ? `${child.height} cm` : "Not recorded"}
- Known allergies: ${allergyList}
- Chronic conditions: ${conditionList}
- Current medications: ${medList}

RULES:
1. Ask 5–8 focused follow-up questions, ONE at a time.
2. Cover: onset, severity, location, associated symptoms, triggers, fluid/food intake, what has been tried.
3. Be warm but clinical. Use the child's name naturally.
4. NEVER diagnose, prescribe, or suggest medication.
5. NEVER frighten the parent — stay calm and reassuring.
6. When you have enough information to prepare a summary, end your FINAL message with EXACTLY this marker on its own line:
   [CHECKIN_COMPLETE]
7. Keep responses concise (2–3 sentences max per question).
8. If the parent mentions a known allergy or condition from the profile, acknowledge it.
9. For questions where the parent can answer from a limited set of choices, append EXACTLY this line AFTER your question (on its own line):
   [QUICK_OPTIONS: Option 1, Option 2, Option 3, Option 4]
   Use this for:
   - Yes/No/Not sure questions → [QUICK_OPTIONS: Yes, No, Not sure]
   - Duration → [QUICK_OPTIONS: Just started, Since yesterday, 2-3 days, A week or more]
   - Severity → [QUICK_OPTIONS: Mild, Moderate, Severe]
   - Fever temperature → [QUICK_OPTIONS: Below 100°F, 100-101°F, 101-103°F, Above 103°F]
   - Eating/drinking → [QUICK_OPTIONS: Eating normally, Eating less, Refusing to eat]
   - Cough type → [QUICK_OPTIONS: Dry cough, Wet/phlegmy, Barking cough, No cough]
   - Energy level → [QUICK_OPTIONS: Active as usual, A bit tired, Very tired, Lethargic]
   - Sleep impact → [QUICK_OPTIONS: Sleeping normally, Waking up often, Can't sleep]
   Do NOT include [QUICK_OPTIONS] for free-text questions like "Tell me more about..." or the first open-ended question.`;
}

function buildSummaryPrompt(child: ChildContext): string {
  return `You are a medical summarization assistant. Given the parent-AI conversation about ${child.name}'s symptoms, produce a structured JSON summary. Respond ONLY with valid JSON, no markdown or extra text.

Format:
{
  "chiefComplaint": "Brief one-line complaint",
  "details": [
    { "label": "When it started", "value": "..." },
    { "label": "Severity", "value": "..." },
    { "label": "What makes it worse", "value": "..." },
    { "label": "Associated symptoms", "value": "..." },
    { "label": "Fluids/Food intake", "value": "..." }
  ],
  "relevantHistory": "Any relevant past medical history or null",
  "allergyNote": "Allergy warning for the doctor or null",
  "suggestedUrgency": "routine | soon | urgent"
}

Child allergies: ${child.allergies.join(", ") || "None"}
Child conditions: ${child.conditions.join(", ") || "None"}`;
}

async function callGroq(messages: GroqMessage[]): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.6,
      max_tokens: 512,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned an empty response");
  return content;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Verify Supabase JWT — must be present and resolve to a real user
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing Authorization header" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body?.action || !body?.child || !Array.isArray(body?.messages)) {
    return json({ error: "Missing required fields: action, child, messages" }, 400);
  }

  try {
    if (body.action === "chat") {
      const messages: GroqMessage[] = [
        { role: "system", content: buildSystemPrompt(body.child) },
        ...body.messages.filter((m) => m.role !== "system"),
      ];
      const content = await callGroq(messages);
      return json({ content });
    }

    if (body.action === "summary") {
      const messages: GroqMessage[] = [
        { role: "system", content: buildSummaryPrompt(body.child) },
        ...body.messages.filter((m) => m.role !== "system"),
        {
          role: "user",
          content:
            "Now generate the structured summary JSON based on the conversation above.",
        },
      ];
      const content = await callGroq(messages);
      return json({ content });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? "Internal error" }, 500);
  }
});
