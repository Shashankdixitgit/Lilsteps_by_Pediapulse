import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, FontFamily } from '@/constants/theme';
import { istTodayDateOnly, type GrowthRow } from '@/hooks/useGrowth';
import { parseDateOnly } from '@/lib/date';
import { typography } from '@/styles/global';

import { confirmAsync } from './confirm';
import { DateField } from './DateField';
import { checkMeasure, measurePlaceholders, parseMeasure } from './measurementLimits';
import { Sheet } from './Sheet';

export interface LogMeasurementData {
  weight: number | null;
  height: number | null;
  note: string | null;
  /** 'YYYY-MM-DD' */
  measured_at: string;
}

export interface LogMeasurementSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Throws on failure; the sheet stays open and shows the message.
   *  Resolve `false` to keep the sheet open without saving (the parent
   *  cancelled an "Is this right?" / "Replace?" question). */
  onSave: (data: LogMeasurementData) => Promise<void | false>;
  /** Edit mode: the entry being changed. Omit to log a new one.
   *  Give the sheet a new `key` per opening so its fields reset. */
  entry?: GrowthRow | null;
  /** Edit mode only: removes the entry. Throws on failure. */
  onDelete?: () => Promise<void>;
  childName: string;
  /** Child's DOB 'YYYY-MM-DD': bounds the date and sets the expected ranges. */
  dob: string | null;
  /** Under-2s are measured lying down: label the field "Length". */
  lengthLabel?: boolean;
}

const numText = (v: number | null | undefined) => (v == null ? '' : String(Number(v)));

export function LogMeasurementSheet({
  visible,
  onClose,
  onSave,
  entry,
  onDelete,
  childName,
  dob,
  lengthLabel,
}: LogMeasurementSheetProps) {
  // Starts from the entry (edit) or blank (new). The caller gives the sheet a
  // new `key` each time it opens, so every opening starts fresh.
  const today = istTodayDateOnly();
  const [weight, setWeight] = useState(() => numText(entry?.weight));
  const [height, setHeight] = useState(() => numText(entry?.height));
  const [note, setNote] = useState(entry?.note ?? '');
  const [date, setDate] = useState(entry?.measured_at ?? today);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const onDate = parseDateOnly(date);
  const weightCheck = checkMeasure(weight, 'kg', dob, onDate);
  const heightCheck = checkMeasure(height, 'cm', dob, onDate);
  const weightValue = parseMeasure(weight);
  const heightValue = parseMeasure(height);
  const isEmpty = weightValue === null && heightValue === null;
  const hasError = !!(weightCheck.error || heightCheck.error);
  const placeholders = measurePlaceholders(dob);
  const heightLabel = lengthLabel ? 'Length' : 'Height';
  const isEdit = !!entry;

  async function handleSave() {
    if (busy || isEmpty || hasError) return;
    setBusy('save');
    setSaveError(null);
    try {
      const result = await onSave({
        weight: weightValue,
        height: heightValue,
        note: note.trim() || null,
        measured_at: date,
      });
      if (result === false) {
        setBusy(null);
        return;
      }
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save. Please try again.');
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (busy || !onDelete) return;
    const ok = await confirmAsync(
      'Delete this measurement?',
      `It will be removed from ${childName}'s growth history.`,
      { confirmLabel: 'Delete', destructive: true },
    );
    if (!ok) return;
    setBusy('delete');
    setSaveError(null);
    try {
      await onDelete();
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not delete. Please try again.');
      setBusy(null);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isEdit ? 'Edit measurement' : 'Log measurement'}
      subtitle={`For ${childName}`}
      footer={
        <>
          {saveError ? (
            <View style={styles.errorRow} accessibilityLiveRegion="polite">
              <Ionicons name="alert-circle" size={14} color={AppColors.danger} />
              <Text style={styles.errorText}>{saveError}</Text>
            </View>
          ) : isEmpty ? (
            <Text style={[typography.caption, styles.center]}>Enter a weight, a {heightLabel.toLowerCase()} or both</Text>
          ) : null}
          <GradientButton
            label={isEdit ? 'Save changes' : 'Save measurement'}
            onPress={handleSave}
            disabled={isEmpty || hasError || busy === 'delete'}
            loading={busy === 'save'}
            showArrow={false}
          />
          {isEdit && onDelete ? (
            <TextButton
              label={busy === 'delete' ? 'Deleting…' : 'Delete measurement'}
              tone="danger"
              onPress={handleDelete}
              disabled={!!busy}
              style={styles.deleteBtn}
            />
          ) : null}
        </>
      }
    >
      <View style={styles.row}>
        <View style={styles.cell}>
          <TextInputField
            label="Weight"
            hint="(kg)"
            hintInline
            placeholder={placeholders.weight}
            value={weight}
            onChangeText={(v) => setWeight(v.replace(',', '.'))}
            keyboardType="decimal-pad"
            accessibilityLabel={`${childName}'s weight in kilograms`}
            error={weightCheck.error}
          />
        </View>
        <View style={styles.cell}>
          <TextInputField
            label={heightLabel}
            hint="(cm)"
            hintInline
            placeholder={placeholders.height}
            value={height}
            onChangeText={(v) => setHeight(v.replace(',', '.'))}
            keyboardType="decimal-pad"
            accessibilityLabel={`${childName}'s ${heightLabel.toLowerCase()} in centimetres`}
            error={heightCheck.error}
          />
        </View>
      </View>
      {weightCheck.warning ? <MeasureWarning text={weightCheck.warning} /> : null}
      {heightCheck.warning ? <MeasureWarning text={heightCheck.warning} /> : null}

      <DateField label="Date measured" value={date} onChange={setDate} min={dob ?? undefined} max={today} />

      <TextInputField
        label="Note"
        hint="(optional)"
        hintInline
        placeholder="e.g. Measured at the clinic"
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        accessibilityLabel="Note"
        style={styles.multiline}
      />
    </Sheet>
  );
}

/** Gentle, non-blocking "Please check" (same look as onboarding). */
function MeasureWarning({ text }: { text: string }) {
  return (
    <View style={styles.warningRow} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle-outline" size={14} color={AppColors.warning} style={styles.warningIcon} />
      <Text style={styles.warningText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { flexGrow: 1, flexBasis: 140, minWidth: 0 },
  multiline: { minHeight: 84, paddingTop: 12 },
  center: { textAlign: 'center' },
  deleteBtn: { alignSelf: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  errorText: { fontFamily: FontFamily.medium, fontSize: 12, color: AppColors.danger, flexShrink: 1 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: -8, marginLeft: 2 },
  warningIcon: { marginTop: 1 },
  warningText: { ...typography.caption, color: AppColors.warning, flex: 1 },
});
