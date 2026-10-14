import { useCallback, useEffect, useState } from 'react';

import type { MentalHealthLevel } from '@/components/checkin/MentalHealthSupport';
import { mentalHealthLevel } from '@/components/onboarding/mentalHealthRisk';
import type { OnboardingAnswerItem, OnboardingAnswersRecord } from '@/context/onboarding';
import { supabase } from '@/lib/supabase';

/**
 * The answers given at set-up (children.onboarding_answers, C1), for the
 * parent's own view: Profile > Edit child lists them (R2-16) and Home shows
 * the Tele-MANAS card after a mood concern. Parents may update their own
 * child row (RLS children_update_own), so Edit / Remove write straight back.
 */

/** Sections that hold sensitive answers: each item can be removed. */
export const SENSITIVE_SECTIONS: ReadonlySet<string> = new Set([
  'Mental wellbeing',
  'Puberty and development',
  'Diet',
]);

/**
 * Where each answer (by its label) lives in `raw`, so Edit / Remove change
 * both copies and nothing removed is left behind for the doctor.
 * `freeText` answers were typed by the parent and can be edited.
 */
const RAW_FIELD: Record<string, { section: string; key: string; freeText?: boolean }> = {
  'Any recent changes in mood, social withdrawal, or behaviour?': { section: 'cMentalHealth', key: 'moodChanges' },
  'What the parent noticed': { section: 'cMentalHealth', key: 'moodDetails', freeText: true },
  'Any history of anxiety or depression?': { section: 'cMentalHealth', key: 'anxietyHistory' },
  'Has menstruation started?': { section: 'cPuberty', key: 'menstruation' },
  'Are periods regular?': { section: 'cPuberty', key: 'regular' },
  'Any pain or irregularity?': { section: 'cPuberty', key: 'pain' },
  'Pain or irregularity described': { section: 'cPuberty', key: 'painDetails', freeText: true },
  'Any concerns about growth or physical development?': { section: 'cPuberty', key: 'growthConcerns' },
  'Acne or significant skin concerns?': { section: 'cPuberty', key: 'acne' },
  'Any dieting, food restriction, or body image concerns noticed?': { section: 'cDiet', key: 'bodyImage' },
};

/** True for an answer the parent typed (mood, puberty description): Edit is offered. */
export function isFreeTextAnswer(item: OnboardingAnswerItem): boolean {
  return !!RAW_FIELD[item.label]?.freeText;
}

function isRecord(v: unknown): v is OnboardingAnswersRecord {
  return !!v && typeof v === 'object' && Array.isArray((v as OnboardingAnswersRecord).sections);
}

/** A copy of the record with one answer changed (value) or removed (null). */
export function withAnswer(
  record: OnboardingAnswersRecord,
  sectionTitle: string,
  label: string,
  value: string | null,
): OnboardingAnswersRecord {
  const sections = record.sections
    .map((s) =>
      s.title !== sectionTitle
        ? s
        : {
            ...s,
            items:
              value === null
                ? s.items.filter((i) => i.label !== label)
                : s.items.map((i) => (i.label === label ? { ...i, value } : i)),
          },
    )
    .filter((s) => s.items.length > 0);
  const raw = { ...(record.raw ?? {}) };
  const field = RAW_FIELD[label];
  if (field && raw[field.section] && typeof raw[field.section] === 'object') {
    raw[field.section] = { ...(raw[field.section] as Record<string, unknown>), [field.key]: value ?? '' };
    // Removing "mood changes" also drops what was noticed (it only made sense with "Yes").
    if (value === null && field.key === 'moodChanges') {
      raw[field.section] = { ...(raw[field.section] as Record<string, unknown>), moodDetails: '' };
    }
  }
  const out = { ...record, sections, raw };
  if (value === null && field?.key === 'moodChanges') {
    return withAnswer(out, sectionTitle, 'What the parent noticed', null);
  }
  return out;
}

/**
 * C2 from set-up answers: a "Yes" to mood changes or to anxiety / depression
 * history is a concern; risk words in what was noticed make it a crisis
 * (112 first). null = nothing to show.
 */
export function mentalHealthFromAnswers(record: OnboardingAnswersRecord | null): MentalHealthLevel | null {
  const m = record?.raw?.cMentalHealth as
    | { moodChanges?: string; moodDetails?: string; anxietyHistory?: string }
    | undefined;
  if (!m) return null;
  const details = typeof m.moodDetails === 'string' ? m.moodDetails : '';
  if (m.moodChanges !== 'Yes' && m.anxietyHistory !== 'Yes') return null;
  return mentalHealthLevel(m.moodChanges === 'Yes' ? details : '');
}

export function useOnboardingAnswers(childId: string | null) {
  // Keyed by child, so a switch never shows the previous child's answers.
  const [loaded, setLoaded] = useState<{ childId: string; record: OnboardingAnswersRecord | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bumped by refetch (e.g. Home regaining focus) to load again.
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let alive = true;
    if (!childId) return;
    supabase
      .from('children')
      .select('onboarding_answers')
      .eq('id', childId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) {
          setError('Could not load your set-up answers. Please try again later.');
          return;
        }
        setError(null);
        const value = data?.onboarding_answers;
        setLoaded({ childId, record: isRecord(value) ? value : null });
      });
    return () => {
      alive = false;
    };
  }, [childId, reloadKey]);

  /** Change (value) or remove (null) one answer. Throws on failure. */
  async function saveAnswer(sectionTitle: string, label: string, value: string | null) {
    const current = loaded && loaded.childId === childId ? loaded.record : null;
    if (!childId || !current) throw new Error('These answers are no longer available. Please refresh.');
    const next = withAnswer(current, sectionTitle, label, value);
    const { error: err } = await supabase.from('children').update({ onboarding_answers: next }).eq('id', childId);
    if (err) throw new Error('Could not save. Please check your connection and try again.');
    setLoaded({ childId, record: next });
  }

  const record = loaded && loaded.childId === childId ? loaded.record : null;
  return { record, loading: !!childId && (!loaded || loaded.childId !== childId), error, refetch, saveAnswer };
}
