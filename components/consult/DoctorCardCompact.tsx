import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { useNarrowLayout } from '@/components/ui/useNarrowLayout';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import type { DoctorRow } from '@/hooks/useDoctors';

import { doctorInitial } from './appointmentFormat';


export interface DoctorCardCompactProps {
  doctor: DoctorRow;
  /** e.g. "MBBS, MD (Pediatrics)" (useDoctorQualifications); omitted when unknown. */
  qualifications?: string | null;
  onBook: (id: string) => void;
  /**
   * Row inside a parent list card: no own border/radius, hairline top divider
   * when `divider` is set. Default renders a standalone hairline card row.
   */
  inList?: boolean;
  divider?: boolean;
}

/**
 * Doctor as a compact row: 36 initial avatar, name 15 SemiBold, specialty 13
 * muted, small outline "Book" pill (32). The whole row books too (same
 * `onBook`). Lay rows out vertically (not in a horizontal scroll).
 */
/**
 * The small outline "Book" pill (32), drawn as a label only. It sits inside a
 * row that is already the button, so it must not be a second, nested button
 * (invalid HTML on web and a double stop for screen readers).
 */
export function BookPill({ label = 'Book' }: { label?: string }) {
  return (
    <View style={styles.pill} accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

export function DoctorCardCompact({ doctor, qualifications, onBook, inList, divider }: DoctorCardCompactProps) {
  const available = doctor.is_available;
  const narrow = useNarrowLayout();
  const book = () => {
    if (available) onBook(doctor.id);
  };
  return (
    <PressableScale
      onPress={book}
      disabled={!available}
      scaleTo={0.99}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      accessibilityLabel={`${doctor.name}, ${doctor.specialisation}${qualifications ? `, ${qualifications}` : ''}${available ? '. Book' : '. Unavailable'}`}
      style={[styles.row, !inList && styles.standalone, inList && divider && styles.divider]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{doctorInitial(doctor.name)}</Text>
      </View>
      <View style={styles.text}>
        {/* Never cut with "…" (review must-fix 6): names wrap. */}
        <Text style={styles.name}>{doctor.name}</Text>
        <Text style={styles.spec}>{doctor.specialisation}</Text>
        {qualifications ? <Text style={styles.quals}>{qualifications}</Text> : null}
      </View>
      {available ? (
        narrow ? (
          <Ionicons name="chevron-forward" size={18} color={AppColors.outline} />
        ) : (
          <BookPill />
        )
      ) : (
        <Text style={styles.unavailable}>Unavailable</Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  standalone: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  avatar: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Size.iconWell / 2,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.primary },
  text: { flex: 1, gap: 2 },
  name: { fontFamily: FontFamily.semibold, fontSize: 15, lineHeight: 20, color: AppColors.onSurface },
  spec: { fontFamily: FontFamily.regular, fontSize: 13, lineHeight: 18, color: AppColors.muted },
  pill: {
    height: Size.buttonSmall,
    borderRadius: Size.buttonSmall / 2,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.borderStrong,
    backgroundColor: AppColors.card,
  },
  pillLabel: { fontFamily: FontFamily.semibold, fontSize: 13, letterSpacing: -0.1, color: AppColors.primary },
  quals: { fontFamily: FontFamily.regular, fontSize: 12, lineHeight: 16, color: AppColors.muted },
  unavailable: { fontFamily: FontFamily.medium, fontSize: 12, color: AppColors.muted },
});
