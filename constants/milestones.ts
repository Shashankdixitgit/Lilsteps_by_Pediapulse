/**
 * Age-specific developmental milestones (decision C4).
 *
 * 0–5 years: adapted from the CDC "Learn the Signs. Act Early." checklists
 * (2022 revision, the skills ~75% of children show by that age), which the
 * IAP endorses for developmental surveillance in India. Wording is shortened
 * and made plain for parents.
 * 6–15 years: there is no CDC/IAP checklist past 5 years, so these are
 * sensible school-age / teen checkpoints (self-care, learning, friendships,
 * feelings, activity, sleep, puberty).
 *
 * CLINICAL CONTENT: PENDING DOCTOR REVIEW (Dr Atish). Not shown to parents
 * as "pending"; see MILESTONES_REVIEW below. Change the lists only with the
 * reviewing doctor's sign-off.
 *
 * Band rule: a child sees the checklist for the most recent checkpoint they
 * have reached (a 5-month-old sees "By 4 months"), so the list is what most
 * children already do, never what is still ahead.
 */

/** Review status of this file's clinical content. Internal only. */
export const MILESTONES_REVIEW = {
  status: 'pending-doctor-review',
  reviewer: 'Dr Atish',
  sources: ['CDC Learn the Signs. Act Early. (2022)', 'IAP developmental surveillance guidance'],
} as const;

export type MilestoneArea = 'social' | 'language' | 'thinking' | 'movement';

export interface Milestone {
  text: string;
  area: MilestoneArea;
}

export interface MilestoneBand {
  id: string;
  /** Parent-facing heading: "By 6 months". */
  label: string;
  /** Inclusive lower bound, in completed months of age. */
  fromMonths: number;
  items: Milestone[];
}

const s = (text: string): Milestone => ({ text, area: 'social' });
const l = (text: string): Milestone => ({ text, area: 'language' });
const t = (text: string): Milestone => ({ text, area: 'thinking' });
const m = (text: string): Milestone => ({ text, area: 'movement' });

/** Ordered by age. Each band runs until the next band's fromMonths. */
export const MILESTONE_BANDS: MilestoneBand[] = [
  {
    id: 'newborn',
    label: 'In the first weeks',
    fromMonths: 0,
    items: [
      s('Calms down when held or spoken to'),
      s('Looks at your face for a moment'),
      l('Startles or goes quiet at loud sounds'),
      m('Moves both arms and both legs'),
      m('Turns head to the side when on tummy'),
    ],
  },
  {
    id: '2m',
    label: 'By 2 months',
    fromMonths: 2,
    items: [
      s('Smiles when you talk to or smile at them'),
      s('Looks at your face'),
      l('Makes sounds other than crying'),
      l('Reacts to loud sounds'),
      t('Watches you as you move'),
      m('Holds head up when on tummy'),
    ],
  },
  {
    id: '4m',
    label: 'By 4 months',
    fromMonths: 4,
    items: [
      s('Smiles on their own to get your attention'),
      l('Makes cooing sounds like "oooo" and "aahh"'),
      l('Turns head towards your voice'),
      t('Brings hands to mouth'),
      m('Holds head steady without support when held'),
      m('Holds a toy when you put it in their hand'),
      m('Pushes up onto elbows when on tummy'),
    ],
  },
  {
    id: '6m',
    label: 'By 6 months',
    fromMonths: 6,
    items: [
      s('Knows familiar people'),
      s('Laughs'),
      l('Takes turns making sounds with you'),
      t('Reaches to grab a toy they want'),
      m('Rolls from tummy to back'),
      m('Leans on hands to support themselves when sitting'),
    ],
  },
  {
    id: '9m',
    label: 'By 9 months',
    fromMonths: 9,
    items: [
      s('Is shy or clingy around strangers'),
      l('Makes sounds like "mamama" and "bababa"'),
      l('Lifts arms up to be picked up'),
      t('Looks for things when you drop them out of sight'),
      t('Bangs two things together'),
      m('Sits without support'),
      m('Gets to a sitting position on their own'),
    ],
  },
  {
    id: '12m',
    label: 'By 12 months',
    fromMonths: 12,
    items: [
      s('Plays games with you, like pat-a-cake'),
      l('Waves "bye-bye"'),
      l('Calls a parent "mama", "dada" or another special name'),
      l('Understands "no"'),
      t('Looks for things they see you hide'),
      m('Pulls up to stand'),
      m('Walks holding on to furniture'),
      m('Picks up small things between thumb and finger'),
    ],
  },
  {
    id: '15m',
    label: 'By 15 months',
    fromMonths: 15,
    items: [
      s('Shows you an object they like'),
      s('Claps when excited'),
      l('Says one or two words besides "mama" or "dada"'),
      l('Points to ask for something'),
      t('Looks at a familiar object when you name it'),
      m('Takes a few steps on their own'),
      m('Feeds themselves with fingers'),
    ],
  },
  {
    id: '18m',
    label: 'By 18 months',
    fromMonths: 18,
    items: [
      s('Points to show you something interesting'),
      l('Says three or more words besides "mama" or "dada"'),
      l('Follows one-step instructions without gestures'),
      t('Copies you doing chores, like sweeping'),
      m('Walks without holding on'),
      m('Scribbles'),
      m('Tries to use a spoon'),
    ],
  },
  {
    id: '24m',
    label: 'By 2 years',
    fromMonths: 24,
    items: [
      s('Notices when others are hurt or upset'),
      l('Says at least two words together, like "more milk"'),
      l('Points to at least two body parts when asked'),
      t('Points to things in a book when you ask'),
      m('Kicks a ball'),
      m('Runs'),
      m('Eats with a spoon'),
    ],
  },
  {
    id: '30m',
    label: 'By 2½ years',
    fromMonths: 30,
    items: [
      s('Plays next to and sometimes with other children'),
      l('Says about 50 words'),
      l('Names things in a book when you point'),
      t('Uses things to pretend, like feeding a block to a doll'),
      t('Follows two-step instructions'),
      m('Jumps off the ground with both feet'),
      m('Takes some clothes off by themselves'),
    ],
  },
  {
    id: '36m',
    label: 'By 3 years',
    fromMonths: 36,
    items: [
      s('Joins other children to play'),
      l('Has a short back-and-forth conversation with you'),
      l('Asks "who", "what", "where" or "why" questions'),
      l('Says their first name when asked'),
      l('Is understood by others most of the time'),
      t('Draws a circle when you show them how'),
      m('Puts on some clothes by themselves'),
      m('Uses a fork or spoon well'),
    ],
  },
  {
    id: '48m',
    label: 'By 4 years',
    fromMonths: 48,
    items: [
      s('Comforts others who are hurt or sad'),
      s('Pretends to be something else during play'),
      l('Says sentences with four or more words'),
      l('Talks about something that happened during the day'),
      t('Names a few colours'),
      t('Draws a person with three or more body parts'),
      m('Catches a large ball most of the time'),
      m('Holds a crayon between fingers and thumb, not a fist'),
    ],
  },
  {
    id: '60m',
    label: 'By 5 years',
    fromMonths: 60,
    items: [
      s('Takes turns and follows rules in games'),
      s('Does simple chores at home'),
      l('Tells a story with at least two events'),
      t('Counts to 10'),
      t('Writes some letters of their name'),
      t('Pays attention for 5 to 10 minutes during an activity'),
      m('Hops on one foot'),
      m('Buttons some buttons'),
    ],
  },
  {
    id: '6-8y',
    label: 'At 6 to 8 years',
    fromMonths: 72,
    items: [
      s('Makes and keeps friends'),
      s('Can say how they feel in words'),
      l('Reads simple sentences for their class level'),
      t('Follows instructions with several steps'),
      t('Understands simple rules of right and wrong'),
      m('Rides a bicycle, skips or balances well'),
      m('Dresses, washes and eats mostly without help'),
    ],
  },
  {
    id: '9-11y',
    label: 'At 9 to 11 years',
    fromMonths: 108,
    items: [
      s('Has close friends and sorts out small fallings-out'),
      s('Talks about worries with a parent or trusted adult'),
      l('Reads to learn and explains what they read'),
      t('Does most homework with little help'),
      t('Takes on small responsibilities, like packing the school bag'),
      m('Plays sports or games with rules, with good coordination'),
      m('Is active for about an hour most days'),
    ],
  },
  {
    id: '12-15y',
    label: 'At 12 to 15 years',
    fromMonths: 144,
    items: [
      s('Has a steady group of friends'),
      s('Talks to a parent or trusted adult when something is wrong'),
      t('Plans schoolwork and time with growing independence'),
      t("Thinks about other people's points of view"),
      m('Is active for about an hour most days'),
      m('Sleeps 8 to 10 hours on most nights'),
      m('Is going through the body changes of puberty at their own pace'),
    ],
  },
];

/** Age in completed months from a date of birth (calendar months). */
export function ageInMonths(dob: Date, now: Date = new Date()): number {
  let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  if (now.getDate() < dob.getDate()) months -= 1;
  return Math.max(0, months);
}

/** The checklist for the most recent checkpoint the child has reached. */
export function milestoneBandForAge(months: number): MilestoneBand {
  let band = MILESTONE_BANDS[0];
  for (const b of MILESTONE_BANDS) {
    if (months >= b.fromMonths) band = b;
  }
  return band;
}

export function milestoneBandForDob(dob: Date | null | undefined, now: Date = new Date()): MilestoneBand | null {
  if (!dob || Number.isNaN(dob.getTime())) return null;
  return milestoneBandForAge(ageInMonths(dob, now));
}

/** Parent-facing note under every checklist (CDC "act early" advice). */
export function milestoneActEarlyNote(childName: string): string {
  return `Every child grows at their own pace. Talk to a doctor if ${childName} loses a skill they once had, or if anything worries you.`;
}
