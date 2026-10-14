// Edge Function: ai-checkin
//
// Proxies Gemini calls (OpenAI-compatible endpoint) so the API key never
// reaches the client app bundle.
// Verifies the caller's Supabase JWT, builds the system prompt server-side
// for the requested action, and returns the model's response. Summaries are
// post-processed (filler rows dropped, danger signs force 'urgent').
// Each user is rate limited per hour (ai_checkin_take, migration 0032; a
// failed model call is given back with ai_checkin_refund, migration 0038), and
// chat replies carry `support` ('concern' | 'crisis' | null) so the app can
// show the mental-health support card (C2), plus `danger` and `dangerLevel`
// ('emergency' | 'urgent' | null; and [DANGER_SIGNS: ...] / [DANGER_LEVEL:
// ...] markers the app strips) for its Call 112 card (C3, R3-03). Replies are
// checked before they reach the app: only 112 and Tele-MANAS 14416, no
// medicine the parent didn't name, no questions after an emergency sign.
//
// Deploy: `supabase functions deploy ai-checkin --project-ref ahikfefphptmtivwukpv`
// Set secret: `supabase secrets set GEMINI_API_KEY=<key> --project-ref ahikfefphptmtivwukpv`

// Upstream (Gemini) errors are logged here and never returned to the client;
// the app only ever sees a short friendly message.

// deno-lint-ignore-file no-explicit-any
import { createAdminClient, getCaller } from "../_shared/supabase.ts";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODEL = "gemini-3.5-flash";

// Generous for a 5–8 question check-in; stops oversized / abusive payloads.
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 4000;

const FRIENDLY_UNAVAILABLE =
  "The assistant couldn't answer just now. Please try again in a moment.";
const FRIENDLY_BUSY =
  "Lots of parents are using the assistant right now. Please wait a minute and tap Retry.";

/**
 * Per-user limits (ai_checkin_take, migration 0032), so testers sharing one
 * Gemini key can't use it up for everyone. A check-in is about 5–8 chat calls
 * and one summary. Sized for App Review, where several reviewers share one
 * login. Failed calls are refunded (ai_checkin_refund, migration 0038), so an
 * outage and its retries never use up the hour (R2-03).
 */
const RATE_LIMITS: Record<"chat" | "summary", number> = { chat: 60, summary: 20 };
const RATE_WINDOW_SECONDS = 60 * 60;

/** Error codes the app reads to pick its message. */
type ErrorCode = "rate_limited" | "busy" | "unavailable";

/** Upstream failure: `detail` is logged server-side only. */
class UpstreamError extends Error {
  constructor(
    public status: number,
    public userMessage: string,
    public detail: string,
    public code: ErrorCode = "unavailable",
  ) {
    super(userMessage);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ChatMessage {
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
  /** Age in days, for the age-limited danger signs (newborn jaundice, young-infant fever). */
  ageDays?: number;
  /** Parent chose "Not known" for allergies and none are recorded. */
  allergiesNotKnown?: boolean;
}

type ChatRequest = {
  action: "chat";
  child: ChildContext;
  messages: ChatMessage[];
};

type SummaryRequest = {
  action: "summary";
  child: ChildContext;
  messages: ChatMessage[];
};

type RequestBody = ChatRequest | SummaryRequest;

// ---------------------------------------------------------------------------
// Danger signs
// ---------------------------------------------------------------------------

interface DangerSign {
  /** Short label shown to the parent, the doctor and the model. */
  label: string;
  /**
   * How the sign is written when the parent only half-confirmed it ("a
   * little", "thoda"): the summary words it as the parent said it (R3-15).
   */
  mild: string;
  /**
   * EMERGENCY-NOW sign: the reply says call 112 / go to hospital now, asks
   * nothing more and ends the check-in (R3-03). Pending Dr Atish sign-off (C5).
   */
  emergency?: boolean;
  /** Only applies below this age (days). */
  maxAgeDays?: number;
  /**
   * The assistant only ASKS about this sign below this age (days); a parent
   * who mentions it is still flagged at any age. Keeps baby questions (wet
   * nappies, grunting, feeding) away from older children (C5).
   */
  askMaxAgeDays?: number;
  /** Lower-case patterns matched against parent text and summary values. */
  patterns: RegExp[];
}

/**
 * Danger signs that make a check-in 'urgent' whatever the model suggests, and
 * that the chat must react to straight away. A conservative standard list:
 * the IMCI general danger signs plus the newborn signs. Signs marked
 * `emergency` (a fit, blue lips or skin, can't be woken, severe breathing
 * difficulty) get "call 112 / go to hospital now" instead of "seen today".
 *
 * pending Dr Atish sign-off (C5), including the EMERGENCY-NOW level (R3-03)
 */
const DANGER_SIGNS: DangerSign[] = [
  {
    label: "Can't be woken or very hard to wake",
    mild: "Harder to wake than usual",
    emergency: true,
    patterns: [
      /hard to wake/,
      /difficult to wake/,
      // Not "isn't waking up at night" (sleeping well) or "won't wake up for school".
      /(can'?t|cannot|won'?t|not) (be )?wak(e|ing|en) (up|her|him)(?! (at night|in the night|during the night|for school|early|on time))/,
      /(can'?t|cannot|couldn'?t) be woken/,
      /\bunresponsive/,
      /\bunconscious/,
    ],
  },
  {
    label: "Very sleepy",
    mild: "Sleepy",
    patterns: [/letharg/, /very (sleepy|drowsy)/, /\bfloppy\b/],
  },
  {
    label: "Not feeding or poor feeding",
    mild: "Feeding less",
    askMaxAgeDays: 730,
    patterns: [
      /not (feeding|drinking|breast ?feeding|taking (any )?(feeds?|milk))(?! (much|as much|a lot))/,
      /poor(ly)? feed/,
      /refus(ing|es|ed) (to )?(feed|feeds|drink|milk|the breast|breast ?feeds?|the bottle|everything)/,
      /unable to (feed|drink|suck)/,
      /(can'?t|cannot|won'?t) (feed|drink|suck)/,
      /vomit(s|ing|ed)? (up )?everything/,
    ],
  },
  {
    label: "Few wet nappies",
    mild: "Fewer wet nappies",
    askMaxAgeDays: 730,
    patterns: [
      /\b([0-3]|one|two|three|few|fewer|less|no|hardly any|only \w+) wet (nappies|nappy|diapers?)\b/,
      /(not|hasn'?t|hardly) (been )?(peeing|passing urine|urinating|wetting)/,
      /\bno (pee|urine)\b/,
    ],
  },
  {
    // The age limit lives in maxAgeDays, not the label: the doctor sees the label.
    label: "Yellow eyes or skin",
    mild: "Slightly yellow eyes or skin",
    maxAgeDays: 30,
    patterns: [
      /yellow(ish)? (eyes|skin|colou?r)/,
      /(eyes|skin|face|body) (look |looks |are |is |turning |turned |went |gone )?yellow/,
      /jaundice/,
    ],
  },
  {
    label: "Severe breathing difficulty",
    mild: "Some difficulty breathing",
    emergency: true,
    patterns: [
      /struggl(e|es|ing|ed) (to |for )?breath/,
      /(can'?t|cannot|unable to) (breathe|breath|catch (his|her|their) breath)/,
      /\bgasp(s|ing|ed)?\b/,
      /fighting for breath/,
      /\bsaans nahi/,
    ],
  },
  {
    label: "Fast breathing",
    mild: "Breathing a bit faster",
    patterns: [
      /fast breath/,
      /breath(ing)? (very |too )?fast/,
      /rapid breath/,
      /breathless/,
      /(difficulty|trouble|hard|working hard) (to )?breath/,
    ],
  },
  {
    label: "Chest sucking in",
    mild: "Chest sucking in a little",
    askMaxAgeDays: 1825,
    patterns: [
      /chest (is |keeps )?(sucking|pulling|sinking|going) in/,
      /in-?drawing/,
      /retraction/,
      /ribs (are )?(showing|show|sucking|pulling)/,
    ],
  },
  { label: "Grunting", mild: "Some grunting", askMaxAgeDays: 730, patterns: [/grunt/] },
  {
    label: "Blue lips or skin",
    mild: "Bluish lips or skin",
    emergency: true,
    patterns: [
      /blue(ish)? (lips|skin|tongue|face)/,
      /(lips|face|tongue|skin) (look |looks |are |is |turning |turned |went |gone |going |became |have gone )?(blue|bluish)/,
      /cyanos/,
      /(hont|honth|hoth) neel/,
    ],
  },
  {
    label: "Seizure or fit",
    mild: "Possible fit",
    emergency: true,
    patterns: [
      /seizure/,
      /convuls/,
      /\b(had|having|has|a) (a )?fits?\b/,
      /\bfitting\b/,
      /\b(jhatke|daura|dora|mirgi)\b/,
    ],
  },
  {
    label: "Fever in a baby under 3 months",
    mild: "Fever in a baby under 3 months",
    maxAgeDays: 90,
    patterns: [
      /fever/,
      /\b(3[89]|4[0-2])(\.\d+)?\s*°?\s*c\b/,
      /\b(100\.[4-9]|10[1-7](\.\d+)?)\s*°?\s*f\b/,
      /high temperature/,
    ],
  },
];

const SIGN_BY_LABEL = new Map(DANGER_SIGNS.map((s) => [s.label, s]));

const NEGATION = /\b(no|not|never|without|isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|didn'?t|hasn'?t|haven'?t|denies|nor)\b/;
/**
 * "Yes" answers to a yes/no question about ONE danger sign. The hedged forms
 * ("a little", "sometimes") only count for such a question, never for a
 * multiple-choice one ("active, a bit tired, or very sleepy?"): there "A bit
 * tired" is a different, milder option (S2). "Not sure" never counts.
 */
const PLAIN_YES = /^\s*(yes|yeah|yep|ya|haan|ha|han|ji|ji haan|i think so)\b/i;
/**
 * A hedge on its own ("A little.", "thoda"), not "A bit tired" (a milder
 * choice). A hedged yes still flags the sign, but the summary words it as the
 * parent said it ("Sleepy (parent said "a little")"), never "very sleepy" (R3-15).
 */
const HEDGED_YES =
  /^\s*(yes,?\s*|haan,?\s*|ha,?\s*)?(sometimes|a little|a little bit|a bit|slightly|maybe|possibly|thoda|thodi|thoda sa|thodi si|thoda thoda|kabhi kabhi|halka|halki)\s*(sa|si)?\s*[.!]?\s*$/i;
const AFFIRMATIVE = {
  test: (answer: string) => PLAIN_YES.test(answer) || HEDGED_YES.test(answer),
};
/** "Not sure" answers: shown to the doctor as "Parent not sure", never "Not answered" (R3-21). */
const NOT_SURE = /^\s*(not sure|unsure|i'?m not sure|don'?t know|i don'?t know|no idea|can'?t say|pata nahi|pata nahin|maloom nahi|malum nahi)\b/i;

/**
 * True when a question offers several choices ("active, a bit tired, or very
 * sleepy?"): it has a comma / "or" list and at least one choice is not about
 * the sign being matched. "Is she breathing fast or struggling to breathe?"
 * (both choices are the same sign) is still a yes/no question.
 */
function isMultipleChoice(question: string, matches: (part: string) => boolean): boolean {
  const lower = question.toLowerCase().replace(/\?/g, "");
  if (!/\s(or|ya)\s/.test(lower)) return false;
  const parts = lower
    .split(/,|\s+or\s+|\s+ya\s+|\//)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  // The first part carries the stem ("is she active"); any choice without
  // the sign makes it multiple choice.
  return parts.length >= 2 && parts.some((p) => !matches(p));
}

/**
 * The single question a parent's "Yes" answers: the last question sentence,
 * when it is a yes/no question about one topic. Null otherwise.
 */
function yesNoQuestion(assistantText: string, matches: (part: string) => boolean): string | null {
  const qs = assistantText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.endsWith("?"));
  const q = qs[qs.length - 1];
  if (!q || !matches(q) || isMultipleChoice(q, matches)) return null;
  return q;
}

function signsFor(ageDays: number | undefined): DangerSign[] {
  return DANGER_SIGNS.filter(
    (s) => s.maxAgeDays === undefined || (typeof ageDays === "number" && ageDays <= s.maxAgeDays),
  );
}

/** Signs the assistant may ask about at this age (C5 age gate). */
function askSignsFor(ageDays: number | undefined): DangerSign[] {
  return signsFor(ageDays).filter(
    (s) => s.askMaxAgeDays === undefined || typeof ageDays !== "number" || ageDays <= s.askMaxAgeDays,
  );
}

/** Danger signs stated (not negated) in a piece of text. */
function signsInText(text: string, signs: DangerSign[], checkNegation = true): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const sign of signs) {
    for (const re of sign.patterns) {
      const m = re.exec(lower);
      if (!m) continue;
      if (checkNegation) {
        // The clause before the match: "no fast breathing", "she isn't lethargic".
        const before = lower.slice(Math.max(0, m.index - 30), m.index);
        const clause = before.split(/[.,;!?]| but /).pop() ?? "";
        if (NEGATION.test(clause)) continue;
      }
      found.push(sign.label);
      break;
    }
  }
  return found;
}

/** Question sentences in an assistant message ("Is she breathing fast?"). */
function questionsIn(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().endsWith("?"))
    .join(" ");
}

/**
 * Danger signs the parent reported: in their own words, or by answering
 * "Yes" to a yes/no question about the sign. A milder choice picked from a
 * multiple-choice question ("A bit tired") never flags the severe choice (S2).
 * The value is the hedge ("a little") when the parent only half-confirmed
 * the sign, else null; a plain report anywhere clears the hedge.
 */
function transcriptSigns(messages: ChatMessage[], ageDays: number | undefined): Map<string, string | null> {
  const signs = signsFor(ageDays);
  const hasSign = (t: string) => signsInText(t, signs, false).length > 0;
  const found = new Map<string, string | null>();
  const add = (label: string, hedge: string | null) => {
    if (!found.has(label) || hedge === null) found.set(label, hedge);
  };
  messages.forEach((m, i) => {
    if (m.role !== "user") return;
    signsInText(m.content, signs).forEach((s) => add(s, null));
    const prev = messages[i - 1];
    if (prev?.role === "assistant" && AFFIRMATIVE.test(m.content)) {
      const q = yesNoQuestion(prev.content, hasSign);
      const hedge = PLAIN_YES.test(m.content) ? null : m.content.trim().replace(/[.!]+$/, "").toLowerCase();
      if (q) signsInText(q, signs, false).forEach((s) => add(s, hedge));
    }
  });
  return found;
}

function signsInTranscript(messages: ChatMessage[], ageDays: number | undefined): string[] {
  return [...transcriptSigns(messages, ageDays).keys()];
}

/**
 * EMERGENCY-NOW (R3-03): a fit, blue lips or skin, can't be woken or severe
 * breathing difficulty. A hedged "a little" to "hard to wake?" or "struggling
 * to breathe?" stays 'urgent'; a possible fit or bluish lips is still an
 * emergency. Pending Dr Atish sign-off (C5).
 */
type DangerLevel = "emergency" | "urgent";

const EMERGENCY_EVEN_IF_HEDGED = new Set(["Blue lips or skin", "Seizure or fit"]);

function isEmergency(label: string, hedge: string | null): boolean {
  const sign = SIGN_BY_LABEL.get(label);
  if (!sign?.emergency) return false;
  return hedge === null || EMERGENCY_EVEN_IF_HEDGED.has(label);
}

function dangerLevelOf(found: Map<string, string | null>): DangerLevel | null {
  if (found.size === 0) return null;
  for (const [label, hedge] of found) if (isEmergency(label, hedge)) return "emergency";
  return "urgent";
}

/** A sign as the parent said it: "Sleepy (parent said "a little")". */
function signInParentWords(label: string, hedge: string | null): string {
  if (hedge === null) return label;
  const mild = SIGN_BY_LABEL.get(label)?.mild ?? label;
  return `${mild} (parent said "${hedge}")`;
}

function signsInSummary(parsed: any, ageDays: number | undefined): string[] {
  const signs = signsFor(ageDays);
  const found = new Set<string>();
  if (typeof parsed.chiefComplaint === "string") {
    signsInText(parsed.chiefComplaint, signs).forEach((s) => found.add(s));
  }
  for (const d of parsed.details as any[]) {
    const label = typeof d?.label === "string" ? d.label : "";
    const value = typeof d?.value === "string" ? d.value : "";
    if (/not answered|danger signs|parent not sure/i.test(label)) continue;
    signsInText(value, signs).forEach((s) => found.add(s));
    // { label: "Fast breathing", value: "Yes" }
    if (AFFIRMATIVE.test(value)) signsInText(label, signs, false).forEach((s) => found.add(s));
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Mental health (C2)
// ---------------------------------------------------------------------------

/**
 * 'concern': the parent raised the child's mood or emotional health (the
 * "Mood" tile, or their own words), or their OWN distress (crying every day,
 * exhausted, low after the birth). 'crisis': words about self-harm or suicide
 * (the child's or the parent's own), or about harming the baby. The app shows
 * the support card (Tele-MANAS 14416 + Book a doctor) for both, and the
 * emergency 112 card first for 'crisis'.
 *
 * Decided by Shashank (C2, Claude's suggested default); wording pending
 * Dr Atish sign-off.
 */
type SupportLevel = "concern" | "crisis";

const MENTAL_HEALTH_PATTERNS: RegExp[] = [
  /\bmood\b/,
  /\bmoody\b/,
  /anxi(ous|ety)/,
  /depress/,
  /\bpanic/,
  /\bstress(ed|ful)?\b/,
  /\bworried all the time\b/,
  /\b(very |always |so )?(sad|unhappy|low) (all the time|most days|every day|lately|these days)\b/,
  /\bfeel(s|ing)? (low|down|hopeless|worthless|empty|lonely|numb)\b/,
  /\blonely\b/,
  /\bwithdrawn\b/,
  /\b(doesn'?t|does not|won'?t|will not) (talk|speak) to (anyone|us|friends)\b/,
  /\bbull(y|ied|ying)\b/,
  /\bmental health\b/,
  /\bemotional(ly)?\b/,
  /\btantrums?\b.*\b(every|all the) (day|time)\b/,
  // The parent's own distress, often after the birth (R3-01).
  /\bpost-?partum\b|\bpost-?natal (depress|blues|low)|\bbaby blues\b/,
  /\bi('?m| am) (so |very |really |completely |totally )?(overwhelmed|exhausted|hopeless|not coping|falling apart|not myself|at my limit)\b/,
  /\bi (feel|felt) (so |very |really )?(overwhelmed|exhausted|hopeless|worthless|empty|numb|alone|like a bad (mother|mom|mum|parent))\b/,
  /\bi (can'?t|cannot) (cope|do this|handle (this|it)|take (this|it) any ?more)\b/,
  /\bi (keep crying|cry (all the time|every day|a lot|all day)|can'?t stop crying)\b/,
  // Hinglish (Roman script).
  /\bro(na|ti|ta|te|ye) (aata|aati|aa jata|aa jaata|aa jati|aa jaati|roz|rozana|har din|har roz|bahut|bohot|bahot|din bhar|sara din)\b/,
  /\b(roz|har din|har roz|din bhar|sara din|bahut|bohot|bahot) ro(ti|ta|te) (hoon|hun|hu|rehti|rehta|reh(ti|ta) hoon)\b/,
  /\b(bahut|bohot|bahot|kaafi|itna|itni|ekdum|bilkul|poori tarah) thak (gayi|gaya|gai|chuki|chuka)\b/,
  /\bthak (gayi|gaya|gai|chuki|chuka) (hoon|hun|hu|hai main)\b/,
  /\budaa?s\b/,
  /\bpareshaa?n (hoon|hun|hu|rehti|rehta|rahti|rahta)\b/,
  /\b(main|mai|mein)\b[^.?!]{0,25}\bpareshaa?n\b/,
  /\b(akeli|akela) (mehsoos|feel|lagta|lagti|pad gayi|pad gaya|hoon|hun|hu|rehti|rehta)\b|\bakela?a?pan\b/,
  /\b(dil|mann?) nahi lagta\b/,
  // Hindi (Devanagari).
  /उदास|परेशान (हूं|हूँ|हू|रहती|रहता)|अकेलापन|अकेल(ा|ी) महसूस|बहुत थक (गई|गया|चुकी|चुका)|रोना आता|रोती रहती/,
];

const CRISIS_PATTERNS: RegExp[] = [
  /suicid/,
  /self[- ]?harm/,
  /\bkill(ing)? (him|her|my|them|your)sel(f|ves)\b/,
  /\b(hurt|harm|cut)(s|ting|ing)? (him|her|them|my|your)sel(f|ves)\b/,
  /\bend(ing)? (it all|myself|my life|his life|her life|their life)\b/,
  /\bcut(s|ting)? (on )?(his|her|their|my) (arms?|wrists?|legs?)\b/,
  /\b(wants?|wanna|wanted) to die\b/,
  /\b(wish(es)?|wished) (s?he|they|i) (was|were|had) (dead|never been born|never born|not alive|not born)\b/,
  /\b(wish(es)?|wished) (s?he|they|i) (wasn'?t|weren'?t) (alive|born|here any ?more)\b/,
  /\b(wish(es)?|wished) (s?he|they|i) (could )?(die|disappear|be dead)\b/,
  /\b(do(es)?n'?t|does not|do not|not|never) want(s|ed)? to (live|be alive)\b(?! (with|in|at|there|here|near|alone))/,
  /\bdisappear(ed|ing)? forever\b/,
  /\bwants? to disappear\b/,
  /\bsleep and never (wake|get) up\b/,
  /\b(go|went|goes) to sleep and not wake up\b/,
  /\b(take|taking|took) (his|her|their|my) (own )?life\b/,
  /\bno (reason|point) (to|in|of)? ?(live|living|being alive|life)\b/,
  /\bwhat'?s the point (of|in) (living|life|being alive)\b/,
  /\bbetter off (dead|without me)\b/,
  /\boverdos/,
  // Harm to the baby (R3-01).
  // Only the parent's own intent or fear: not "will the medicine harm my baby?".
  /\bi( might| may| could| will| would|'ll|'d| want to| feel like| am going to|'m going to| am scared i| am afraid i|'m scared i|'m afraid i| think i)( will| might| could| may| would)? (hurt|harm|hit|shake|smother|kill|drop) (the|my|this|our) (baby|child|son|daughter)\b/,
  /\b(thoughts?|urges?|scared|afraid|fear|feel like) (of |to |that i('ll| will| might| may| could)? )?(hurt|harm|hit|shake|smother|kill)(ing)? (the|my|this|our) (baby|child)\b/,
  /\b(baby|bachche|bacche|bachchi|bachi|bacchi) ko (maar|mar) (doon|dun|du|dungi|dunga|daalun|dalun|na)\b/,
  // "kahin main baby ko nuksan na pahuncha doon", not "dawai baby ko nuksan to nahi karegi?".
  /\b(baby|bachche|bacche|bachchi|bachi|bacchi) ko (nuksa+n|nuqsa+n|chot|hurt)\b(?! (to |toh )?(nahi|nahin|karegi|karega|karti|karta|hoga|hogi|ho|hai|degi|dega|pahunchayegi|pahunchayega))/,
  // Hindi / Hinglish (Roman script).
  /\bmar(na|ne)? (jaa?n?a? )?chaht?(a|i|e|ti|ta)\b/,
  /\bmar jaa?(na|un|ungi|unga|oon|ega|egi)\b/,
  /\bjee?(na|ne) (nahi|nahin|nai) chaht?(a|i|e|ti|ta)\b/,
  /\bjeene ka (koi )?(mann?|matlab|fayda|faida) nahi/,
  /\bkhud ko (nuksa+n|nuqsa+n|nuksan|hurt|chot|maar|mar|khatam|khatm|khtm)/,
  /\b(apne aap ko|apna aap) (khatam|khatm|maar|mar)/,
  /\bsab( kuch)? (khatam|khatm) kar/,
  /\b(zindagi|zindagee|jindagi|jeevan|life) (hi )?(khatam|khatm)/,
  /\b(khatam|khatm) kar (loon|lun|lu|loo|doon|dun|du|doo|lungi|dungi|lunga|dunga)\b/,
  /\b(apni|apne aap ki) jaan (le|lena|lene)\b/,
  /\bjaan de (doon|dun|du|doo|dena|deni|dungi|dunga|du gi)\b/,
  /\batmahatya|aatmahatya|khudkushi\b/,
  // Hindi (Devanagari); \b doesn't apply to these letters.
  /मरना चाहत/,
  /मर जा/,
  /जीना नहीं चाहत/,
  /जीने का (कोई )?(मन|मतलब)/,
  /खुद को (नुकसान|चोट|ख़त्म|खत्म|मार)/,
  /(ख़त्म|खत्म) कर (लूं|लूँ|लू|दूं|दूँ|दू|लेना|देना|लूंगी|लूँगी|दूंगी|दूँगी)/,
  /(ज़िंदगी|जिंदगी|ज़िन्दगी|जिन्दगी) (ही )?(ख़त्म|खत्म)/,
  /जान दे (दूं|दूँ|दू|दूंगी|दूँगी|देना|दें)/,
  /(बच्चे|बच्ची|बेबी) को (मार (दूं|दूँ|दू|डालूं)|नुकसान (न |ना )?पहुं?चा (दूं|दूँ|दू))/,
  /आत्महत्या|ख़ुदकुशी|खुदकुशी/,
];

/** True when a pattern matches and the clause before it isn't negated. */
function matchesUnnegated(text: string, patterns: RegExp[], checkNegation = true): boolean {
  const lower = text.toLowerCase();
  for (const re of patterns) {
    const m = re.exec(lower);
    if (!m) continue;
    if (checkNegation) {
      const before = lower.slice(Math.max(0, m.index - 30), m.index);
      const clause = before.split(/[.,;!?]| but /).pop() ?? "";
      if (NEGATION.test(clause)) continue;
    }
    return true;
  }
  return false;
}

/**
 * Highest support level in the parent's turns: their own words, or "Yes" to
 * the assistant's question about the same thing. A plain "Yes" counts even
 * for a question with several choices (a false alarm only shows the helpline
 * cards); a hedge ("a bit") counts only for a yes/no question about it (S2).
 */
function supportLevel(messages: ChatMessage[]): SupportLevel | null {
  let level: SupportLevel | null = null;
  const answeredYes = (answer: string, question: string, patterns: RegExp[]): boolean => {
    const matches = (t: string) => matchesUnnegated(t, patterns, false);
    if (PLAIN_YES.test(answer)) return matches(questionsIn(question));
    return HEDGED_YES.test(answer) && yesNoQuestion(question, matches) !== null;
  };
  messages.forEach((m, i) => {
    if (m.role !== "user") return;
    const prev = messages[i - 1];
    const q = prev?.role === "assistant" ? prev.content : "";
    if (matchesUnnegated(m.content, CRISIS_PATTERNS) || (q && answeredYes(m.content, q, CRISIS_PATTERNS))) {
      level = "crisis";
    } else if (
      level === null &&
      (matchesUnnegated(m.content, MENTAL_HEALTH_PATTERNS) ||
        (q && answeredYes(m.content, q, MENTAL_HEALTH_PATTERNS)))
    ) {
      level = "concern";
    }
  });
  return level;
}

const TELE_MANAS = "Tele-MANAS on 14416 (free, 24x7, run by the Government of India)";

/**
 * R3-01: the only numbers the assistant may ever give. Gemini once invented
 * a "KIRAN" helpline; any other helpline or number is removed from the reply.
 */
const HELPLINE_RULE =
  "The ONLY phone numbers you may ever give are 112 (emergency) and Tele-MANAS 14416. Never name or give any other helpline, NGO, ambulance, hospital or phone number, whether national, state or private.";

// ---------------------------------------------------------------------------
// Fixed safety replies (R2-02)
// ---------------------------------------------------------------------------

/**
 * Sent when a danger sign (or a self-harm risk) was reported but Gemini
 * failed or returned nothing (often its own safety filter), the parent hit
 * the hourly limit, or Gemini's reply broke a safety rule (asked a question
 * after an emergency sign, left out 112, named another helpline). The parent
 * must never get "try again" instead of 112 on these messages. Wording
 * follows the danger-sign and crisis rules in the prompt; pending Dr Atish
 * sign-off (C5), including the EMERGENCY-NOW wording (R3-03).
 */
function safetyFallbackReply(
  childName: string,
  signs: Map<string, string | null>,
  crisis: boolean,
): string {
  const lines: string[] = [];
  const said = [...signs].map(([l, h]) => signInParentWords(l, h).toLowerCase()).join(", ");
  if (dangerLevelOf(signs) === "emergency") {
    lines.push(
      `Thank you for telling me. Because of what you've described (${said}), this is an emergency. Call 112 now or take ${childName} to the nearest hospital now. Stay with ${childName}.`,
    );
    if (crisis) lines.push(`You can also call ${TELE_MANAS}.`);
  } else if (signs.size > 0) {
    lines.push(
      `Thank you for telling me. Because of what you've described (${said}), ${childName} needs to be seen by a doctor today. Take ${childName} to a clinic or hospital today, and call 112 straight away if things get worse.`,
    );
    if (crisis) lines.push(`If you or ${childName} might be in danger right now, call 112. You can also call ${TELE_MANAS}.`);
  } else {
    lines.push(
      `Thank you for telling me. If you or ${childName} might be in danger right now, call 112 straight away, and make sure someone you trust is with you. Keep medicines, blades and anything else that could cause harm out of reach. You can also call ${TELE_MANAS}, any time. A doctor should see ${childName} today.`,
    );
  }
  return `${lines.join(" ")}\n[CHECKIN_COMPLETE]`;
}

// ---------------------------------------------------------------------------
// Reply checks (R3-01, R3-03, R3-13)
// ---------------------------------------------------------------------------

/** Helplines Gemini has named or might name; only 112 and 14416 are allowed. */
const OTHER_HELPLINE =
  /\b(kiran|vandrevala|aasra|icall|sneha|snehi|samaritans|lifeline|sumaitri|mpower|childline|nimhans helpline|connecting trust|fortis stress)\b/i;
/** A number after "call/dial/helpline/number/on" (but not 112 or 14416). */
const CALL_NUMBER = /\b(call|dial|ring|phone|helpline|number)\s*:?\s*(\+?\d[\d\s-]{1,14}\d)/gi;
/** Any long phone-like number (7+ digits), wherever it appears. */
const LONG_NUMBER = /\+?\d[\d\s-]{5,}\d/g;
const ALLOWED_NUMBERS = new Set(["112", "14416"]);

function namesOtherHelpline(text: string): boolean {
  if (OTHER_HELPLINE.test(text)) return true;
  for (const m of text.matchAll(CALL_NUMBER)) {
    const digits = m[2].replace(/\D/g, "");
    if (!ALLOWED_NUMBERS.has(digits)) return true;
  }
  for (const m of text.matchAll(LONG_NUMBER)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 7 && !ALLOWED_NUMBERS.has(digits)) return true;
  }
  return false;
}

/**
 * Common medicines and Indian brands. The assistant must never name one the
 * parent didn't name in this chat (rule 4), for example "so avoid ibuprofen"
 * after an allergy (R3-13).
 */
const MEDICINE_NAMES =
  /\b(paracetamol|acetaminophen|ibuprofen|crocin|calpol|dolo|combiflam|meftal|mefenamic|brufen|ibugesic|nimesulide|aspirin|diclofenac|amoxicillin|amoxycillin|augmentin|azithromycin|azithral|azee|cefixime|cephalexin|penicillin|ondansetron|emeset|domperidone|domstal|cetirizine|levocetirizine|allegra|fexofenadine|montelukast|salbutamol|asthalin|levolin|budesonide|prednisolone|wysolone|dexamethasone|metronidazole|flagyl|ofloxacin|ciprofloxacin|albendazole|zentel|cough syrup|antibiotic cream)\b/gi;

/** Sentences (split on . ! ? and new lines), keeping their end marks. */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?।])\s+|\n+/).filter((x) => x.trim().length > 0);
}

/** Drops sentences that match `bad`, keeping marker lines. */
function dropSentences(text: string, bad: (sentence: string) => boolean): string {
  return text
    .split("\n")
    .map((line) =>
      /^\s*\[(QUICK_OPTIONS|CHECKIN_COMPLETE)/.test(line)
        ? line
        : sentencesOf(line).filter((x) => !bad(x)).join(" "),
    )
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

/** "tap below", "make your summary below": only allowed on the closing reply (R3-03). */
const FINISH_TALK =
  /\btap (below|the button)|\bbutton below\b|\b(generate|make|create) (a |the |your )?(pre-visit )?summary\b|\bneeche (tap|button)/i;

/** Already-reported signs must not come back as "call 112 IF she turns blue" (R3-03). */
const CONDITIONAL_112: Record<string, RegExp> = {
  "Blue lips or skin": /\bif\b[^.!?\n]*\b(turns?|goes|going|gets?|look|looks) (blue|bluish)/i,
  "Seizure or fit": /\bif\b[^.!?\n]*\b(has|have|having|gets?) (a |another )?(fit|seizure|convulsion)/i,
  "Can't be woken or very hard to wake": /\bif\b[^.!?\n]*\b(can'?t|cannot) be woken|\bif\b[^.!?\n]*\bhard to wake/i,
  "Severe breathing difficulty": /\bif\b[^.!?\n]*\b(struggl\w* to breathe|can'?t breathe|breathing gets worse)/i,
};

interface ReplyContext {
  childName: string;
  signs: Map<string, string | null>;
  level: DangerLevel | null;
  support: SupportLevel | null;
  /** Everything the parent typed in this chat (for medicine names they named). */
  parentText: string;
}

/**
 * Checks and fixes a chat reply before the app sees it. Returns the fixed
 * safety reply when a safety rule was broken in a way that can't be patched.
 */
function checkReply(reply: string, ctx: ReplyContext): string {
  let out = reply;
  const parentLower = ctx.parentText.toLowerCase();

  // R3-01: only 112 and Tele-MANAS 14416.
  if (namesOtherHelpline(out)) {
    if (ctx.support === "crisis" || ctx.level === "emergency") {
      return safetyFallbackReply(ctx.childName, ctx.signs, ctx.support === "crisis");
    }
    out = dropSentences(out, namesOtherHelpline);
  }

  // R3-13 / rule 4: no medicine the parent didn't name.
  const withoutMeds = dropSentences(out, (x) =>
    [...x.matchAll(MEDICINE_NAMES)].some((m) => !parentLower.includes(m[0].toLowerCase())),
  );
  if (withoutMeds !== out) {
    out = withoutMeds;
    // The question went with it: no answer chips without a question.
    if (!out.replace(/\[QUICK_OPTIONS:[^\]]*\]/g, "").includes("?")) {
      out = out.replace(/\n?\[QUICK_OPTIONS:[^\]]*\]/g, "");
    }
  }

  // Grammar slip seen in replies: "a emergency".
  out = out.replace(/\b([Aa]) (emergency|urgent|immediate|ambulance)\b/g, (_m, a, w) => `${a}n ${w}`);

  const complete = out.includes("[CHECKIN_COMPLETE]");
  const visible = out.replace(/\[QUICK_OPTIONS:[^\]]*\]/g, "").replace("[CHECKIN_COMPLETE]", "");
  const asks = visible.includes("?") || /\[QUICK_OPTIONS:/.test(out);

  // R3-03 EMERGENCY-NOW: 112 now, no questions, no "call 112 if <sign
  // already reported>", and the check-in ends.
  if (ctx.level === "emergency") {
    const conditional = [...ctx.signs.keys()].some((l) => CONDITIONAL_112[l]?.test(visible));
    if (asks || !/\b112\b/.test(visible) || conditional) {
      return safetyFallbackReply(ctx.childName, ctx.signs, ctx.support === "crisis");
    }
    if (!complete) out = `${out.trim()}\n[CHECKIN_COMPLETE]`;
    return out;
  }

  // C2 crisis: 112 first, no questions, the check-in ends.
  if (ctx.support === "crisis") {
    if (asks || !/\b112\b/.test(visible)) {
      return safetyFallbackReply(ctx.childName, ctx.signs, true);
    }
    if (!complete) out = `${out.trim()}\n[CHECKIN_COMPLETE]`;
    return out;
  }

  // R3-03: "tap below to finish" only on a reply that really finishes.
  if (!complete || asks) out = dropSentences(out, (x) => FINISH_TALK.test(x));
  return out.replace(/\[QUICK_OPTIONS:[^\]]*\]|\[CHECKIN_COMPLETE\]/g, "").trim()
    ? out
    : `Thank you for telling me. Is there anything else about how ${ctx.childName} is doing that you'd like the doctor to know?`;
}

// ---------------------------------------------------------------------------
// Reply language (R2-07)
// ---------------------------------------------------------------------------

/** Non-Latin Indian scripts a parent might type in. */
const SCRIPTS: { name: string; re: RegExp }[] = [
  { name: "Devanagari script (Hindi, or Marathi if that is what the parent wrote)", re: /[\u0900-\u097F]/ },
  { name: "Bengali script", re: /[\u0980-\u09FF]/ },
  { name: "Gurmukhi script (Punjabi)", re: /[\u0A00-\u0A7F]/ },
  { name: "Gujarati script", re: /[\u0A80-\u0AFF]/ },
  { name: "Odia script", re: /[\u0B00-\u0B7F]/ },
  { name: "Tamil script", re: /[\u0B80-\u0BFF]/ },
  { name: "Telugu script", re: /[\u0C00-\u0C7F]/ },
  { name: "Kannada script", re: /[\u0C80-\u0CFF]/ },
  { name: "Malayalam script", re: /[\u0D00-\u0D7F]/ },
];

/**
 * Common Hindi words in Roman letters. Words that are also English ("me",
 * "ho", "pet", "lag") are left out so English text never counts as Hinglish.
 */
const HINGLISH_WORDS = new Set([
  "hai", "hain", "tha", "thi", "the", "nahi", "nahin", "nhi", "kya", "kyun", "kyon", "kaise",
  "bahut", "bohot", "bahot", "thoda", "thodi", "raha", "rahi", "rahe", "gaya", "gayi", "gaye",
  "kal", "aaj", "se", "ko", "mein", "mai", "main", "ka", "ki", "ke", "bhi", "aur", "bukhar",
  "bukhaar", "khana", "khaana", "dard", "ulti", "ulta", "dast", "khansi", "khaansi", "jukam",
  "zukam", "neend", "bachha", "bachcha", "bacche", "haan", "toh", "abhi", "kuch", "kar", "karta",
  "karti", "karna", "lagta", "lagti", "usko", "use", "uska", "uski", "mera", "meri", "mere",
  "hua", "hui", "hota", "hoti", "sir", "pani", "paani", "doodh", "baar", "din", "raat",
]);
// "the", "use", "main", "sir" are English too: they only count alongside
// clearly Hindi words (see isHinglish).
const AMBIGUOUS_HINGLISH = new Set(["the", "use", "main", "sir", "din"]);

function isHinglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  const hits = words.filter((w) => HINGLISH_WORDS.has(w));
  const clear = hits.filter((w) => !AMBIGUOUS_HINGLISH.has(w));
  return clear.length >= 2 && hits.length / words.length >= 0.25;
}

/**
 * The language the next reply must use, worked out here rather than left to
 * the model: English unless the parent's own typed text is in another
 * language. The newest message that settles it wins. Tapped options and tile
 * names (short Roman-letter answers such as "Yes", "2-3 days", "Fever,
 * Cough") never change it; any text in an Indian script does.
 */
function replyLanguage(transcript: ChatMessage[]): string {
  for (let i = transcript.length - 1; i >= 0; i--) {
    const m = transcript[i];
    if (m.role !== "user") continue;
    const script = SCRIPTS.find((s) => s.re.test(m.content));
    if (script) return script.name;
    const words = m.content.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 3) continue; // likely a tapped option or tile
    if (isHinglish(m.content)) return "HINGLISH";
    return "ENGLISH";
  }
  return "ENGLISH";
}

function languageRule(transcript: ChatMessage[]): string {
  const lang = replyLanguage(transcript);
  const firstReply = !transcript.some((m) => m.role === "assistant");
  let rule: string;
  if (lang === "ENGLISH") {
    rule =
      "Write THIS reply in simple Indian English with Indian terms (for example ORS, nappies or diapers). Do not use Hindi or any other language or script, even if earlier replies did.";
  } else if (lang === "HINGLISH") {
    rule =
      "The parent typed in Hinglish (Hindi in Roman letters). Write THIS reply in simple Hinglish in Roman letters. Never use Devanagari or any other script.";
  } else {
    rule = `The parent typed in ${lang}. Write THIS reply in that same language and script, in simple words.`;
  }
  const greeting = firstReply
    ? "You may greet the parent briefly in this first reply."
    : "This is not the first reply: do not greet again (no Hello, Hi or Namaste); go straight on.";
  return `LANGUAGE: ${rule} Short answers the parent tapped (Yes, No, 2-3 days) and symptom tile names are always in English and say nothing about the parent's language. ${greeting} Write [QUICK_OPTIONS] in the same language and script as this reply. Never translate the markers [QUICK_OPTIONS: ...] or [CHECKIN_COMPLETE].`;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function allergyText(child: ChildContext, none: string): string {
  if (child.allergies.length > 0) return child.allergies.join(", ");
  return child.allergiesNotKnown ? "Not known yet (the parent wasn't sure)" : none;
}

/**
 * The emergencies still worth warning about ("struggling to breathe, turns
 * blue, has a fit or can't be woken"), leaving out any the parent already
 * reported. Empty when all four were reported.
 */
function emergencyIfList(childName: string, signs: Map<string, string | null>): string {
  const all: [string, string][] = [
    ["Severe breathing difficulty", `${childName} is struggling to breathe`],
    ["Blue lips or skin", "turns blue"],
    ["Seizure or fit", "has a fit"],
    ["Can't be woken or very hard to wake", "can't be woken"],
  ];
  const left = all.filter(([l]) => !signs.has(l)).map(([, t]) => t);
  if (left.length === 0) return "";
  // The first item names the child; later ones read on ("..., turns blue").
  if (!left[0].startsWith(childName)) left[0] = `${childName} ${left[0]}`;
  return left.length === 1 ? left[0] : `${left.slice(0, -1).join(", ")} or ${left[left.length - 1]}`;
}

function buildSystemPrompt(
  child: ChildContext,
  transcript: ChatMessage[],
  danger: { signs: Map<string, string | null>; latest: string[]; level: DangerLevel | null },
  support: { level: SupportLevel | null; isNew: boolean } = { level: null, isNew: false },
): string {
  const allergyList = allergyText(child, "None known");
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
  const signList = askSignsFor(child.ageDays).map((s) => `- ${s.label}`).join("\n");
  const olderChild = typeof child.ageDays === "number" && child.ageDays > 1825;

  // "Call 112 if ..." lists only emergencies the parent has NOT reported:
  // never "call 112 if he turns blue" after they said his lips are blue (R3-03).
  const ifWorse = emergencyIfList(child.name, danger.signs);
  const said = (labels: string[]) =>
    labels.map((l) => signInParentWords(l, danger.signs.get(l) ?? null)).join(", ");
  const allLabels = [...danger.signs.keys()];

  // EMERGENCY-NOW and its wording: pending Dr Atish sign-off (C5).
  let dangerBlock = "";
  if (danger.level === "emergency") {
    const emergencyLabels = allLabels.filter((l) => isEmergency(l, danger.signs.get(l) ?? null));
    const isNew = danger.latest.some((l) => emergencyLabels.includes(l));
    dangerBlock = isNew
      ? `

EMERGENCY SIGN JUST REPORTED: ${said(emergencyLabels)}.
THIS reply must be short and calm, and must: say, in the parent's own words for the sign (adding nothing they didn't say), that this is an emergency; tell them to call 112 now or take ${child.name} to the nearest hospital now; tell them to stay with ${child.name}. Do NOT say "seen today" and do NOT say "call 112 if" about something the parent has already told you. Ask NO questions, give NO [QUICK_OPTIONS], and do not say "tap below". End with [CHECKIN_COMPLETE].`
      : `

AN EMERGENCY SIGN WAS REPORTED EARLIER: ${said(emergencyLabels)}. You have already told the parent to call 112 or go to the hospital now. Ask NO questions and give NO [QUICK_OPTIONS]. Remind them in one sentence to call 112 now or go to the nearest hospital now, and end with [CHECKIN_COMPLETE].`;
  } else if (danger.latest.length > 0) {
    dangerBlock = `

DANGER SIGN JUST REPORTED: ${said(danger.latest)}.
In THIS reply, before anything else, tell the parent calmly and clearly (describe the sign in the parent's own words, adding nothing they didn't say; if they said "a little" or "thoda", say it that way): because of this, ${child.name} needs to be seen by a doctor today. Take ${child.name} to a clinic or hospital today${ifWorse ? `, and call 112 straight away if ${ifWorse}` : ""}. Then ask at most one or two more short questions (or none) and finish with [CHECKIN_COMPLETE] so the parent can get help quickly.`;
  } else if (allLabels.length > 0) {
    dangerBlock = `

A DANGER SIGN WAS REPORTED EARLIER: ${said(allLabels)}. You have already told the parent to get ${child.name} seen today. Do not repeat it in full; if the parent asks whether ${child.name} is ok, remind them briefly. Wrap up soon with [CHECKIN_COMPLETE].`;
  }

  let supportBlock = "";
  if (support.level === "crisis") {
    supportBlock = support.isNew
      ? `

SELF-HARM OR SUICIDE RISK JUST MENTIONED. It may be about ${child.name} OR about the parent themselves (for example a tired, low new mother), or a fear of harming the baby. In THIS reply, before anything else, and calmly: thank the parent for telling you and say they are not alone; say that if they or ${child.name} might be in danger right now, call 112 straight away; if the parent is the one at risk, ask them to make sure ${child.name} is safe (for a baby: in the cot or with another adult) and to have someone they trust with them now; keep medicines, blades and other things that could cause harm out of reach. Say they can also call ${TELE_MANAS}, any time. Say a doctor should see ${child.name} today. ${HELPLINE_RULE} Do not ask any more questions. Do not judge, lecture or diagnose. End with [CHECKIN_COMPLETE].`
      : `

Self-harm or suicide risk was mentioned earlier and you have already given the 112 and Tele-MANAS advice. Do not ask more questions; remind the parent briefly to call 112 if they or ${child.name} are in danger now, and end with [CHECKIN_COMPLETE]. ${HELPLINE_RULE}`;
  } else if (support.level === "concern") {
    supportBlock = `

MOOD OR EMOTIONAL HEALTH CONCERN. The parent is worried about how ${child.name} is feeling, OR is telling you about their OWN feelings (crying every day, exhausted, low or alone, often after a birth).${
      support.isNew
        ? ` In THIS reply, start with one or two calm, kind sentences. If it is about ${child.name}: it's good they are paying attention to how ${child.name} feels, and they are not alone. If it is about the parent: thank them for telling you, say many parents feel this way and it is not their fault, and that their wellbeing matters too. Mention once that they can talk to a counsellor at ${TELE_MANAS}. Then ask your first question.`
        : ` You have already mentioned Tele-MANAS; don't repeat it.`
    }
For a worry about ${child.name}, ask gently, one at a time, about: how long it has been going on, sleep, eating, school or friends, and whether anything changed recently. For the parent's own feelings, ask gently how long they have felt this way and whether they have someone to help them; then continue with ${child.name}'s check-in if there is one. Never label it ("depression", "anxiety disorder", "postpartum depression"), never judge the parent or child, and never suggest medicines. ${HELPLINE_RULE}`;
  }

  return `You are a warm, professional pediatric health assistant helping a parent describe their child's symptoms so a pediatrician has a clear picture. You are collecting symptoms — NOT diagnosing.

The family lives in India. The emergency number is 112. ${HELPLINE_RULE}

${languageRule(transcript)}

CHILD PROFILE:
- Name: ${child.name}
- Age: ${child.age}
- Weight: ${child.weight ? `${child.weight} kg` : "Not recorded"}
- Height: ${child.height ? `${child.height} cm` : "Not recorded"}
- Known allergies: ${allergyList}
- Chronic conditions: ${conditionList}
- Current medications: ${medList}

DANGER SIGNS for a child this age:
${signList}

RULES:
1. Ask 5–8 focused follow-up questions, ONE at a time.
2. Cover: onset, severity, location, associated symptoms, triggers, fluid/food intake, and what has been tried. Ask about medicine ONCE, and only if the parent hasn't already said whether they gave any (for example "gave a syrup at 8 am", "no medicine yet", or they tapped "No"); ask it like this: "Have you given ${child.name} any medicine for this? If yes, which one, how much and when?" If they already said, do not ask again.
3. Be warm but clinical. Use the child's name naturally.
4. NEVER diagnose, prescribe, or suggest medication. NEVER name any medicine, drug or brand, not even as an example, and never say which medicine to avoid. If the parent names one in this chat, you may repeat their words.
5. Stay calm and kind, but when the parent reports a danger sign, always tell them clearly in that same reply to get ${child.name} seen by a doctor today${ifWorse ? `, or to call 112 if ${ifWorse}` : ""}. If ${child.name} has a fit, blue lips or skin, can't be woken or is struggling to breathe RIGHT NOW, the reply is only: call 112 now or go to the nearest hospital now, with no more questions. Never hide this to keep the mood light.
6. If the parent asks a direct question such as "is she ok?" or "should I worry?", answer it first in one or two honest sentences: you can't examine ${child.name}; if a danger sign has been reported, say clearly that ${child.name} should be seen today; otherwise say the doctor will review the answers and which signs would mean going to a doctor today.
7. When the illness could be serious (any child under 3 months, or breathing trouble, fever, vomiting or loose motions, or unusual sleepiness), check the danger signs above that fit. Only ask about signs in the list above for a child this age.${
    olderChild
      ? ` ${child.name} is older than 5: ask about a danger sign only when it fits the symptoms (breathing questions for cough or breathlessness; "very sleepy or hard to wake" only after a head injury, a fit, high fever or repeated vomiting). Never ask baby questions (feeding from the breast or bottle, nappies, grunting) and don't ask "hard to wake" for a mood, school, skin or tummy concern.`
      : ""
  } Ask about ONE sign per question. Never put two signs in one question: ask "Is ${child.name} breathing faster than usual?" and, separately, "Is ${child.name}'s chest sucking in with each breath?".
8. If the parent's reply does not answer your question (for example you asked about breathing and they told you about drinking water), thank them for it and ask your question again ONCE, briefly. If they still don't answer it, move on.
9. When you have enough information to prepare a summary, end your FINAL message with EXACTLY this marker on its own line:
   [CHECKIN_COMPLETE]
   The final message must NOT ask a question and must NOT include [QUICK_OPTIONS]: thank the parent and say they can now make a summary to review and book a doctor. Only that final message may mention making the summary or say "tap below"; never say it in a message that asks a question. Do NOT say the summary has been sent to the doctor, that the doctor has it, or that it is "ready for the doctor": nothing is shared until the parent books. If you still want to ask something, ask it without the marker and add the marker on a later message.
10. Keep responses concise (2–3 sentences max per question).
11. If the parent mentions a known allergy or condition from the profile, acknowledge it in one short sentence and say only that the doctor will take it into account. Rule 4 still applies: give no medicine advice because of an allergy (never "so avoid ..."), and if the allergy is to a medicine the parent has not named in this chat, call it "the allergy in ${child.name}'s profile" instead of naming the medicine.
12. NEVER re-ask something the parent has already answered, including details in their first message (for example a temperature they already gave). Read the whole conversation before each question. (Rule 8 is the only exception.)
13. Nothing is booked yet. Do NOT mention a visit, appointment or consultation (no "your visit", "your appointment"); say "the doctor" instead.
14. For questions where the parent can answer from a limited set of choices, append EXACTLY this line AFTER your question (on its own line), with options separated by " | ":
   [QUICK_OPTIONS: Option 1 | Option 2 | Option 3 | Option 4]
   - Never put a comma inside an option. Keep each option short (1–4 words).
   - The options MUST answer the exact question you asked. If the question is about a sore throat, every option is about the sore throat. If you ask about two things, ask about one instead.
   Use this for:
   - Yes/No/Not sure questions (including each danger sign) → [QUICK_OPTIONS: Yes | No | Not sure]
   - Duration → [QUICK_OPTIONS: Just started | Since yesterday | 2-3 days | A week or more]
   - Severity → [QUICK_OPTIONS: Mild | Moderate | Severe]
   - Fever temperature → [QUICK_OPTIONS: Below 100°F | 100-101°F | 101-103°F | Above 103°F]
   - Eating/drinking → [QUICK_OPTIONS: Eating normally | Eating less | Refusing to eat]
   - Cough type → [QUICK_OPTIONS: Dry cough | Wet or phlegmy | Barking cough | No cough]
   - Energy level → [QUICK_OPTIONS: Active as usual | A bit tired | Very tired | Lethargic]
   - Sleep impact → [QUICK_OPTIONS: Sleeping normally | Waking up often | Can't sleep]
   Do NOT include [QUICK_OPTIONS] for free-text questions like "Tell me more about..." or the first open-ended question.${dangerBlock}${supportBlock}`;
}

/** Appended to a chat reply while danger signs are reported (C3). */
const DANGER_MARKER_PREFIX = "[DANGER_SIGNS:";
/** Appended with it: "[DANGER_LEVEL: emergency]" or "[DANGER_LEVEL: urgent]" (R3-03). */
const DANGER_LEVEL_MARKER_PREFIX = "[DANGER_LEVEL:";
const NOT_SURE_LABEL = "Parent not sure";

const MEDICINES_LABEL = "Medicines given";
const NO_MEDICINE = "No medicine given yet";
const DANGER_LABEL = "Danger signs reported";
const MOOD_LABEL = "Mood or emotional health";
const CRISIS_LABEL = "Self-harm or suicide risk";

/** Detail values that carry no information ("Not specified"). */
const FILLER_VALUE =
  /^(not (reported|specified|mentioned|discussed|stated|known|provided|asked|applicable|described)|unknown|unspecified|n\/?a|none (reported|mentioned|specified|stated)|no information( given)?|null|-|—)\.?$/i;
/** medicinesGiven values meaning "the parent said none". */
const EXPLICIT_NONE =
  /^(none|no|nothing|no medicines?( given)?( yet)?|none given( yet)?|not given any|no medicine has been given)\.?$/i;
/** medicinesGiven values meaning "not discussed". */
const NOT_DISCUSSED = /^(null|n\/a|not discussed|not asked|not mentioned|unknown)\.?$/i;

/** "Allergies:", "Allergy note -", "Allergy warning:" at the start (repeated). */
const ALLERGY_PREFIX = /^(\s*allerg(y|ies)(\s+(note|warning|alert))?\s*[:\-–]\s*)+/i;

/** Clinical labels a parent should never see as their child's headline. */
const CLINICAL_LABELS =
  /ideation|suicid|self[- ]?harm|depress|anxiety disorder|psych|pyrexi|emesis|letharg|dyspn|tachyp|cyanos|febrile|\bthe parent\b|tele-?manas|\b112\b/i;

/**
 * The headline the parent sees (R2-08). chiefComplaint stays clinical for
 * the doctor; this one is plain. Falls back to safe wording when the model
 * leaves it out or slips in a clinical label.
 */
function parentSummaryFor(parsed: any, support: SupportLevel | null, childName: string): string {
  if (support === "crisis") return `Worried about ${childName}'s safety and feelings`;
  const own = typeof parsed.parentSummary === "string" ? parsed.parentSummary.trim() : "";
  if (own && !CLINICAL_LABELS.test(own)) return own;
  if (support === "concern") return `Worried about how ${childName} is feeling`;
  const chief = typeof parsed.chiefComplaint === "string" ? parsed.chiefComplaint.trim() : "";
  if (chief && !CLINICAL_LABELS.test(chief)) return chief;
  return `What you told us about ${childName}`;
}

/**
 * Cleans the model's summary JSON before the app sees it:
 * - drops filler rows ("What makes it worse: Not specified");
 * - folds medicines into `details` (the app's parser keeps only fixed fields)
 *   and keeps "No medicine given yet" when the parent said none;
 * - raises suggestedUrgency to 'urgent' when the parent reported a danger
 *   sign, and lists the signs for the doctor;
 * - adds `mentalHealth` ('concern' | 'crisis' | null) for the app's support
 *   card, and a row for the doctor; 'crisis' is always 'urgent';
 * - sets `parentSummary`, a plain headline for the parent (chiefComplaint
 *   stays clinical for the doctor), and strips an "Allergies:" prefix from
 *   allergyNote (R2-08).
 * Unparseable output is returned unchanged; the client reports it.
 */
function postProcessSummary(
  content: string,
  transcript: ChatMessage[],
  ageDays: number | undefined,
  childName: string,
): string {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return content;
  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return content;
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.details)) return content;

  parsed.details = parsed.details.filter(
    (d: any) =>
      typeof d?.label === "string" &&
      d.label.trim() &&
      typeof d?.value === "string" &&
      d.value.trim() &&
      !FILLER_VALUE.test(d.value.trim()),
  );

  const meds = typeof parsed.medicinesGiven === "string" ? parsed.medicinesGiven.trim() : "";
  const isMedRow = (d: any) => d.label.trim().toLowerCase() === MEDICINES_LABEL.toLowerCase();
  const medRow = parsed.details.find(isMedRow);
  let medValue: string | null;
  if (!meds || NOT_DISCUSSED.test(meds)) medValue = null;
  else if (EXPLICIT_NONE.test(meds)) medValue = NO_MEDICINE;
  else medValue = meds;
  if (medRow && EXPLICIT_NONE.test(medRow.value.trim())) medRow.value = NO_MEDICINE;
  parsed.medicinesGiven = medValue ?? medRow?.value ?? null;
  if (medValue && !medRow) parsed.details.push({ label: MEDICINES_LABEL, value: medValue });

  // R3-15: the parent's own words ("a little") win over the model's wording;
  // a sign only the summary mentions is added as stated.
  const signs = transcriptSigns(transcript, ageDays);
  for (const s of signsInSummary(parsed, ageDays)) if (!signs.has(s)) signs.set(s, null);
  if (signs.size > 0) {
    parsed.suggestedUrgency = "urgent";
    const list = [...signs].map(([l, h]) => signInParentWords(l, h)).join(", ");
    const existing = parsed.details.find((d: any) => d.label === DANGER_LABEL);
    if (existing) existing.value = list;
    else parsed.details.unshift({ label: DANGER_LABEL, value: list });
  }
  softenHedged(parsed, signs);
  // R3-03: optional, so older summaries (without it) still parse.
  parsed.emergencyNow = dangerLevelOf(signs) === "emergency";

  // R3-21: "Not sure" is an answer: "Parent not sure", never "Not answered".
  markNotSure(parsed, transcript, ageDays);

  // R2-08: the label is the app's job; "Allergies: Allergies: ..." was shown.
  if (typeof parsed.allergyNote === "string") {
    const note = parsed.allergyNote.replace(ALLERGY_PREFIX, "").trim();
    parsed.allergyNote = note && !FILLER_VALUE.test(note) && !EXPLICIT_NONE.test(note) ? note : null;
  }

  const support = supportLevel(transcript);
  parsed.mentalHealth = support;
  parsed.parentSummary = parentSummaryFor(parsed, support, childName);
  parsed.details = parsed.details.filter((d: any) => d.label !== CRISIS_LABEL);
  if (support === "crisis") {
    parsed.suggestedUrgency = "urgent";
    parsed.details.unshift({
      label: CRISIS_LABEL,
      value: "Raised in the check-in (read it in full). 112 and Tele-MANAS 14416 were shown in the app.",
    });
  } else if (support === "concern" && !parsed.details.some((d: any) => d.label === MOOD_LABEL)) {
    parsed.details.push({ label: MOOD_LABEL, value: "Raised by the parent" });
  }
  return JSON.stringify(parsed);
}

/**
 * R3-15: when the parent only half-confirmed a sign ("a little"), the model
 * still tends to write "very sleepy / lethargy". Those words are replaced by
 * the parent's: "Sleepy (parent said "a little")" for the doctor's rows and
 * clinical line, "sleepy (a little)" in the parent's headline.
 */
function softenHedged(parsed: any, signs: Map<string, string | null>): void {
  for (const [label, hedge] of signs) {
    if (hedge === null) continue;
    const sign = SIGN_BY_LABEL.get(label);
    if (!sign) continue;
    const soften = (text: string, replacement: string): string => {
      let out = text;
      // Whole words: "lethargic", not "letharg" + "ic".
      for (const re of sign.patterns) out = out.replace(new RegExp(`\\w*(?:${re.source})\\w*`, "gi"), replacement);
      // "very sleepy/lethargic" became the replacement twice: keep one.
      const esc = replacement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return out.replace(new RegExp(`${esc}(\\s*(/|,|and|or)\\s*${esc})+`, "gi"), replacement);
    };
    const forDoctor = signInParentWords(label, hedge).replace(/^./, (c) => c.toLowerCase());
    for (const d of parsed.details as any[]) {
      if (d.label === DANGER_LABEL) continue;
      const v = soften(d.value, forDoctor);
      if (v !== d.value) d.value = v.replace(/^./, (c: string) => c.toUpperCase());
    }
    if (typeof parsed.chiefComplaint === "string") parsed.chiefComplaint = soften(parsed.chiefComplaint, forDoctor);
    if (typeof parsed.parentSummary === "string") {
      parsed.parentSummary = soften(parsed.parentSummary, `${sign.mild.toLowerCase()} (${hedge})`);
    }
  }
}

/** Words of a question, for a loose match ("Is she breathing fast?"). */
function questionWords(q: string): Set<string> {
  return new Set(q.toLowerCase().match(/[a-z]{4,}/g) ?? []);
}

/**
 * Questions the parent answered "Not sure" to. Rows the model wrote as
 * "Not answered" for those questions (or with the value "Not sure") become
 * "Parent not sure"; a danger-sign question answered "Not sure" that the
 * model left out is added, so the doctor sees it (R3-21).
 */
function markNotSure(parsed: any, transcript: ChatMessage[], ageDays: number | undefined): void {
  const signs = signsFor(ageDays);
  const notSure: string[] = [];
  transcript.forEach((m, i) => {
    const prev = transcript[i - 1];
    if (m.role !== "user" || prev?.role !== "assistant" || !NOT_SURE.test(m.content)) return;
    const qs = questionsIn(prev.content.replace(/\[QUICK_OPTIONS:[^\]]*\]/g, "")).trim();
    const parts = qs.split(/(?<=\?)\s+/).filter(Boolean);
    const q = parts[parts.length - 1];
    if (q) notSure.push(q);
  });
  const sameQuestion = (a: string, b: string) => {
    const sa = signsInText(a, signs, false);
    if (sa.length > 0 && signsInText(b, signs, false).some((x) => sa.includes(x))) return true;
    const wa = questionWords(a);
    const wb = questionWords(b);
    if (wa.size === 0 || wb.size === 0) return false;
    let shared = 0;
    wa.forEach((w) => wb.has(w) && shared++);
    return shared / Math.min(wa.size, wb.size) >= 0.6;
  };
  for (const d of parsed.details as any[]) {
    if (NOT_SURE.test(d.value) || /^not sure\.?$/i.test(d.value.trim())) {
      d.value = NOT_SURE_LABEL;
    } else if (/^not answered$/i.test(d.label.trim()) && notSure.some((q) => sameQuestion(q, d.value))) {
      d.label = NOT_SURE_LABEL;
    }
  }
  for (const q of notSure) {
    if (signsInText(q, signs, false).length === 0) continue;
    const shown = (parsed.details as any[]).some(
      (d) => (d.label === NOT_SURE_LABEL && sameQuestion(q, d.value)) || (d.value === NOT_SURE_LABEL && sameQuestion(q, d.label)),
    );
    if (!shown) parsed.details.push({ label: NOT_SURE_LABEL, value: q });
  }
}

function buildSummaryPrompt(child: ChildContext): string {
  const signList = signsFor(child.ageDays).map((s) => s.label).join("; ");
  return `You are a medical summarization assistant. Given the parent-AI conversation about ${child.name}'s symptoms (a child in India), produce a structured JSON summary. Respond ONLY with valid JSON, no markdown or extra text.

Format:
{
  "chiefComplaint": "Brief one-line complaint in clinical terms, for the doctor",
  "parentSummary": "The same in one short, kind line for the parent, in everyday words",
  "details": [
    { "label": "When it started", "value": "..." },
    { "label": "Severity", "value": "..." },
    { "label": "What makes it worse", "value": "..." },
    { "label": "Associated symptoms", "value": "..." },
    { "label": "Fluids/Food intake", "value": "..." },
    { "label": "Not answered", "value": "Is she breathing fast?" }
  ],
  "relevantHistory": "Any relevant past medical history or null",
  "allergyNote": "Allergy warning for the doctor, without an 'Allergies:' label (for example 'Peanut: ask before prescribing'), or null",
  "medicinesGiven": "Medicines the parent has already given: name, dose and when last given, in the parent's words. \\"none\\" if the parent said no medicine was given. null if it was not discussed",
  "suggestedUrgency": "routine | soon | urgent"
}

PARENT SUMMARY RULES:
- "parentSummary" is shown to the parent at the top of the summary. Write it in plain, everyday words, the way a kind nurse would say it back ("Fever and cough for 2 days, eating less").
- Never use clinical labels or jargon in it: no "suicidal ideation", "self-harm ideation", "depression", "anxiety disorder", "pyrexia", "emesis", "lethargy", "dyspnoea". For a self-harm or suicide worry write something like "Worried about ${child.name}'s safety and feelings".
- Never mention 112, Tele-MANAS or what the parent was told; never write about "the parent" in the third person.

DETAILS RULES:
- The labels above are examples. Include a row ONLY when the parent gave an answer for it. Leave a row out rather than writing "Not specified", "Not reported" or "Unknown".
- You may add rows such as "Breathing", "Energy level" or "Wet nappies" when they were discussed.
- If the parent is worried about the child's mood or emotional health, add a row { "label": "Mood or emotional health", "value": "<what the parent described, in their words>" }.
- Danger signs for this age: ${signList}. If the assistant asked about one of these and the parent never answered it (or answered something else), add one row { "label": "Not answered", "value": "<the question, short>" } for each such question.
- If the parent answered "Not sure" (or "pata nahi", "don't know") to a question, that is an answer: write the row with the value "Parent not sure" (for example { "label": "Breathing fast", "value": "Parent not sure" }). Never list it under "Not answered".
- Only include facts the parent actually stated or confirmed. Never add a symptom the parent did not confirm.
- Word every answer exactly as strongly as the parent did. A hedged yes ("a little", "a bit", "thoda", "sometimes") stays mild: "a little sleepy", never "very sleepy" or "lethargy". Never make the child sound better either: "playing a bit" is "playing a little", not "active"; "eating less" is not "eating normally".
- A danger sign stays in the summary even when the parent said "a little", worded as they said it.
- Never name a medicine or brand the parent did not name.
- Write every value in simple English for the doctor, even when the conversation was in Hindi or another language (translate the parent's words faithfully).

URGENCY:
- "urgent": the parent reported any danger sign above, or anything that needs a doctor today.
- "soon": should be seen within a day or two.
- "routine": everything else.

Child allergies: ${allergyText(child, "None")}
Child conditions: ${child.conditions.join(", ") || "None"}`;
}

/** Calls Gemini; retries once after a short wait when Gemini is busy (429/503). */
async function callModel(messages: ChatMessage[]): Promise<string> {
  try {
    return await callModelOnce(messages);
  } catch (e) {
    if (!(e instanceof UpstreamError) || e.code !== "busy") throw e;
    console.warn(`[ai-checkin] Gemini busy, retrying once: ${e.detail}`);
    await sleep(1500);
    return await callModelOnce(messages);
  }
}

async function callModelOnce(messages: ChatMessage[]): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new UpstreamError(503, FRIENDLY_UNAVAILABLE, "GEMINI_API_KEY not configured");
  }

  let response: Response;
  try {
    response = await fetch(GEMINI_API_URL, {
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
        // Thinking tokens count against max_tokens; the replies are short.
        reasoning_effort: "none",
      }),
    });
  } catch (e: any) {
    throw new UpstreamError(502, FRIENDLY_UNAVAILABLE, `Gemini fetch failed: ${e?.message ?? e}`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    const busy = response.status === 429 || response.status === 503;
    throw new UpstreamError(
      busy ? 503 : 502,
      busy ? FRIENDLY_BUSY : FRIENDLY_UNAVAILABLE,
      `Gemini API error (${response.status}): ${errorText}`,
      busy ? "busy" : "unavailable",
    );
  }

  const data = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new UpstreamError(502, FRIENDLY_UNAVAILABLE, "Gemini returned an empty response");
  }
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
  const admin = createAdminClient();
  const caller = await getCaller(req, admin);
  if (!caller) {
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
  if (
    body.messages.length > MAX_MESSAGES ||
    body.messages.some(
      (m: any) =>
        !m ||
        !["user", "assistant", "system"].includes(m.role) ||
        typeof m.content !== "string" ||
        m.content.length > MAX_MESSAGE_CHARS,
    )
  ) {
    return json({ error: "Invalid messages" }, 400);
  }
  // Tolerate missing profile lists rather than crashing the prompt builder.
  const asList = (v: unknown) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  body.child = {
    ...body.child,
    name: String(body.child.name ?? "your child").slice(0, 80),
    age: String(body.child.age ?? "unknown").slice(0, 40),
    allergies: asList(body.child.allergies),
    conditions: asList(body.child.conditions),
    medications: Array.isArray(body.child.medications)
      ? body.child.medications.filter((m: any) => m && typeof m.name === "string")
      : [],
    ageDays:
      typeof body.child.ageDays === "number" && Number.isFinite(body.child.ageDays)
        ? body.child.ageDays
        : undefined,
    allergiesNotKnown: body.child.allergiesNotKnown === true,
  };
  const transcript = body.messages.filter((m) => m.role !== "system");
  if (body.action !== "chat" && body.action !== "summary") {
    return json({ error: "Unknown action" }, 400);
  }

  // Danger signs and support level, worked out before the rate limit so a
  // limited parent reporting a danger sign still gets 112 (R2-02).
  const lastUser = transcript.map((m) => m.role).lastIndexOf("user");
  const earlier = lastUser >= 0 ? transcript.slice(0, lastUser) : transcript;
  const found = transcriptSigns(transcript, body.child.ageDays);
  const all = [...found.keys()];
  const level = dangerLevelOf(found);
  const before = signsInTranscript(earlier, body.child.ageDays);
  const latest = all.filter((s) => !before.includes(s));
  const support = supportLevel(transcript);
  const prevSupport = supportLevel(earlier);
  // The newest parent turn, with the question it answers ("Yes" to "Are her
  // lips blue?").
  const newestTurn = lastUser >= 0 ? transcript.slice(Math.max(0, lastUser - 1)) : [];
  const newestSigns = signsInTranscript(newestTurn, body.child.ageDays);
  const newestCrisis = supportLevel(newestTurn) === "crisis";

  /**
   * C3 / R3-03: the app shows a persistent Call 112 card while a danger sign
   * has been reported, worded for the level. lib/groq.ts passes only
   * `content` through, so the signs and the level ride on markers the app
   * strips (like [QUICK_OPTIONS]); `danger` and `dangerLevel` carry the same
   * for any client that reads them.
   */
  const chatResponse = (reply: string) => {
    const content =
      all.length > 0
        ? `${reply}\n${DANGER_MARKER_PREFIX} ${all.join(" | ")}]\n${DANGER_LEVEL_MARKER_PREFIX} ${level}]`
        : reply;
    return json({ content, support, danger: all, dangerLevel: level });
  };

  /** A chat reply that always shows 112, used when Gemini can't be asked. */
  const safetyReply = () => chatResponse(safetyFallbackReply(body.child.name, found, support === "crisis"));

  // Per-user rate limit. If the check itself fails, let the call through:
  // a database hiccup must not stop a worried parent.
  const { data: rl, error: rlErr } = await admin
    .rpc("ai_checkin_take", {
      p_user: caller.id,
      p_action: body.action,
      p_limit: RATE_LIMITS[body.action],
      p_window_seconds: RATE_WINDOW_SECONDS,
    })
    .maybeSingle<{ allowed: boolean; retry_after_seconds: number }>();
  if (rlErr) {
    console.error(`[ai-checkin] rate-limit check failed for ${caller.id}: ${rlErr.message}`);
  } else if (rl && !rl.allowed) {
    const minutes = Math.max(1, Math.ceil(rl.retry_after_seconds / 60));
    console.warn(`[ai-checkin] rate limited ${caller.id} (${body.action}), retry in ${minutes} min`);
    if (body.action === "chat" && (newestSigns.length > 0 || newestCrisis)) {
      return safetyReply();
    }
    return json(
      {
        error: `You've sent a lot of messages in the last hour, so the assistant needs a short break. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}. If ${body.child.name} seems very unwell, visit a clinic now or call 112.`,
        code: "rate_limited",
        retryAfterSeconds: rl.retry_after_seconds,
      },
      429,
    );
  }

  // R2-03: a call that fails is given back, so an outage and its retries
  // never use up the parent's hour.
  const charged = !rlErr && rl?.allowed === true;
  const refund = async () => {
    if (!charged) return;
    const { error } = await admin.rpc("ai_checkin_refund", {
      p_user: caller.id,
      p_action: body.action,
    });
    if (error) console.error(`[ai-checkin] refund failed for ${caller.id}: ${error.message}`);
  };

  try {
    if (body.action === "chat") {
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: buildSystemPrompt(body.child, transcript, { signs: found, latest, level }, {
            level: support,
            isNew: support !== prevSupport,
          }),
        },
        ...transcript,
      ];
      let reply: string;
      try {
        reply = await callModel(messages);
      } catch (e: any) {
        // R2-02: Gemini often returns nothing on exactly these messages
        // (its own safety filter). The parent gets 112, never "try again".
        if (all.length === 0 && support !== "crisis") throw e;
        console.error(
          `[ai-checkin] chat failed for ${caller.id}, sent the fixed safety reply: ${
            e instanceof UpstreamError ? e.detail : e?.message ?? e
          }`,
        );
        await refund();
        return safetyReply();
      }
      // R3-01 / R3-03 / R3-13: safety rules are checked here, not only asked for.
      const checked = checkReply(reply, {
        childName: body.child.name,
        signs: found,
        level,
        support,
        parentText: transcript.filter((m) => m.role === "user").map((m) => m.content).join("\n"),
      });
      if (checked !== reply) console.warn(`[ai-checkin] reply adjusted by the safety checks for ${caller.id}`);
      return chatResponse(checked);
    }

    if (body.action === "summary") {
      const messages: ChatMessage[] = [
        { role: "system", content: buildSummaryPrompt(body.child) },
        ...transcript,
        {
          role: "user",
          content:
            "Now generate the structured summary JSON based on the conversation above.",
        },
      ];
      const content = postProcessSummary(
        await callModel(messages),
        transcript,
        body.child.ageDays,
        body.child.name,
      );
      return json({ content });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e: any) {
    await refund();
    if (e instanceof UpstreamError) {
      console.error(`[ai-checkin] ${body.action} failed for ${caller.id}: ${e.detail}`);
      return json({ error: e.userMessage, code: e.code }, e.status);
    }
    console.error(`[ai-checkin] ${body.action} unexpected error for ${caller.id}:`, e);
    return json({ error: FRIENDLY_UNAVAILABLE, code: "unavailable" }, 500);
  }
});
