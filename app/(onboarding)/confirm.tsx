import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChildAvatar } from '@/components/ChildAvatar';
import { GradientButton } from '@/components/gradient-button';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { AnimatedProgress } from '@/components/ui/AnimatedProgress';
import { getOnboardingStep } from '@/constants/onboardingSteps';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import {
  VACCINE_QUESTIONS_BY_PATH,
  questionsDueBy,
  type VaccineAnswer,
} from '@/constants/vaccineQuestions';
import { useAuth } from '@/context/auth';
import { useChild } from '@/context/child';
import { useOnboarding } from '@/context/onboarding';
import { formatAgeLabel } from '@/lib/age';
import { formatDate, toDateOnlyString } from '@/lib/date';
import { dbg } from '@/lib/debug';
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
 * Go back to an earlier onboarding screen to edit it. dismissTo pops the
 * stack back to that screen (answers live in the onboarding context, so the
 * parent walks forward again with everything filled in). If the screen is
 * not in the stack, it replaces this one instead.
 */
function editScreen(href: Href) {
  router.dismissTo(href);
}

/** Which save steps already succeeded, so a retry never inserts twice. */
interface SaveProgress {
  parent: boolean;
  childId: string | null;
  allergies: boolean;
  conditions: boolean;
  medications: boolean;
  vaccines: boolean;
}

const EMPTY_PROGRESS: SaveProgress = {
  parent: false,
  childId: null,
  allergies: false,
  conditions: false,
  medications: false,
  vaccines: false,
};

export default function ConfirmScreen() {
  const insets = useSafeAreaInsets();
  const {
    childName, childSex, dob, relationship, bracket,
    weight, height, bloodGroup,
    allergies, allergyStatus,
    conditionList, medicationList, conditionsAnswers,
    vaccineAnswers, vaccineDosesGiven,
    parent,
  } = useOnboarding();
  const { user, refreshHasChildren } = useAuth();
  const { refetch, refetchParentName, selectChild } = useChild();
  const [agreed, setAgreed] = useState(false);
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
  const parentName = parent.name.trim();

  // Missing basics (e.g. the app restarted mid-flow): say so instead of
  // silently doing nothing on Save.
  const missing: string[] = [];
  if (!trimmedName) missing.push('name');
  if (!dob) missing.push('date of birth');
  if (!childSex) missing.push('sex');
  const isMissingBasics = missing.length > 0;

  const stepInfo = getOnboardingStep('confirm', bracket);
  const stepText = stepInfo?.total ? `Step ${stepInfo.step} of ${stepInfo.total}` : null;

  // Vaccines summary: answered questions on this path, grouped by answer.
  const vaccineQuestions = bracket && dob ? questionsDueBy(VACCINE_QUESTIONS_BY_PATH[bracket], dob) : [];
  const vaccineGroups: Record<VaccineAnswer, string[]> = { Given: [], Missed: [], 'Not sure': [] };
  for (const q of vaccineQuestions) {
    const answer = vaccineAnswers[q.id];
    if (answer) vaccineGroups[answer].push(q.name);
  }
  const vaccinesAnswered = vaccineGroups.Given.length + vaccineGroups.Missed.length + vaccineGroups['Not sure'].length;

  const allergyText =
    allergyStatus === 'has'
      ? null
      : allergyStatus === 'none'
        ? 'No known allergies'
        : allergyStatus === 'unknown'
          ? 'Not known yet'
          : 'Not answered';

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
          ? 'Yes, no names entered'
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
        const parentRow: { id: string; email: string | null; name?: string } = {
          id: user.id,
          email: user.email ?? null,
        };
        if (parentName) parentRow.name = parentName;
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

      if (!p.medications) {
        if (medicationList.length === 0) p.medications = true;
        else {
          tasks.push((async () => {
            const { error: e } = await supabase.from('medications').insert(
              medicationList.map((m) => ({
                child_id: childId,
                name: m.name,
                dosage: m.dose || null,
                frequency: m.frequency || null,
              })),
            );
            if (e) { dbg.dbError('Confirm: medications insert failed', e); failures.push('medicines'); }
            else p.medications = true;
          })());
        }
      }

      // 4. Vaccines: the trigger on children has created the schedule rows.
      //    Mark only the exact doses the parent said were given (and already
      //    due). The date given is not known, so administered_date stays NULL.
      if (!p.vaccines) {
        if (vaccineDosesGiven.length === 0) p.vaccines = true;
        else {
          tasks.push((async () => {
            dbg.db('Confirm: marking doses done', { rows: vaccineDosesGiven });
            const results = await Promise.all(
              vaccineDosesGiven.map((r) =>
                supabase
                  .from('vaccinations')
                  .update({ status: 'done', administered_date: null })
                  .eq('child_id', childId)
                  .eq('vaccine_name', r.vaccine_name)
                  .eq('dose_number', r.dose_number),
              ),
            );
            const vaxErr = results.find((res) => res.error)?.error;
            if (vaxErr) { dbg.dbError('Confirm: vaccine update failed', vaxErr); failures.push('vaccines'); }
            else p.vaccines = true;
          })());
        }
      }

      await Promise.all(tasks);
      if (failures.length > 0) {
        throw new Error(`${displayName}'s profile is saved, but ${failures.join(', ')} did not save. Tap Save to try again.`);
      }
      dbg.db('Confirm: all related data saved');

      // 5. Refresh app state before leaving, so home shows the new child.
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
                {relationship ? <Text style={typography.meta}>You: {relationship}</Text> : null}
              </View>
              <EditLink section="child details" onPress={() => editScreen('/(onboarding)/child-basics')} />
            </View>
          </View>

          {/* Parent (only when entered in this session) */}
          {parentName ? (
            <SectionCard title="Your details" onEdit={() => editScreen('/(onboarding)/parent-details')}>
              <Row label="Your name" value={parentName} />
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

          {/* Vaccines */}
          {bracket ? (
            <SectionCard title="Vaccines" onEdit={() => editScreen(VACCINE_SCREEN[bracket])}>
              {vaccinesAnswered === 0 ? (
                <Text style={styles.valueText}>Not answered</Text>
              ) : (
                <>
                  {vaccineGroups.Given.length > 0 ? <Row label="Given" value={vaccineGroups.Given.join(', ')} /> : null}
                  {vaccineGroups.Missed.length > 0 ? <Row label="Missed" value={vaccineGroups.Missed.join(', ')} /> : null}
                  {vaccineGroups['Not sure'].length > 0 ? (
                    <Row label="Not sure" value={vaccineGroups['Not sure'].join(', ')} />
                  ) : null}
                </>
              )}
              {vaccineDosesGiven.length > 0 ? (
                <Text style={typography.caption}>
                  {vaccineDosesGiven.length} past dose{vaccineDosesGiven.length !== 1 ? 's' : ''} will be marked as given
                  (date not recorded).
                </Text>
              ) : null}
            </SectionCard>
          ) : null}
        </Animated.View>
      </ScrollView>

      {/* Footer: consent + the one primary, pinned to the bottom */}
      <Animated.View
        entering={FadeInUp.delay(400).duration(500)}
        style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}
      >
        {error ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Pressable
          style={styles.checkboxRow}
          onPress={() => setAgreed((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed, disabled: isMissingBasics }}
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
          <Text style={styles.termsLink}>Terms of Service</Text>
          {' '}and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </Animated.View>
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
    alignItems: 'flex-start',
    gap: 12,
  },
  identityText: {
    flex: 1,
    flexShrink: 1,
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
