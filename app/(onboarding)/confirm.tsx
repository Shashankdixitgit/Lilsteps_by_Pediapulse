import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildAvatar } from '@/components/ChildAvatar';
import { GradientButton } from '@/components/gradient-button';
import { RETURN_TO_CONFIRM } from '@/components/onboarding-shell';
import { doseCountLines, vaccineDoseCounts } from '@/components/onboarding/VaccinationStep';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { AnimatedProgress } from '@/components/ui/AnimatedProgress';
import { getOnboardingStep } from '@/constants/onboardingSteps';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import {
  ANNUAL_VACCINE_NAMES,
  babyVaccinesQuestionFor,
  VACCINE_QUESTIONS_BY_PATH,
  questionsDueBy,
  type VaccineAnswer,
  type VaccineDoseRow,
} from '@/constants/vaccineQuestions';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import {
  ALLERGY_NONE,
  ALLERGY_NOT_KNOWN,
  ALLERGY_OTHER,
  buildOnboardingAnswers,
  parentCity,
  parseBirthWeight,
  useOnboarding,
  type AllergyAnswers,
  type AllergyEntry,
  type AllergyGroup,
} from '@/context/onboarding';
import { formatAgeLabel } from '@/lib/age';
import { formatDate, toDateOnlyString, todayDateOnly } from '@/lib/date';
import { dbg } from '@/lib/debug';
import { WEB_DEMO } from '@/lib/webDemo';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

/** Real ABO/Rh groups only; "Don't know" (or anything else) is saved as NULL. */
const BLOOD_GROUP_RE = /^(A|B|AB|O)[+-]$/;

const VACCINE_SCREEN: Record<'A' | 'B' | 'C', Href> = {
  A: '/(onboarding)/a-vaccination',
  B: '/(onboarding)/b-vaccination',
  C: '/(onboarding)/c-vaccination',
};

/** Parse a measurement typed by the parent; null when empty or not a number. */
function parseMeasure(value: string): number | null {
  const n = parseFloat(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Open an earlier onboarding screen on top of this one to edit it. The
 * returnTo param makes that screen's CTA ("Back to review") come straight
 * back here instead of walking through every later screen again. Answers
 * live in the onboarding context, so nothing is lost either way.
 */
function editScreen(href: Href) {
  router.push(`${String(href)}?returnTo=${RETURN_TO_CONFIRM}` as Href);
}

/**
 * The path screens in order, by the section title buildOnboardingAnswers
 * gives them, so the review shows every path answer with its own Edit (O4).
 */
const PATH_SCREENS: Record<'A' | 'B' | 'C', { title: string; href: Href }[]> = {
  A: [
    { title: 'Birth history', href: '/(onboarding)/a-birth-history' },
    { title: 'Feeding', href: '/(onboarding)/a-feeding' },
    { title: 'Milestones', href: '/(onboarding)/a-milestones' },
    { title: 'Sleep', href: '/(onboarding)/a-sleep' },
  ],
  B: [
    { title: 'Development', href: '/(onboarding)/b-development' },
    { title: 'Diet and activity', href: '/(onboarding)/b-diet-activity' },
    { title: 'Sleep and dental', href: '/(onboarding)/b-sleep-dental' },
  ],
  C: [
    { title: 'School and lifestyle', href: '/(onboarding)/c-academic' },
    { title: 'Diet', href: '/(onboarding)/c-diet' },
    { title: 'Puberty and development', href: '/(onboarding)/c-puberty' },
    { title: 'Mental wellbeing', href: '/(onboarding)/c-mental-health' },
    { title: 'Sleep', href: '/(onboarding)/c-sleep' },
  ],
};

const ALLERGY_GROUP_LABEL: Record<AllergyGroup, string> = {
  medication: 'Medication allergies',
  food: 'Food allergies',
  environmental: 'Other allergies',
};
const ALLERGY_GROUP_ORDER: AllergyGroup[] = ['medication', 'food', 'environmental'];

/** One allergy group as shown on confirm: its named allergies, or what the
 *  parent said instead ("Not known yet" must never read as "None"). */
function allergyGroupText(group: AllergyGroup, answers: AllergyAnswers, named: AllergyEntry[]): string {
  const names = named.filter((a) => a.type === group).map((a) => a.name);
  if (names.length > 0) return names.join(', ');
  const { selected } = answers[group];
  if (selected.includes(ALLERGY_NOT_KNOWN)) return 'Not known yet';
  if (selected.includes(ALLERGY_NONE)) return 'None';
  if (selected.includes(ALLERGY_OTHER)) return 'Other, not named';
  return 'Not answered';
}

/** Which save steps already succeeded, so a retry never inserts twice. */
interface SaveProgress {
  parent: boolean;
  childId: string | null;
  allergies: boolean;
  conditions: boolean;
  medications: boolean;
  vaccines: boolean;
  growth: boolean;
  birthGrowth: boolean;
}

const EMPTY_PROGRESS: SaveProgress = {
  parent: false,
  childId: null,
  allergies: false,
  conditions: false,
  medications: false,
  vaccines: false,
  growth: false,
  birthGrowth: false,
};

/** Saved when the parent says the child takes regular medicines but names none. */
const UNNAMED_MEDICINE = 'Regular medicine (name not given)';

export default function ConfirmScreen() {
  const insets = useSafeAreaInsets();
  // Short window (200% zoom, landscape) or large text: the consent footer
  // would cover most of the screen, so it scrolls with the content (R3-16).
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const footerScrolls = fontScale >= 1.3 || windowHeight < 600;
  const {
    childName, childSex, dob, relationship, bracket,
    weight, height, bloodGroup,
    allergies, allergyStatus, allergyAnswers,
    conditionList, medicationList, conditionsAnswers,
    vaccineAnswers, vaccineDosesGiven, vaccinePlan, babyVaccines,
    parent, clearDraft, sections: answerSections,
  } = useOnboarding();
  const { user, refreshHasChildren } = useAuth();
  const { children: existingChildren, refetch, refetchParentName, selectChild } = useChild();
  const [agreed, setAgreed] = useState(WEB_DEMO);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const progress = useRef<SaveProgress>({ ...EMPTY_PROGRESS });

  const trimmedName = childName.trim();
  const displayName = trimmedName || 'Your child';
  const age = dob ? formatAgeLabel(dob, { old: true }) : null;
  const sexLabel = childSex === 'male' ? 'Male' : childSex === 'female' ? 'Female' : null;
  const bornLabel = dob ? `Born ${formatDate(dob, { year: 'always' })}` : null;
  const savedBloodGroup = BLOOD_GROUP_RE.test(bloodGroup.trim()) ? bloodGroup.trim() : null;
  const parsedWeight = parseMeasure(weight);
  const parsedHeight = parseMeasure(height);
  // Path A birth weight: the first growth reading, dated the DOB (G1).
  const birthWeight = bracket === 'A' ? parseBirthWeight(answerSections.aBirthHistory.birthWeight) : null;
  const parentName = parent.name.trim();
  const savedCity = parentCity(parent);

  // Missing basics (e.g. the app restarted mid-flow): say so instead of
  // silently doing nothing on Save.
  const missing: string[] = [];
  if (!trimmedName) missing.push('name');
  if (!dob) missing.push('date of birth');
  if (!childSex) missing.push('sex');
  const isMissingBasics = missing.length > 0;

  // A second child skips "About you", so it is not counted.
  const stepInfo = getOnboardingStep('confirm', bracket, { skipParentDetails: existingChildren.length > 0 });
  const stepText = stepInfo?.total ? `Step ${stepInfo.step} of ${stepInfo.total}` : null;

  // Vaccines summary: answered questions on this path, grouped by answer.
  const vaccineQuestions = bracket && dob ? questionsDueBy(VACCINE_QUESTIONS_BY_PATH[bracket], dob) : [];
  const vaccineGroups: Record<VaccineAnswer, string[]> = { Given: [], Missed: [], 'Not sure': [] };
  for (const q of vaccineQuestions) {
    const answer = vaccineAnswers[q.id];
    if (answer) vaccineGroups[answer].push(q.name);
  }
  const vaccinesAnswered = vaccineGroups.Given.length + vaccineGroups.Missed.length + vaccineGroups['Not sure'].length;
  // The one "baby vaccines" question (C3), when it was shown for this DOB.
  const babyQuestion = babyVaccinesQuestionFor(bracket, dob);
  const vaccineDoseLines = doseCountLines(vaccineDoseCounts(bracket, dob, vaccinePlan));

  // C1: every path-specific answer, in plain labels, for the doctor. The same
  // record is shown below (O4) and saved, so the review matches what is saved.
  const answersRecord =
    bracket && childSex
      ? buildOnboardingAnswers({
          path: bracket,
          childSex,
          sections: answerSections,
          vaccineAnswers,
          babyVaccines,
          shownVaccineIds: vaccineQuestions.map((q) => q.id),
          dob,
          allergyAnswers,
        })
      : null;
  const pathSections = bracket
    ? PATH_SCREENS[bracket].map(({ title, href }) => ({
        title,
        href,
        items: answersRecord?.sections.find((s) => s.title === title)?.items ?? [],
      }))
    : [];

  const allergyText =
    allergyStatus === 'has'
      ? null
      : allergyStatus === 'none'
        ? 'No known allergies'
        : allergyStatus === 'unknown'
          ? 'Not known yet'
          : 'Not answered';

  // No allergy named, and not every group was answered "None": a "Not known"
  // group, a skipped group or an unnamed "Other" all reach the doctor as
  // "allergies not known", never as "no allergies" (R2-01).
  const allergiesNotKnown =
    allergies.length === 0 && allergyStatus !== 'none';

  const conditionsNone = conditionsAnswers.selected.includes('None');
  const conditionsText =
    conditionList.length > 0
      ? conditionList.join(', ')
      : conditionsNone
        ? 'None'
        : 'Not answered';
  const medsText =
    medicationList.length > 0
      ? null
      : conditionsAnswers.takingMeds === 'No'
        ? 'None'
        : conditionsAnswers.takingMeds === 'Yes'
          ? `Yes. Saved as "${UNNAMED_MEDICINE}" so your doctor can ask`
          : 'Not answered';

  async function handleConfirm() {
    if (saving) return;
    if (!user) {
      setError('You are signed out. Please log in again to save this profile.');
      return;
    }
    if (isMissingBasics || !dob || !childSex) {
      dbg.db('Confirm: missing basics', { missing });
      setError(`Some details are missing: ${missing.join(', ')}. Please go back and fill them in.`);
      return;
    }
    if (!agreed) {
      setError('Please tick the box to confirm the details are accurate.');
      return;
    }
    setSaving(true);
    setError(null);
    const p = progress.current;

    try {
      // 1. Parent row (and their name, when we have it in this session).
      if (!p.parent) {
        const parentRow: {
          id: string;
          email: string | null;
          name?: string;
          city?: string;
          preferred_language?: string;
          relationship?: string;
        } = {
          id: user.id,
          email: user.email ?? null,
        };
        // Only what was answered in this session: a second child skips
        // "About you", and blanks must not wipe the saved values (R2-13).
        if (parentName) parentRow.name = parentName;
        if (savedCity) parentRow.city = savedCity;
        if (parent.language) parentRow.preferred_language = parent.language;
        if (relationship) parentRow.relationship = relationship;
        dbg.db('Confirm: upserting parent row', { userId: user.id, hasName: !!parentName });
        const { error: parentErr } = await supabase.from('parents').upsert(parentRow, { onConflict: 'id' });
        if (parentErr) {
          dbg.dbError('Confirm: parent upsert failed', parentErr);
          throw new Error('Could not save your details. Please check your connection and try again.');
        }
        p.parent = true;
      }

      // 2. Child (only once, even if a later step fails and the parent retries).
      if (!p.childId) {
        const now = new Date().toISOString();
        const childPayload = {
          parent_id: user.id,
          name: trimmedName,
          dob: toDateOnlyString(dob),
          sex: childSex,
          blood_group: savedBloodGroup,
          weight: parsedWeight,
          height: parsedHeight,
          weight_updated_at: parsedWeight != null ? now : null,
          height_updated_at: parsedHeight != null ? now : null,
          // "Not known yet" must not later read as "None" (R3-05, 0028).
          allergies_not_known: allergiesNotKnown,
          // C1: every path-specific answer, in plain labels, for the doctor
          // (including a "Not known" allergy group next to named allergies, O3).
          onboarding_answers: answersRecord,
        };
        dbg.db('Confirm: inserting child', childPayload);
        const { data: child, error: childErr } = await supabase
          .from('children')
          .insert(childPayload)
          .select('id')
          .single();
        if (childErr || !child) {
          dbg.dbError('Confirm: child insert failed', childErr);
          throw new Error(`Could not save ${displayName}'s profile. Please try again.`);
        }
        p.childId = child.id as string;
        dbg.db('Confirm: child created', { childId: p.childId });
      }
      const childId = p.childId;

      // 3. Allergies, conditions, medicines in parallel; each one is retried
      //    on its own if it fails.
      const failures: string[] = [];
      const tasks: Promise<void>[] = [];

      if (!p.allergies) {
        if (allergies.length === 0) p.allergies = true;
        else {
          tasks.push((async () => {
            const { error: e } = await supabase.from('allergies').insert(
              allergies.map((a) => ({ child_id: childId, type: a.type, name: a.name, severity: 'unknown' })),
            );
            if (e) { dbg.dbError('Confirm: allergies insert failed', e); failures.push('allergies'); }
            else p.allergies = true;
          })());
        }
      }

      if (!p.conditions) {
        if (conditionList.length === 0) p.conditions = true;
        else {
          tasks.push((async () => {
            const { error: e } = await supabase.from('conditions').insert(
              conditionList.map((name) => ({ child_id: childId, name })),
            );
            if (e) { dbg.dbError('Confirm: conditions insert failed', e); failures.push('conditions'); }
            else p.conditions = true;
          })());
        }
      }

      // "Yes, takes regular medicines" with no names still reaches Profile and
      // the doctor: one placeholder row the parent can edit later (R3-18).
      const medicationRows =
        medicationList.length > 0
          ? medicationList.map((m) => ({
              child_id: childId,
              name: m.name,
              dosage: m.dose || null,
              frequency: m.frequency || null,
            }))
          : conditionsAnswers.takingMeds === 'Yes'
            ? [{ child_id: childId, name: UNNAMED_MEDICINE, dosage: null, frequency: null }]
            : [];
      if (!p.medications) {
        if (medicationRows.length === 0) p.medications = true;
        else {
          tasks.push((async () => {
            const { error: e } = await supabase.from('medications').insert(medicationRows);
            if (e) { dbg.dbError('Confirm: medications insert failed', e); failures.push('medicines'); }
            else p.medications = true;
          })());
        }
      }

      // 4. Vaccines: the trigger on children has created the schedule rows.
      //    Mark only the exact doses the parent said were given (and already
      //    due), incl. the baby doses on a "Yes" (C3). The date given is not
      //    known, so administered_date stays NULL. Doses the parent is not
      //    sure about (or said the baby vaccines were not completed) are saved
      //    as 'unknown' (0024): listed to check with the doctor, not overdue.
      if (!p.vaccines) {
        const notSure = vaccinePlan.unknown;
        tasks.push((async () => {
          dbg.db('Confirm: marking doses', { done: vaccineDosesGiven, notSure });
          const mark = (r: VaccineDoseRow, patch: Record<string, unknown>) =>
            supabase
              .from('vaccinations')
              .update(patch)
              .eq('child_id', childId)
              .eq('vaccine_name', r.vaccine_name)
              .eq('dose_number', r.dose_number);
          const results = await Promise.all([
            ...vaccineDosesGiven.map((r) => mark(r, { status: 'done', administered_date: null })),
            ...notSure.map((r) => mark(r, { status: 'unknown' })),
            // The yearly flu shot is never "overdue" (its one schedule row
            // is at 6 months): an older child's row becomes a yearly dose
            // to ask about, for the doctor's dashboard too (R2-10/R2-20).
            supabase
              .from('vaccinations')
              .update({ status: 'upcoming' })
              .eq('child_id', childId)
              .in('vaccine_name', Array.from(ANNUAL_VACCINE_NAMES))
              .eq('status', 'overdue'),
          ]);
          const vaxErr = results.find((res) => res.error)?.error;
          if (vaxErr) { dbg.dbError('Confirm: vaccine update failed', vaxErr); failures.push('vaccines'); }
          else p.vaccines = true;
        })());
      }

      // 5. The onboarding weight / height is the first growth reading, so it
      //    shows in growth history and charts (children.weight alone does not).
      if (!p.growth) {
        if (parsedWeight == null && parsedHeight == null) p.growth = true;
        else {
          tasks.push((async () => {
            const { error: e } = await supabase.from('growth_measurements').insert({
              child_id: childId,
              weight: parsedWeight,
              height: parsedHeight,
              measured_at: todayDateOnly(),
            });
            if (e) { dbg.dbError('Confirm: growth insert failed', e); failures.push('weight and height'); }
            else p.growth = true;
          })());
        }
      }

      // 6. Birth weight as a growth row on the DOB (skipped when the child was
      //    born today and a weight was already saved for today).
      if (!p.birthGrowth) {
        const dobStr = toDateOnlyString(dob);
        if (birthWeight == null || (dobStr === todayDateOnly() && parsedWeight != null)) p.birthGrowth = true;
        else {
          tasks.push((async () => {
            const { error: e } = await supabase.from('growth_measurements').insert({
              child_id: childId,
              weight: birthWeight,
              height: null,
              note: 'Birth weight',
              measured_at: dobStr,
            });
            if (e) { dbg.dbError('Confirm: birth weight insert failed', e); failures.push('birth weight'); }
            else p.birthGrowth = true;
          })());
        }
      }

      await Promise.all(tasks);
      if (failures.length > 0) {
        throw new Error(`${displayName}'s profile is saved, but ${failures.join(', ')} did not save. Tap Save to try again.`);
      }
      dbg.db('Confirm: all related data saved');
      // Everything is in the DB now: the draft on the device is not needed.
      await clearDraft();

      // 7. Refresh app state before leaving, so home shows the new child.
      await Promise.all([
        refreshHasChildren(),
        refetch(),
        parentName ? refetchParentName() : Promise.resolve(),
      ]);
      selectChild(childId);
      dbg.db('Confirm: app state refreshed');

      router.replace('/(onboarding)/complete');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  // Footer: consent + the one primary, pinned to the bottom (or inline).
  const footer = (
    <Animated.View
      entering={FadeInUp.delay(400).duration(500)}
      style={[styles.footer, footerScrolls && styles.footerInline, { paddingBottom: insets.bottom + 12 }]}
    >
      {error ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Pressable
        style={styles.checkboxRow}
        onPress={() => setAgreed((v) => !v)}
        {...(Platform.OS === 'web'
          ? {
              // Web: a checkbox toggles on Space (react-native-web only does
              // that for role=button), as in ChipGroup.
              onKeyDown: (e: { key: string; preventDefault: () => void }) => {
                if ((e.key === ' ' || e.key === 'Spacebar') && !isMissingBasics) {
                  e.preventDefault();
                  setAgreed((v) => !v);
                }
              },
            }
          : null)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed, disabled: isMissingBasics }}
        aria-checked={agreed}
        disabled={isMissingBasics}
        hitSlop={8}
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed ? <Ionicons name="checkmark" size={15} color={AppColors.onPrimary} /> : null}
        </View>
        <Text style={styles.checkboxLabel}>
          All details are accurate to the best of my knowledge
        </Text>
      </Pressable>

      <GradientButton
        label={saving ? 'Saving profile…' : 'Save profile'}
        onPress={handleConfirm}
        disabled={!agreed || isMissingBasics}
        loading={saving}
        accessibilityLabel={`Save ${displayName}'s profile`}
      />
      {!agreed && !isMissingBasics ? (
        <Text style={styles.hintText}>Tick the box above to save</Text>
      ) : null}

      <Text style={styles.termsText}>
        By continuing you agree to our{' '}
        <Text style={styles.termsLink} accessibilityRole="link" onPress={() => router.push('/profile/terms')}>
          Terms of Service
        </Text>
        {' '}and{' '}
        <Text style={styles.termsLink} accessibilityRole="link" onPress={() => router.push('/profile/privacy')}>
          Privacy Policy
        </Text>
      </Text>
    </Animated.View>
  );

  return (
    <View style={styles.screen}>
      {/* Header: back + final step of the progress bar */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <HeaderIconButton icon="arrow-back" onPress={() => router.back()} accessibilityLabel="Go back" />
        <View
          style={styles.progressWrap}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Profile setup, ${stepText ?? 'last step'}`}
          accessibilityValue={
            stepInfo?.total
              ? { min: 1, max: stepInfo.total, now: stepInfo.step, text: stepText ?? undefined }
              : { text: 'Last step' }
          }
        >
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <AnimatedProgress value={1} animateFrom={0.9} fillColor={AppColors.primary} thumb />
          </View>
          {stepText ? <Text style={[typography.caption, styles.stepText]}>{stepText}</Text> : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(500)} style={styles.titleBlock}>
          <Text style={typography.heading}>Review and save</Text>
          <Text style={typography.bodySM}>
            Check everything below. Tap Edit to change a section.
          </Text>
        </Animated.View>

        {isMissingBasics ? (
          <Animated.View entering={FadeInUp.delay(100).duration(500)} style={[styles.card, styles.warnCard]}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="alert-circle" size={14} color={AppColors.danger} />
              <Text style={styles.allergyTitle}>Some details are missing</Text>
            </View>
            <Text style={typography.bodySM}>
              We don&apos;t have the child&apos;s {missing.join(', ')}. This can happen if the app was
              closed part-way through. Please add them before saving.
            </Text>
            <GradientButton
              label="Add the missing details"
              variant="outline"
              onPress={() => editScreen('/(onboarding)/child-basics')}
              showArrow={false}
            />
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInUp.delay(150).duration(600)} style={styles.cards}>
          {/* Child */}
          <View style={styles.card}>
            <View style={styles.identity}>
              <ChildAvatar name={displayName} size={56} colorIndex={0} />
              <View style={styles.identityText}>
                <Text style={typography.headingSM}>{displayName}</Text>
                {!!(age || sexLabel) && (
                  <Text style={typography.meta}>{[age, sexLabel].filter(Boolean).join(' · ')}</Text>
                )}
                {bornLabel ? <Text style={typography.meta}>{bornLabel}</Text> : null}
                {relationship ? <Text style={typography.meta}>Your relationship: {relationship}</Text> : null}
              </View>
              <EditLink section="child details" onPress={() => editScreen('/(onboarding)/child-basics')} />
            </View>
          </View>

          {/* Parent (only when entered in this session) */}
          {parentName ? (
            <SectionCard title="Your details" onEdit={() => editScreen('/(onboarding)/parent-details')}>
              <Row label="Your name" value={parentName} />
              <Row label="City" value={savedCity || 'Not answered'} />
              <Row label="Preferred language" value={parent.language || 'Not answered'} />
            </SectionCard>
          ) : null}

          {/* Measurements */}
          <SectionCard title="Measurements" onEdit={() => editScreen('/(onboarding)/physical')}>
            <View style={styles.statsRow}>
              <Stat label="Weight" value={parsedWeight != null ? `${parsedWeight} kg` : '—'} />
              <View style={styles.statDivider} />
              <Stat label="Height" value={parsedHeight != null ? `${parsedHeight} cm` : '—'} padded />
              <View style={styles.statDivider} />
              <Stat label="Blood group" value={savedBloodGroup ?? (bloodGroup ? 'Not known' : '—')} padded />
            </View>
          </SectionCard>

          {/* Allergies: safety info keeps colour + icon + label */}
          <SectionCard title="Allergies" onEdit={() => editScreen('/(onboarding)/allergies')}>
            {allergyStatus === 'has' ? (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="alert-circle" size={14} color={AppColors.danger} />
                  <Text style={styles.allergyTitle}>Allergy alert</Text>
                </View>
                <Text style={styles.allergyText}>{allergies.map((a) => a.name).join(', ')}</Text>
              </View>
            ) : null}
            {allergyStatus === 'has' || allergyStatus === 'unknown' ? (
              // Per group, so a "Not known" or unanswered group still shows
              // next to the groups that do have allergies.
              ALLERGY_GROUP_ORDER
                .filter((g) => allergyStatus !== 'has' || !allergies.some((a) => a.type === g))
                .map((g) => (
                  <Row key={g} label={ALLERGY_GROUP_LABEL[g]} value={allergyGroupText(g, allergyAnswers, allergies)} />
                ))
            ) : (
              <Text style={styles.valueText}>{allergyText}</Text>
            )}
          </SectionCard>

          {/* Conditions + medicines */}
          <SectionCard title="Health conditions and medicines" onEdit={() => editScreen('/(onboarding)/conditions')}>
            <Row label="Conditions" value={conditionsText} />
            <View style={styles.section}>
              <Text style={typography.caption}>Regular medicines</Text>
              {medsText ? (
                <Text style={styles.valueText}>{medsText}</Text>
              ) : (
                medicationList.map((m, i) => (
                  <Text key={`${m.name}-${i}`} style={styles.valueText}>
                    {m.name}
                    {m.dose || m.frequency ? (
                      <Text style={styles.valueMeta}>{`  ${[m.dose, m.frequency].filter(Boolean).join(' · ')}`}</Text>
                    ) : null}
                  </Text>
                ))
              )}
            </View>
          </SectionCard>

          {/* Path answers (O4): what the doctor will see from these screens */}
          {pathSections.map((sec) => (
            <SectionCard key={sec.title} title={sec.title} onEdit={() => editScreen(sec.href)}>
              {sec.items.length > 0 ? (
                sec.items.map((item) => <Row key={item.label} label={item.label} value={item.value} />)
              ) : (
                <Text style={styles.valueText}>Not answered</Text>
              )}
            </SectionCard>
          ))}

          {/* Vaccines */}
          {bracket ? (
            <SectionCard title="Vaccines" onEdit={() => editScreen(VACCINE_SCREEN[bracket])}>
              {babyQuestion ? (
                <Row label={babyQuestion.title} value={babyVaccines || 'Not answered'} />
              ) : null}
              {vaccinesAnswered === 0 ? (
                babyQuestion ? null : <Text style={styles.valueText}>Not answered</Text>
              ) : (
                <>
                  {vaccineGroups.Given.length > 0 ? <Row label="Given" value={vaccineGroups.Given.join(', ')} /> : null}
                  {vaccineGroups.Missed.length > 0 ? <Row label="Missed" value={vaccineGroups.Missed.join(', ')} /> : null}
                  {vaccineGroups['Not sure'].length > 0 ? (
                    <Row label="Not sure" value={vaccineGroups['Not sure'].join(', ')} />
                  ) : null}
                </>
              )}
              {/* Same counts and wording as the vaccine step; later doses
                  (Tdap, HPV) are counted on their own, never as "earlier". */}
              {vaccineDoseLines.map((line) => (
                <Text key={line} style={typography.caption}>
                  {line}
                </Text>
              ))}
            </SectionCard>
          ) : null}
        </Animated.View>
        {footerScrolls ? footer : null}
      </ScrollView>

      {footerScrolls ? null : footer}
    </View>
  );
}

function EditLink({ section, onPress }: { section: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${section}`}
      style={({ pressed }) => [styles.editLink, pressed && styles.editLinkPressed]}
    >
      <Text style={styles.editLinkText}>Edit</Text>
    </Pressable>
  );
}

function SectionCard({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={[typography.sectionLabel, styles.cardTitle]} accessibilityRole="header">{title}</Text>
        <EditLink section={title.toLowerCase()} onPress={onEdit} />
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.section}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={styles.valueText}>{value}</Text>
    </View>
  );
}

function Stat({ label, value, padded }: { label: string; value: string; padded?: boolean }) {
  return (
    <View style={[styles.statBox, padded && styles.statBoxPadded]}>
      <Text style={typography.caption}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 20,
    paddingBottom: 8,
  },
  progressWrap: {
    flex: 1,
    gap: 4,
  },
  stepText: {
    textAlign: 'right',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 16,
  },
  titleBlock: {
    gap: 4,
  },
  cards: {
    gap: 12,
  },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    padding: 16,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  warnCard: {
    gap: 12,
    borderColor: AppColors.danger,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -12,
    marginBottom: -4,
  },
  cardTitle: {
    flex: 1,
  },
  cardBody: {
    gap: 10,
  },
  identity: {
    flexDirection: 'row',
    // Narrow window / large text: the name drops under the avatar instead
    // of being squeezed to one letter per line.
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 12,
  },
  identityText: {
    flex: 1,
    flexShrink: 1,
    minWidth: 140,
    gap: 2,
  },
  editLink: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 8,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLinkPressed: {
    opacity: 0.6,
  },
  editLinkText: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.secondary,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statBox: {
    flex: 1,
    gap: 2,
  },
  statBoxPadded: {
    paddingLeft: 12,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.border,
    marginLeft: 12,
  },
  statValue: {
    fontFamily: FontFamily.semibold,
    fontSize: 17,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
    color: AppColors.forestDeep,
  },
  section: {
    gap: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  allergyTitle: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.danger,
  },
  allergyText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
  },
  valueText: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
  },
  valueMeta: {
    color: AppColors.muted,
  },
  errorText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
    backgroundColor: AppColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  footerInline: {
    marginHorizontal: -20,
    marginBottom: -16,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: AppColors.fieldBorder,
    backgroundColor: AppColors.card,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: AppColors.primary,
    borderColor: AppColors.primary,
  },
  checkboxLabel: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: AppColors.onSurface,
    flex: 1,
  },
  hintText: {
    ...typography.bodySM,
    textAlign: 'center',
    marginTop: -4,
  },
  termsText: {
    fontFamily: FontFamily.regular,
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.muted,
    textAlign: 'center',
  },
  termsLink: {
    color: AppColors.secondary,
    fontFamily: FontFamily.semibold,
  },
});
