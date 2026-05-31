import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChipGroup } from '@/components/chip-group';
import { OnboardingShell } from '@/components/onboarding-shell';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { useOnboarding } from '@/context/onboarding';

const SEX_OPTIONS = ['Male', 'Female'];
const RELATIONSHIP = ['Mother', 'Father', 'Grandparent', 'Guardian'];

// Pedia Pulse serves children 0–15. Anything past the 16th birthday is
// out of scope per Proposal §4 ("target users: parents of children 0–15").
const MAX_AGE_YEARS = 16;

function ageYears(dob: Date): number {
  return (Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function isDobInRange(dob: Date): boolean {
  if (dob.getTime() > Date.now()) return false; // future
  return ageYears(dob) < MAX_AGE_YEARS;
}

function minAllowedDobIso(): string {
  // Earliest acceptable DOB = exactly 16 years ago today.
  const d = new Date();
  d.setFullYear(d.getFullYear() - MAX_AGE_YEARS);
  return d.toISOString().split('T')[0];
}

function calculateBracket(dob: Date): 'A' | 'B' | 'C' | null {
  if (!isDobInRange(dob)) return null;
  const a = ageYears(dob);
  if (a < 3) return 'A';
  if (a < 9) return 'B';
  return 'C';
}

function bracketLabel(b: 'A' | 'B' | 'C'): string {
  return b === 'A' ? 'Infant care (0–2)' : b === 'B' ? 'Early years (3–8)' : 'Pre-teen (9–15)';
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calculateAgeLabel(dob: Date): string {
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  if (now.getDate() < dob.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years === 0) return `${months} ${months === 1 ? 'month' : 'months'} old`;
  if (months === 0) return `${years} ${years === 1 ? 'year' : 'years'} old`;
  return `${years}y ${months}m old`;
}

export default function ChildBasicsScreen() {
  const { setChildName, setBracket, setChildSex, setDob: saveDob } = useOnboarding();
  const [firstName, setFirstName] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDob, setDraftDob] = useState<Date>(new Date());
  const [sex, setSex] = useState<string[]>([]);
  const [relationship, setRelationship] = useState<string[]>([]);

  const openPicker = () => {
    setDraftDob(dob ?? new Date());
    setPickerOpen(true);
  };

  const confirmIosPicker = () => {
    setDob(draftDob);
    setPickerOpen(false);
  };

  const bracket = dob ? calculateBracket(dob) : null;
  const dobOutOfRange = dob !== null && !isDobInRange(dob);
  const canContinue = !!firstName.trim() && !!dob && !dobOutOfRange && !!sex[0];

  const handleContinue = () => {
    if (!canContinue || !dob) return;
    setChildName(firstName);
    if (sex[0]) setChildSex(sex[0].toLowerCase() as 'male' | 'female');
    if (bracket) { setBracket(bracket); saveDob(dob); }
    router.push('/(onboarding)/physical');
  };

  return (
    <OnboardingShell
      progress={0.18}
      title="Child's Details"
      subtitle="Basic information about your child"
      ctaLabel="Continue"
      onCta={handleContinue}
    >
      <TextInputField
        label="First Name"
        placeholder="Child's first name"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
      />

      {/* Date of Birth — styled to match TextInputField */}
      <View>
        <View style={styles.labelRow}>
          <Text style={styles.dobLabel}>Date of Birth</Text>
          <Text style={styles.fieldHint}>(Helps us tailor health advice by age)</Text>
        </View>
        {Platform.OS === 'web' ? (
          <View style={[styles.dateField, dob && styles.dateFieldFilled]}>
            <Ionicons
              name="calendar-outline"
              size={18}
              color={dob ? AppColors.primary : AppColors.outlineVariant}
            />
            {/* Native browser date picker — react-native-web passes <input> to DOM */}
            <input
              type="date"
              max={new Date().toISOString().split('T')[0]}
              min={minAllowedDobIso()}
              value={dob ? dob.toISOString().split('T')[0] : ''}
              onChange={(e: { target: { value: string } }) => {
                const val = e.target.value;
                setDob(val ? new Date(val) : null);
              }}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontFamily: 'PlusJakartaSans_600SemiBold',
                fontSize: 16,
                color: dob ? AppColors.onSurface : AppColors.onSurfaceVariant,
                cursor: 'pointer',
              }}
            />
          </View>
        ) : (
          <Pressable
            onPress={openPicker}
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
              {dob ? formatDate(dob) : 'Tap to select your child’s birthdate'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={dob ? AppColors.onSurfaceVariant : AppColors.outlineVariant}
            />
          </Pressable>
        )}
        {dob && !dobOutOfRange && bracket && (
          <View style={styles.ageRow}>
            <View style={styles.ageDot} />
            <Text style={styles.ageText}>{calculateAgeLabel(dob)}</Text>
            <Text style={styles.ageDivider}>•</Text>
            <Text style={styles.bracketText}>{bracketLabel(bracket)}</Text>
          </View>
        )}
        {dob && dobOutOfRange && (
          <View style={styles.ageRow}>
            <View style={[styles.ageDot, { backgroundColor: AppColors.tertiary }]} />
            <Text style={[styles.ageText, { color: AppColors.tertiary }]}>
              Pedia Pulse cares for children 0–15. Please double-check the date.
            </Text>
          </View>
        )}
      </View>

      <View>
        <Text style={styles.fieldLabel}>Biological Sex</Text>
        <ChipGroup options={SEX_OPTIONS} selected={sex} onChange={setSex} />
      </View>

      <View>
        <Text style={styles.fieldLabel}>Your Relationship to Child</Text>
        <ChipGroup options={RELATIONSHIP} selected={relationship} onChange={setRelationship} />
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginLeft: 4,
    marginBottom: 8,
  },
  dobLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: AppColors.onSurface,
  },
  fieldLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: AppColors.onSurface,
    marginLeft: 4,
    marginBottom: 8,
  },
  fieldHint: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: AppColors.onSurfaceVariant,
  },
  dateField: {
    backgroundColor: AppColors.surfaceContainerLow,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dateFieldFilled: {
    backgroundColor: AppColors.surfaceContainerLowest,
    borderColor: `${AppColors.primary}33`,
  },
  dateFieldPressed: {
    opacity: 0.85,
  },
  dateText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 16,
    color: AppColors.onSurface,
  },
  datePlaceholder: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    color: AppColors.onSurfaceVariant,
  },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginLeft: 4,
  },
  ageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: AppColors.primary,
  },
  ageText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: AppColors.onSurface,
  },
  ageDivider: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: AppColors.outlineVariant,
  },
  bracketText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    color: AppColors.primary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(52, 44, 56, 0.4)',
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
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: AppColors.onSurface,
  },
  modalCancel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
    color: AppColors.onSurfaceVariant,
  },
  modalDone: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: AppColors.primary,
  },
});
