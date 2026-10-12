import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import type { DoctorRow } from '@/hooks/useDoctors';

/** Last-name initial ("Dr. Emily Chen" -> "C"), not the "D" of "Dr.". */
function doctorInitial(name: string) {
  return name.trim().split(' ').slice(-1)[0]?.charAt(0) ?? name.charAt(0);
}

export interface DoctorPickerProps {
  doctors: DoctorRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Doctor choice as rows inside one hairline card (no card per doctor).
 * Selected row: greenWash fill + forest check. Avatar 36, name 15, spec 13.
 */
export function DoctorPicker({ doctors, selectedId, onSelect }: DoctorPickerProps) {
  return (
    <View style={styles.list}>
      {doctors.map((doc, i) => {
        const active = selectedId === doc.id;
        return (
          <Pressable
            key={doc.id}
            onPress={() => onSelect(doc.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${doc.name}, ${doc.specialisation}`}
            style={({ pressed }) => [
              styles.row,
              i > 0 && styles.divider,
              active && styles.rowActive,
              pressed && !active && styles.rowPressed,
            ]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{doctorInitial(doc.name)}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>{doc.name}</Text>
              <Text style={styles.spec} numberOfLines={1}>{doc.specialisation}</Text>
            </View>
            {active ? (
              <Ionicons name="checkmark-circle" size={22} color={AppColors.primary} />
            ) : (
              <View style={styles.radio} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 16, paddingVertical: 12 },
  rowActive: { backgroundColor: AppColors.greenWash },
  rowPressed: { backgroundColor: AppColors.surfaceContainerLow },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: AppColors.border },
  avatar: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.primary },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  spec: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: AppColors.fieldBorder, margin: 1 },
});
