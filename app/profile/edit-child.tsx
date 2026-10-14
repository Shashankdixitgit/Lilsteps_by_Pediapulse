import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChipGroup } from '@/components/chip-group';
import { EmptyState } from '@/components/EmptyState';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { WebDobInput } from '@/components/onboarding/WebDobInput';
import { SetupAnswersCard } from '@/components/home/SetupAnswersCard';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import type { AllergySeverity, AllergyType, ChildWithDetails } from '@/hooks/useChildren';
import { formatAgeLabel, isDobInFuture, isDobInRange, minAllowedDob } from '@/lib/age';
import { formatDate, parseDateOnly, toDateOnlyString, todayDateOnly } from '@/lib/date';
import { dbg } from '@/lib/debug';
import { supabase } from '@/lib/supabase';
import { layout, typography } from '@/styles/global';

/** Same choices as onboarding (child-basics, physical, allergies, conditions). */
const SEX_OPTIONS = ['Male', 'Female'];
const BLOOD_GROUP_UNKNOWN = "Don't know";
const BLOOD_GROUPS = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-', 'B-', 'AB-', BLOOD_GROUP_UNKNOWN];
const BLOOD_GROUP_RE = /^(A|B|AB|O)[+-]$/;
const FREQUENCY_OPTIONS = ['Once daily', 'Twice daily', '3× daily', '4× daily', 'As needed'];
const ALLERGY_TYPES: { type: AllergyType; label: string }[] = [
  { type: 'food', label: 'Food' },
  { type: 'medication', label: 'Medicine' },
  { type: 'environmental', label: 'Other' },
];
const ALLERGY_TYPE_LABEL: Record<AllergyType, string> = { food: 'Food', medication: 'Medicine', environmental: 'Other' };

/** Rows being edited: `id` is set for rows already in the DB. */
interface AllergyDraft { id?: string; name: string; type: AllergyType; severity: AllergySeverity }
interface ConditionDraft { id?: string; name: string }
interface MedicationDraft { id?: string; name: string; dosage: string; frequency: string }

function sexLabel(sex: string | null): string {
  return sex === 'male' ? 'Male' : sex === 'female' ? 'Female' : '';
}

export default function EditChildScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const insets = useSafeAreaInsets();
  const { child: selected, children } = useChild();
  const child = (id ? children.find((c) => c.id === id) : selected) ?? null;

  if (!child) {
    return (
      <View style={[layout.screenContainer, { paddingTop: insets.top }]}>
        <ScreenHeader title="Edit child" />
        <EmptyState
          title="Child not found"
          body="Go back to Profile and try again."
          compact
        />
      </View>
    );
  }
  // Keyed by id so switching child starts from that child's saved details.
  return <EditChildForm key={child.id} child={child} />;
}

const ALLERGIES_NONE = 'None known';
const ALLERGIES_NOT_KNOWN = 'Not known yet';

function EditChildForm({ child }: { child: ChildWithDetails }) {
  const insets = useSafeAreaInsets();
  const { refetch } = useChild();

  const [name, setName] = useState(child.name);
  const [dob, setDob] = useState<Date>(() => parseDateOnly(child.dob));
  const [sex, setSex] = useState<string>(sexLabel(child.sex));
  const [bloodGroup, setBloodGroup] = useState(child.blood_group ?? '');
  const [allergies, setAllergies] = useState<AllergyDraft[]>(() =>
    child.allergies.map((a) => ({ id: a.id, name: a.name, type: a.type, severity: a.severity })),
  );
  // "Not known yet" vs "None known" while no allergy is listed
  // (children.allergies_not_known, 0028). Only written when the loaded row
  // has the column, so the save never names a column that isn't there.
  const hasNotKnownColumn = 'allergies_not_known' in child;
  const [allergiesNotKnown, setAllergiesNotKnown] = useState(
    (child as { allergies_not_known?: boolean }).allergies_not_known === true,
  );
  const [conditions, setConditions] = useState<ConditionDraft[]>(() =>
    child.conditions.map((c) => ({ id: c.id, name: c.name })),
  );
  const [meds, setMeds] = useState<MedicationDraft[]>(() =>
    child.medications.map((m) => ({ id: m.id, name: m.name, dosage: m.dosage ?? '', frequency: m.frequency ?? '' })),
  );
  const [newAllergy, setNewAllergy] = useState('');
  const [newAllergyType, setNewAllergyType] = useState<AllergyType>('food');
  const [newCondition, setNewCondition] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dobChanged = toDateOnlyString(dob) !== child.dob;
  const dobOutOfRange = !isDobInRange(dob);
  const missing: string[] = [];
  if (!name.trim()) missing.push('a first name');
  if (dobOutOfRange) missing.push('a valid date of birth');
  if (!sex && child.sex !== 'other') missing.push('biological sex');
  const canSave = missing.length === 0 && !saving;

  function addAllergy() {
    const n = newAllergy.trim();
    if (!n) return;
    if (!allergies.some((a) => a.type === newAllergyType && a.name.toLowerCase() === n.toLowerCase())) {
      setAllergies([...allergies, { name: n, type: newAllergyType, severity: 'unknown' }]);
    }
    setAllergiesNotKnown(false);
    setNewAllergy('');
  }

  function addCondition() {
    const n = newCondition.trim();
    if (!n) return;
    if (!conditions.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      setConditions([...conditions, { name: n }]);
    }
    setNewCondition('');
  }

  function updateMed(index: number, patch: Partial<MedicationDraft>) {
    setMeds(meds.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const failures: string[] = [];
    try {
      // 1. The child row. A new date of birth rebuilds the vaccine schedule
      //    in the DB (trigger, migration 0023); doses marked given stay given.
      const trimmedBg = bloodGroup.trim();
      const { error: childErr } = await supabase
        .from('children')
        .update({
          name: name.trim(),
          dob: toDateOnlyString(dob),
          sex: sex === 'Male' ? 'male' : sex === 'Female' ? 'female' : child.sex,
          blood_group: BLOOD_GROUP_RE.test(trimmedBg) ? trimmedBg : null,
          ...(hasNotKnownColumn ? { allergies_not_known: allergies.length === 0 && allergiesNotKnown } : {}),
        })
        .eq('id', child.id);
      if (childErr) {
        dbg.dbError('EditChild: child update failed', childErr);
        throw new Error(`Could not save ${name.trim() || 'the'} details. Please try again.`);
      }

      // 2. Allergies, conditions, medicines: remove deleted rows, add new ones,
      //    update changed medicines. Each list reports its own failure.
      const keptAllergyIds = new Set(allergies.filter((a) => a.id).map((a) => a.id));
      const removedAllergies = child.allergies.filter((a) => !keptAllergyIds.has(a.id)).map((a) => a.id);
      const newAllergies = allergies.filter((a) => !a.id);

      const keptConditionIds = new Set(conditions.filter((c) => c.id).map((c) => c.id));
      const removedConditions = child.conditions.filter((c) => !keptConditionIds.has(c.id)).map((c) => c.id);
      const newConditions = conditions.filter((c) => !c.id);

      const namedMeds = meds.filter((m) => m.name.trim());
      const keptMedIds = new Set(namedMeds.filter((m) => m.id).map((m) => m.id));
      const removedMeds = child.medications.filter((m) => !keptMedIds.has(m.id)).map((m) => m.id);
      const newMeds = namedMeds.filter((m) => !m.id);
      const changedMeds = namedMeds.filter((m) => {
        if (!m.id) return false;
        const old = child.medications.find((o) => o.id === m.id);
        return !!old && (old.name !== m.name.trim() || (old.dosage ?? '') !== m.dosage.trim() || (old.frequency ?? '') !== m.frequency);
      });

      const step = async (label: string, ops: PromiseLike<{ error: unknown }>[]) => {
        const results = await Promise.all(ops);
        const err = results.find((r) => r.error)?.error;
        if (err) {
          dbg.dbError(`EditChild: ${label} failed`, err);
          failures.push(label);
        }
      };

      await Promise.all([
        step('allergies', [
          ...(removedAllergies.length ? [supabase.from('allergies').delete().in('id', removedAllergies)] : []),
          ...(newAllergies.length
            ? [supabase.from('allergies').insert(newAllergies.map((a) => ({ child_id: child.id, name: a.name, type: a.type, severity: a.severity })))]
            : []),
        ]),
        step('conditions', [
          ...(removedConditions.length ? [supabase.from('conditions').delete().in('id', removedConditions)] : []),
          ...(newConditions.length
            ? [supabase.from('conditions').insert(newConditions.map((c) => ({ child_id: child.id, name: c.name })))]
            : []),
        ]),
        step('medicines', [
          ...(removedMeds.length ? [supabase.from('medications').delete().in('id', removedMeds)] : []),
          ...(newMeds.length
            ? [supabase.from('medications').insert(newMeds.map((m) => ({
                child_id: child.id,
                name: m.name.trim(),
                dosage: m.dosage.trim() || null,
                frequency: m.frequency || null,
              })))]
            : []),
          ...changedMeds.map((m) =>
            supabase
              .from('medications')
              .update({ name: m.name.trim(), dosage: m.dosage.trim() || null, frequency: m.frequency || null })
              .eq('id', m.id as string),
          ),
        ]),
      ]);

      await refetch();
      if (failures.length > 0) {
        throw new Error(`Details saved, but ${failures.join(', ')} did not save. Please try again.`);
      }
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[layout.screenContainer, { paddingTop: insets.top }]}>
      <ScreenHeader title={`Edit ${child.name}`} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'android' ? 'height' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          {/* Basics */}
          <View style={styles.card}>
            <Text style={typography.title} accessibilityRole="header">Basics</Text>
            <TextInputField label="First name" placeholder="e.g. Aarav" value={name} onChangeText={setName} autoCapitalize="words" />

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Date of birth</Text>
              {Platform.OS === 'web' ? (
                // Keeps the raw text while typing; parses only a complete date (R2-10).
                <WebDobInput
                  label="Date of birth"
                  value={dob}
                  onChange={(d) => {
                    if (d) setDob(d);
                  }}
                  max={todayDateOnly()}
                  min={toDateOnlyString(minAllowedDob())}
                />
              ) : (
                <Pressable
                  onPress={() => setPickerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Date of birth, ${formatDate(dob, { year: 'always' })}. Change`}
                  style={({ pressed }) => [styles.dateField, pressed && styles.pressed]}
                >
                  <Ionicons name="calendar-outline" size={18} color={AppColors.primary} />
                  <Text style={styles.dateText}>{formatDate(dob, { year: 'always' })}</Text>
                  <Ionicons name="chevron-down" size={16} color={AppColors.onSurfaceVariant} />
                </Pressable>
              )}
              {pickerOpen && Platform.OS !== 'web' ? (
                <DateTimePicker
                  value={dob}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  maximumDate={new Date()}
                  minimumDate={minAllowedDob()}
                  themeVariant="light"
                  onChange={(event, date) => {
                    setPickerOpen(false);
                    if (event.type === 'set' && date) setDob(date);
                  }}
                />
              ) : null}
              {dobOutOfRange ? (
                <Text style={[typography.caption, styles.errorInline]}>
                  {isDobInFuture(dob)
                    ? 'That date is in the future. Please double-check it.'
                    : 'LilSteps cares for children from birth to 15 years. Please double-check the date.'}
                </Text>
              ) : (
                <Text style={typography.caption}>{formatAgeLabel(dob, { old: true })}</Text>
              )}
              {dobChanged && !dobOutOfRange ? (
                <View style={styles.notice}>
                  <Ionicons name="information-circle-outline" size={16} color={AppColors.secondary} />
                  <Text style={[typography.caption, styles.noticeText]}>
                    Saving a new date of birth recalculates the vaccine schedule. Doses already marked as given stay marked.
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Biological sex</Text>
              <ChipGroup options={SEX_OPTIONS} selected={sex ? [sex] : []} onChange={(v) => setSex(v[0] ?? '')} />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Blood group</Text>
              <ChipGroup
                options={BLOOD_GROUPS}
                selected={bloodGroup ? [bloodGroup] : [BLOOD_GROUP_UNKNOWN]}
                onChange={(v) => setBloodGroup(v[0] === BLOOD_GROUP_UNKNOWN ? '' : v[0] ?? '')}
              />
            </View>
          </View>

          {/* Allergies */}
          <View style={styles.card}>
            <Text style={typography.title} accessibilityRole="header">Allergies</Text>
            {allergies.length === 0 ? (
              hasNotKnownColumn ? (
                <ChipGroup
                  options={[ALLERGIES_NONE, ALLERGIES_NOT_KNOWN]}
                  selected={[allergiesNotKnown ? ALLERGIES_NOT_KNOWN : ALLERGIES_NONE]}
                  onChange={(v) => setAllergiesNotKnown(v[0] === ALLERGIES_NOT_KNOWN)}
                />
              ) : (
                <Text style={typography.meta}>No allergies recorded</Text>
              )
            ) : null}
            {allergies.map((a, i) => (
              <ListItem
                key={a.id ?? `new-${i}`}
                title={a.name}
                meta={ALLERGY_TYPE_LABEL[a.type]}
                onRemove={() => setAllergies(allergies.filter((_, j) => j !== i))}
              />
            ))}
            <View style={styles.addBlock}>
              <TextInputField
                label="Add an allergy"
                placeholder="e.g. Peanuts"
                value={newAllergy}
                onChangeText={setNewAllergy}
                onSubmitEditing={addAllergy}
                returnKeyType="done"
              />
              <ChipGroup
                options={ALLERGY_TYPES.map((t) => t.label)}
                selected={[ALLERGY_TYPE_LABEL[newAllergyType]]}
                onChange={(v) => setNewAllergyType(ALLERGY_TYPES.find((t) => t.label === v[0])?.type ?? 'food')}
              />
              <GradientButton
                label="Add allergy"
                variant="outline"
                size="sm"
                showArrow={false}
                disabled={!newAllergy.trim()}
                onPress={addAllergy}
                style={styles.addButton}
              />
            </View>
          </View>

          {/* Conditions */}
          <View style={styles.card}>
            <Text style={typography.title} accessibilityRole="header">Chronic conditions</Text>
            {conditions.length === 0 ? <Text style={typography.meta}>No conditions recorded</Text> : null}
            {conditions.map((c, i) => (
              <ListItem
                key={c.id ?? `new-${i}`}
                title={c.name}
                onRemove={() => setConditions(conditions.filter((_, j) => j !== i))}
              />
            ))}
            <View style={styles.addBlock}>
              <TextInputField
                label="Add a condition"
                placeholder="e.g. Asthma"
                value={newCondition}
                onChangeText={setNewCondition}
                onSubmitEditing={addCondition}
                returnKeyType="done"
              />
              <GradientButton
                label="Add condition"
                variant="outline"
                size="sm"
                showArrow={false}
                disabled={!newCondition.trim()}
                onPress={addCondition}
                style={styles.addButton}
              />
            </View>
          </View>

          {/* Medicines */}
          <View style={styles.card}>
            <Text style={typography.title} accessibilityRole="header">Regular medicines</Text>
            {meds.length === 0 ? <Text style={typography.meta}>No regular medicines recorded</Text> : null}
            {meds.map((m, i) => (
              <View key={m.id ?? `new-${i}`} style={styles.medCard}>
                <View style={styles.medHeader}>
                  <Text style={typography.sectionLabel}>{m.name.trim() || `Medicine ${i + 1}`}</Text>
                  <TextButton
                    label="Remove"
                    tone="danger"
                    onPress={() => setMeds(meds.filter((_, j) => j !== i))}
                    accessibilityLabel={`Remove ${m.name.trim() || `medicine ${i + 1}`}`}
                  />
                </View>
                <TextInputField label="Medicine name" placeholder="e.g. Paracetamol" value={m.name} onChangeText={(v) => updateMed(i, { name: v })} />
                <TextInputField label="Dose" placeholder="e.g. 100mg, 5ml" value={m.dosage} onChangeText={(v) => updateMed(i, { dosage: v })} />
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>How often</Text>
                  <ChipGroup
                    options={FREQUENCY_OPTIONS}
                    selected={m.frequency ? [m.frequency] : []}
                    onChange={(v) => updateMed(i, { frequency: v[0] ?? '' })}
                  />
                </View>
              </View>
            ))}
            <GradientButton
              label="Add medicine"
              variant="outline"
              size="sm"
              showArrow={false}
              onPress={() => setMeds([...meds, { name: '', dosage: '', frequency: '' }])}
              style={styles.addButton}
            />
          </View>

          {error ? (
            <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>
          ) : null}
          {missing.length > 0 ? (
            <Text style={[typography.caption, styles.center]}>{`Add ${missing.join(', ')} to save`}</Text>
          ) : null}
          <GradientButton label="Save changes" onPress={save} loading={saving} disabled={!canSave} />

          {/* Set-up answers save on their own (Edit / Remove), not with "Save changes". */}
          <SetupAnswersCard childId={child.id} childName={child.name} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function ListItem({ title, meta, onRemove }: { title: string; meta?: string; onRemove: () => void }) {
  return (
    <View style={styles.listItem}>
      <View style={styles.listText}>
        <Text style={typography.body}>{title}</Text>
        {meta ? <Text style={typography.caption}>{meta}</Text> : null}
      </View>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${title}`}
        hitSlop={8}
        style={({ pressed }) => [styles.removeIcon, pressed && styles.pressed]}
      >
        <Ionicons name="close" size={18} color={AppColors.onSurfaceVariant} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
    gap: 16,
  },
  field: { gap: 8 },
  fieldLabel: { ...typography.sectionLabel, marginLeft: 2 },
  // Matches TextInputField: white field, 1.5px fieldBorder, 10 radius, 48 high.
  dateField: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    minHeight: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: AppColors.fieldBorder,
  },
  dateText: { flex: 1, fontFamily: FontFamily.regular, fontSize: 16, color: AppColors.onSurface },
  pressed: { opacity: 0.85 },
  notice: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: AppColors.mintSurface,
  },
  noticeText: { flex: 1, color: AppColors.onSurface },
  errorInline: { color: AppColors.danger },
  addBlock: { gap: 12 },
  addButton: { alignSelf: 'flex-start' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  listText: { flex: 1, minWidth: 0 },
  removeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surfaceContainer,
  },
  medCard: {
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 12,
    gap: 12,
  },
  medHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  errorText: {
    fontFamily: FontFamily.medium,
    fontSize: 13,
    color: AppColors.danger,
    textAlign: 'center',
  },
  center: { textAlign: 'center' },
});
