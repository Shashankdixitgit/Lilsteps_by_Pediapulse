import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { TextButton } from '@/components/gradient-button';

import { PressableScale } from '@/components/ui/PressableScale';
import { useCompactWidth } from '@/components/home/useCompactWidth';
import { StatusPill, StatusTone } from '@/components/ui/StatusPill';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { ANNUAL_VACCINE_NAMES } from '@/constants/vaccineQuestions';
import type { VaccinationRow } from '@/hooks/useVaccinations';
import { istTodayDateOnly } from '@/hooks/useGrowth';
import { addCalendar, formatDate, parseDateOnly, toDateOnlyString } from '@/lib/date';

/** "Due now" only for a dose in the next few days; later ones read "Due soon" (R3-21). */
const DUE_NOW_DAYS = 3;

interface VaccinationCardProps {
  /** The child's doses in date order, statuses already live (useVaccinations). */
  vaccinations: VaccinationRow[];
  /** First load (or a child switch) still in flight. */
  loading?: boolean;
  /** The last load failed (auth or network): never show "All caught up". */
  error?: string | null;
  onRetry?: () => void;
  onViewSchedule?: () => void;
}

/** "Hep B (Dose 3)", like the Vaccines tab. */
function doseName(v: Pick<VaccinationRow, 'vaccine_name' | 'dose_label'>) {
  return v.dose_label ? `${v.vaccine_name} (${v.dose_label})` : v.vaccine_name;
}

/**
 * Home summary of the Vaccines tab. Same "next" rule as the tab (first dose
 * due in the next 14 days, else the first upcoming one, never the yearly flu
 * shot past its first date) and every dose on that date counted: "6 vaccines
 * due 3 Nov". Overdue and "to check" doses each get their own pill, so
 * neither count hides the other (R2-20). A yearly flu shot not yet recorded
 * is mentioned as a reminder.
 */
export function VaccinationCard({ vaccinations, loading, error, onRetry, onViewSchedule }: VaccinationCardProps) {
  const compact = useCompactWidth();
  // Every child 0-15 gets a schedule when added (DB trigger), so an empty
  // list means it hasn't loaded, not "nothing due". Never reassure from
  // missing data (R3-11): loading / failed / empty each get their own state.
  if (vaccinations.length === 0) {
    if (loading && !error) {
      return (
        <View style={[styles.card, styles.stateCard]} accessibilityLabel="Vaccines. Loading the schedule">
          <ActivityIndicator size="small" color={AppColors.primary} />
          <Text style={styles.detail}>Loading the vaccine schedule…</Text>
        </View>
      );
    }
    return (
      <View style={[styles.card, styles.stateCard]}>
        <Ionicons name="cloud-offline-outline" size={18} color={AppColors.onSurfaceVariant} />
        <View style={styles.textContainer}>
          <Text style={styles.vaccineName} accessibilityRole={error ? 'alert' : undefined}>
            {error ? "Couldn't load vaccines" : 'Vaccine schedule not ready yet'}
          </Text>
          <Text style={styles.detail}>
            {error
              ? 'Check your connection and try again.'
              : 'It usually appears within a few seconds of adding your child.'}
          </Text>
        </View>
        {onRetry ? (
          <TextButton label="Retry" onPress={onRetry} accessibilityLabel="Retry loading vaccines" />
        ) : null}
      </View>
    );
  }
  const dueNowUntil = toDateOnlyString(addCalendar(parseDateOnly(istTodayDateOnly()), { days: DUE_NOW_DAYS }));
  const today = istTodayDateOnly();
  const isYearly = (v: VaccinationRow) => ANNUAL_VACCINE_NAMES.has(v.vaccine_name);
  const yearlyPast = (v: VaccinationRow) => isYearly(v) && v.status !== 'done' && v.scheduled_date < today;
  const dated = vaccinations.filter((v) => !yearlyPast(v));
  const next = dated.find((v) => v.status === 'due_soon') ?? dated.find((v) => v.status === 'upcoming');
  const sameDay = next
    ? dated.filter(
        (v) => (v.status === 'due_soon' || v.status === 'upcoming') && v.scheduled_date === next.scheduled_date,
      )
    : [];
  // The yearly flu shot is never "overdue" or "to check", same as the Vaccines tab (O2).
  const overdueCount = vaccinations.filter((v) => v.status === 'overdue' && !isYearly(v)).length;
  const unknownCount = vaccinations.filter((v) => v.status === 'unknown' && !isYearly(v)).length;
  const fluReminder = vaccinations.some(yearlyPast);
  const nextDate = next ? formatDate(next.scheduled_date) : '';

  const pills: { tone: StatusTone; label: string }[] = [];
  if (overdueCount > 0) pills.push({ tone: 'danger', label: `${overdueCount} overdue` });
  if (unknownCount > 0) pills.push({ tone: 'info', label: `${unknownCount} to check with your doctor` });
  if (pills.length === 0) {
    pills.push(
      next?.status === 'due_soon'
        ? next.scheduled_date <= dueNowUntil
          ? { tone: 'warning', label: `Due now · ${nextDate}` }
          : { tone: 'warning', label: `Due soon · ${nextDate}` }
        : next
          ? { tone: 'neutral', label: `Next · ${nextDate}` }
          : { tone: 'success', label: 'All caught up' },
    );
  }

  const title = !next
    ? overdueCount + unknownCount > 0
      ? 'Nothing else coming up'
      : 'Lovely work, nothing due right now'
    : sameDay.length > 1
      ? `${sameDay.length} vaccines due ${nextDate}`
      : `${doseName(next)} due ${nextDate}`;
  const detail = sameDay.length > 1 ? sameDay.map(doseName).join(', ') : null;
  const fluText = fluReminder ? 'Yearly flu shot: ask at the next visit' : null;
  const pillText = pills.map((p) => p.label).join(', ');
  // A refresh failed but older rows are on screen: say so instead of hiding it.
  const staleText = error ? "Couldn't refresh. Showing the last loaded schedule." : null;

  return (
    <PressableScale
      onPress={onViewSchedule}
      accessibilityLabel={`Vaccines. ${pillText}. ${title}${detail ? `: ${detail}` : ''}.${fluText ? ` ${fluText}.` : ''}${staleText ? ` ${staleText}` : ''} View schedule`}
      bg={AppColors.card}
      bgPressed={AppColors.surfaceContainerLow}
      style={styles.card}
    >
      {compact ? null : (
        <View style={styles.iconWell}>
          <Ionicons name="shield-checkmark" size={18} color={AppColors.secondary} />
        </View>
      )}

      <View style={styles.textContainer}>
        <View style={styles.pillRow}>
          {pills.map((p) => (
            <StatusPill key={p.label} dot tone={p.tone} label={p.label} />
          ))}
        </View>
        {/* No line caps: at 200% text these wrap instead of cutting off doses. */}
        <Text style={styles.vaccineName}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        {fluText ? <Text style={styles.detail}>{fluText}</Text> : null}
        {staleText ? <Text style={styles.detail}>{staleText}</Text> : null}
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
  stateCard: {
    backgroundColor: AppColors.card,
    flexWrap: 'wrap',
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
    minWidth: 0,
    gap: 4,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  vaccineName: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.onSurface,
    letterSpacing: -0.1,
  },
  detail: {
    fontFamily: FontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.muted,
  },
});
