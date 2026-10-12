import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { StatusPill, StatusTone } from '@/components/ui/StatusPill';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';

interface VaccinationCardProps {
  nextVaccine: string;
  nextDate: string;
  onViewSchedule?: () => void;
  /** Optional status for the pill; derived from the label when omitted. */
  status?: 'overdue' | 'upcoming' | 'done';
}

export function VaccinationCard({ nextVaccine, nextDate, onViewSchedule, status }: VaccinationCardProps) {
  const derived = status ?? (nextVaccine.startsWith('Overdue') ? 'overdue' : nextVaccine.startsWith('All caught up') ? 'done' : 'upcoming');
  const pill: { tone: StatusTone; label: string } =
    derived === 'overdue'
      ? { tone: 'danger', label: nextDate ? `Overdue · ${nextDate}` : 'Overdue' }
      : derived === 'done'
        ? { tone: 'success', label: 'All caught up' }
        : { tone: 'warning', label: `Next: ${nextDate}` };
  const name = derived === 'overdue' ? nextVaccine.replace(/^Overdue:\s*/, '') : nextVaccine;

  return (
    <PressableScale
      onPress={onViewSchedule}
      accessibilityLabel={`Vaccines. ${pill.label}. ${name}. View schedule`}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      style={styles.card}
    >
      <View style={styles.iconWell}>
        <Ionicons name="shield-checkmark" size={18} color={AppColors.secondary} />
      </View>

      <View style={styles.textContainer}>
        <StatusPill dot tone={pill.tone} label={pill.label} />
        <Text style={styles.vaccineName} numberOfLines={1}>
          {derived === 'done' ? 'Lovely work, nothing due right now' : name}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={AppColors.outline} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  iconWell: {
    width: Size.iconWell,
    height: Size.iconWell,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  vaccineName: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.onSurface,
    letterSpacing: -0.1,
  },
});
