import { LinearGradient } from 'expo-linear-gradient';
import { Input, TextField } from 'heroui-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors } from '@/constants/theme';

export interface LogMeasurementData {
  weight?: number;
  height?: number;
  note?: string;
}

export interface LogMeasurementSheetProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: LogMeasurementData) => void;
}

export function LogMeasurementSheet({ visible, onClose, onSave }: LogMeasurementSheetProps) {
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [note, setNote] = useState('');

  function handleSave() {
    if (!weight && !height) return;
    onSave({
      weight: weight ? parseFloat(weight) : undefined,
      height: height ? parseFloat(height) : undefined,
      note: note || undefined,
    });
    setWeight('');
    setHeight('');
    setNote('');
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen">
      <Pressable style={styles.overlay} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Log Measurement</Text>

        <View style={styles.content}>
          <View style={styles.fields}>
            <View style={styles.field}>
              <Text style={styles.label}>Weight (kg)</Text>
              <TextField>
                <Input
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 12.4"
                  variant="secondary"
                  className="bg-surface border border-border rounded-xl"
                />
              </TextField>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Height (cm)</Text>
              <TextField>
                <Input
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 84"
                  variant="secondary"
                  className="bg-surface border border-border rounded-xl"
                />
              </TextField>
            </View>
          </View>

          <View style={styles.fieldFull}>
            <Text style={styles.label}>Note (optional)</Text>
            <TextField>
              <Input
                value={note}
                onChangeText={setNote}
                placeholder="Any observations..."
                multiline
                numberOfLines={4}
                variant="secondary"
                className="bg-surface border border-border rounded-xl"
                style={{ minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }}
              />
            </TextField>
          </View>

          <Pressable style={styles.saveBtn} onPress={handleSave}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveBtnGradient}
            >
              <Text style={styles.saveBtnText}>Save Measurement</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: AppColors.overlay },
  sheet: {
    backgroundColor: AppColors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 48,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: AppColors.outlineVariant,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: AppColors.onSurface,
    paddingHorizontal: 20,
    letterSpacing: -0.3,
    marginBottom: 20,
  },
  content: { paddingHorizontal: 20, gap: 20 },
  fields: { flexDirection: 'row', gap: 12 },
  field: { flex: 1 },
  fieldFull: { width: '100%' },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: AppColors.onSurface,
    marginBottom: 8,
  },
  saveBtn: { borderRadius: 999, overflow: 'hidden', marginTop: 8 },
  saveBtnGradient: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: AppColors.onPrimary,
  },
});
