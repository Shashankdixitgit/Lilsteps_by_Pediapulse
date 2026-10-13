import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, Radius } from '@/constants/theme';
import { useOnboarding, type ChildSex } from '@/context/onboarding';
import {
  formatAgeLabel,
  getOnboardingPath,
  isDobInFuture,
  isDobInRange,
  minAllowedDob,
  ONBOARDING_PATH_LABELS,
} from '@/lib/age';
import { formatDate, parseDateOnly, toDateOnlyString, todayDateOnly } from '@/lib/date';
import { typography } from '@/styles/global';

const SEX_OPTIONS = ['Male', 'Female'];
const RELATIONSHIP = ['Mother', 'Father', 'Grandparent', 'Guardian'];

function sexLabel(sex: ChildSex): string {
  return sex === 'male' ? 'Male' : sex === 'female' ? 'Female' : '';
}

/** "a first name, date of birth and sex" from the missing parts. */
function joinMissing(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export default function ChildBasicsScreen() {
  // Every answer is read from and written to the onboarding context, so going
  // Back and forward never shows an empty screen.
  const {
    childName, setChildName,
    dob, setDob: saveDob,
    childSex, setChildSex,
    relationship, setRelationship,
    setBracket,
  } = useOnboarding();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDob, setDraftDob] = useState<Date>(new Date());

  // The path is always worked out from the DOB with calendar arithmetic
  // (lib/age), so it is right on a birthday at any time of day.
  const setDob = (next: Date | null) => {
    saveDob(next);
    setBracket(next ? getOnboardingPath(next) : null);
  };

  const openPicker = () => {
    setDraftDob(dob ?? new Date());
    setPickerOpen(true);
  };

  const confirmIosPicker = () => {
    setDob(draftDob);
    setPickerOpen(false);
  };

  const bracket = dob ? getOnboardingPath(dob) : null;
  const dobOutOfRange = dob !== null && !isDobInRange(dob);
  const dobInFuture = dob !== null && isDobInFuture(dob);

  const missing: string[] = [];
  if (!childName.trim()) missing.push('a first name');
  if (!dob) missing.push('date of birth');
  else if (dobOutOfRange) missing.push('a valid date of birth');
  if (!childSex) missing.push('biological sex');
  const canContinue = missing.length === 0;

  const handleContinue = () => {
    if (!canContinue || !dob || !bracket) return;
    setChildName(childName.trim());
    setBracket(bracket);
    router.push('/(onboarding)/physical');
  };

  return (
    <OnboardingShell
      screen="child-basics"
      title="Your child"
      subtitle="The basics about your child"
      ctaLabel="Continue"
      onCta={handleContinue}
      ctaDisabled={!canContinue}
      footerExtra={
        !canContinue ? (
          <Text style={[typography.caption, styles.missingHint]}>
            {`Add ${joinMissing(missing)} to continue`}
          </Text>
        ) : null
      }
    >
      <TextInputField
        label="First name"
        placeholder="Child's first name"
        value={childName}
        onChangeText={setChildName}
        autoCapitalize="words"
      />

      {/* Date of Birth — styled to match TextInputField */}
      <View>
        <Text style={styles.dobLabel}>Date of birth</Text>
        {Platform.OS === 'web' ? (
          <View style={[styles.dateField, dob && styles.dateFieldFilled]}>
            {/* Native browser date picker — react-native-web passes <input> to DOM.
                Values are local 'YYYY-MM-DD' dates, never UTC timestamps. */}
            <input
              type="date"
              max={todayDateOnly()}
              min={toDateOnlyString(minAllowedDob())}
              value={dob ? toDateOnlyString(dob) : ''}
              onChange={(e: { target: { value: string } }) => {
                const val = e.target.value;
                const parsed = val ? parseDateOnly(val) : null;
                setDob(parsed && !Number.isNaN(parsed.getTime()) ? parsed : null);
              }}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: 'Inter_400Regular',
                fontSize: 16,
                color: dob ? AppColors.onSurface : AppColors.muted,
                cursor: 'pointer',
              }}
            />
          </View>
        ) : (
          <Pressable
            onPress={openPicker}
            accessibilityRole="button"
            accessibilityLabel={dob ? `Date of birth, ${formatDate(dob, { year: 'always' })}` : 'Select date of birth'}
            style={({ pressed }) => [
              styles.dateField,
              dob && styles.dateFieldFilled,
              pressed && styles.dateFieldPressed,
            ]}
          >
            <Ionicons
              name="calendar-outline"
              size={18}
              color={dob ? AppColors.primary : AppColors.outlineVariant}
            />
            <Text style={dob ? styles.dateText : styles.datePlaceholder}>
              {dob ? formatDate(dob, { year: 'always' }) : 'Tap to select your child’s birthdate'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={dob ? AppColors.onSurfaceVariant : AppColors.outlineVariant}
            />
          </Pressable>
        )}
        {!dob && (
          <Text style={[typography.caption, styles.dobHint]}>Helps us tailor health advice by age</Text>
        )}
        {dob && !dobOutOfRange && bracket && (
          <View style={styles.ageRow}>
            <View style={styles.ageDot} />
            <Text style={styles.ageText}>{formatAgeLabel(dob, { old: true })}</Text>
            <Text style={styles.ageDivider}>•</Text>
            <Text style={styles.bracketText}>{ONBOARDING_PATH_LABELS[bracket]}</Text>
          </View>
        )}
        {dob && dobOutOfRange && (
          <View style={styles.ageRow}>
            <View style={[styles.ageDot, { backgroundColor: AppColors.tertiary }]} />
            <Text style={[styles.ageText, styles.ageTextError]}>
              {dobInFuture
                ? 'That date is in the future. Please double-check the date.'
                : 'LilSteps cares for children from birth to 15 years. Please double-check the date.'}
            </Text>
          </View>
        )}
      </View>

      <View>
        <Text style={styles.fieldLabel}>Biological sex</Text>
        <ChipGroup
          options={SEX_OPTIONS}
          selected={childSex ? [sexLabel(childSex)] : []}
          onChange={(vals) => {
            const v = vals[0];
            setChildSex(v === 'Male' ? 'male' : v === 'Female' ? 'female' : null);
          }}
        />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Your relationship to the child</Text>
        <ChipGroup
          options={RELATIONSHIP}
          selected={relationship ? [relationship] : []}
          onChange={(vals) => setRelationship(vals[0] ?? '')}
        />
      </View>

      {/* iOS bottom-sheet picker */}
      {Platform.OS === 'ios' && (
        <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Text style={styles.modalCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.modalTitle}>Birthdate</Text>
              <Pressable onPress={confirmIosPicker} hitSlop={12}>
                <Text style={styles.modalDone}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={draftDob}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              minimumDate={minAllowedDob()}
              onChange={(_, date) => {
                if (date) setDraftDob(date);
              }}
              themeVariant="light"
            />
          </View>
        </Modal>
      )}

      {/* Android native dialog */}
      {Platform.OS === 'android' && pickerOpen && (
        <DateTimePicker
          value={dob ?? new Date()}
          mode="date"
          display="default"
          maximumDate={new Date()}
          minimumDate={minAllowedDob()}
          onChange={(_, date) => {
            setPickerOpen(false);
            if (date) setDob(date);
          }}
        />
      )}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  dobLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
    marginBottom: 6,
  },
  dobHint: {
    marginTop: 6,
    marginLeft: 2,
  },
  fieldLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.onSurface,
    marginLeft: 2,
    marginBottom: 8,
  },
  // Matches TextInputField: white field, 1.5px fieldBorder, 10 radius, 48 high.
  dateField: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    height: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: AppColors.fieldBorder,
  },
  dateFieldFilled: {},
  dateFieldPressed: {
    opacity: 0.85,
  },
  dateText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: AppColors.onSurface,
  },
  datePlaceholder: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: AppColors.placeholder,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    marginLeft: 2,
  },
  ageTextError: {
    flex: 1,
    color: AppColors.tertiary,
  },
  missingHint: {
    textAlign: 'center',
  },
  ageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.primary,
  },
  ageText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: AppColors.onSurface,
  },
  ageDivider: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: AppColors.outlineVariant,
  },
  bracketText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    color: AppColors.muted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: AppColors.overlay,
  },
  modalSheet: {
    backgroundColor: AppColors.surfaceContainerLowest,
    paddingTop: 8,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.outlineVariant,
    alignSelf: 'center',
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: AppColors.onSurface,
  },
  modalCancel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: AppColors.onSurfaceVariant,
  },
  modalDone: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: AppColors.secondary,
  },
});
