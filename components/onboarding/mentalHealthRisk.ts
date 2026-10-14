/**
 * Client-side self-harm / suicide risk words (C2), for screens that show the
 * MentalHealthSupport card without going through the check-in assistant
 * (onboarding c-mental-health). It mirrors CRISIS_PATTERNS + the negation
 * check in supabase/functions/ai-checkin/index.ts, including the phrases the
 * S1 QA finding added (not alive, doesn't want to live, disappear, never wake
 * up, Hindi / Hinglish) and R3-01 (the parent's own words: "ending my life",
 * "hurt myself", "khud ko khatam kar loon", "jaan de doon", "खुद को खत्म",
 * and fear of harming the baby). Keep the two lists in step.
 *
 * Wording of the support card is pending Dr Atish sign-off (C5); this only
 * decides 'concern' vs 'crisis'.
 */
import type { MentalHealthLevel } from '@/components/checkin/MentalHealthSupport';

const CRISIS_PATTERNS: RegExp[] = [
  // Copied from ai-checkin CRISIS_PATTERNS (keep in step).
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
  // Only the parent's own intent or fear: not 'will the medicine harm my baby?'.
  /\bi( might| may| could| will| would|'ll|'d| want to| feel like| am going to|'m going to| am scared i| am afraid i|'m scared i|'m afraid i| think i)( will| might| could| may| would)? (hurt|harm|hit|shake|smother|kill|drop) (the|my|this|our) (baby|child|son|daughter)\b/,
  /\b(thoughts?|urges?|scared|afraid|fear|feel like) (of |to |that i('ll| will| might| may| could)? )?(hurt|harm|hit|shake|smother|kill)(ing)? (the|my|this|our) (baby|child)\b/,
  /\b(baby|bachche|bacche|bachchi|bachi|bacchi) ko (maar|mar) (doon|dun|du|dungi|dunga|daalun|dalun|na)\b/,
  // 'kahin main baby ko nuksan na pahuncha doon', not 'dawai baby ko nuksan to nahi karegi?'.
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
  // Client-only extras (broader on purpose; onboarding free text is short).
  /\bnot (be )?alive\b/,
  /\b(doesn'?t|does not|don'?t|do not|didn'?t) want to (be here|exist)\b/,
  /\bdisappear(ed)? for good\b/,
  /\bnever wake up\b/,
  /\bjee?na nahi?n?\b/,
  /\bmarn[ae] (chah|chaah)/,
  /\bkhud ko nuksaan/,
];

/** Words that cancel a match in the same clause ("never said she wants to die"). */
const NEGATION = /\b(no|not|never|without|isn'?t|aren'?t|wasn'?t|doesn'?t|don'?t|didn'?t|hasn'?t|haven'?t|denies|nor)\b/;

/** True when the text has a self-harm / suicide risk phrase that isn't negated. */
export function hasCrisisWords(text: string): boolean {
  const lower = text.toLowerCase();
  for (const re of CRISIS_PATTERNS) {
    const m = re.exec(lower);
    if (!m) continue;
    const before = lower.slice(Math.max(0, m.index - 30), m.index);
    const clause = before.split(/[.,;!?]| but /).pop() ?? '';
    if (NEGATION.test(clause)) continue;
    return true;
  }
  return false;
}

/** Support level for free text that already raised a concern. */
export function mentalHealthLevel(text: string): MentalHealthLevel {
  return hasCrisisWords(text) ? 'crisis' : 'concern';
}
