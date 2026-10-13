import { Ionicons } from '@expo/vector-icons';
import { memo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Celebrate, type CelebrateHandle } from '@/components/celebrate/Celebrate';
import { Sprout } from '@/components/mascot/Sprout';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { AnimatedProgress } from '@/components/ui/AnimatedProgress';
import { HeroCard } from '@/components/ui/HeroCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { StatusPill, type StatusTone } from '@/components/ui/StatusPill';
import { Sticker } from '@/components/ui/Sticker';
import { BRACKET_LABELS } from '@/constants/bracketConfig';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { HeaderChildAvatar } from '@/components/HeaderChildAvatar';
import { useChild } from '@/context/child';
import { useVaccinations, type VaccinationRow } from '@/hooks/useVaccinations';
import { formatDate } from '@/lib/date';
import { typography } from '@/styles/global';

export default function VaccineScreen() {
  const { bracket, child } = useChild();
  const { vaccinations, loading, markDone } = useVaccinations(child?.id ?? null);
  const celebrateRef = useRef<CelebrateHandle>(null);
  // One-shot per session (no persistence; UI-only).
  const celebratedCaughtUp = useRef(false);

  const bracketLabel = bracket ? BRACKET_LABELS[bracket] : '';
  const childName = child?.name ?? 'Your child';

  const doneCount = vaccinations.filter((v) => v.status === 'done').length;
  const total = vaccinations.length;
  const progress = total > 0 ? doneCount / total : 0;
  const progressPct = Math.round(progress * 100);

  const nextDue = vaccinations.find((v) => v.status === 'due_soon');
  const nextUpcoming = vaccinations.find((v) => v.status === 'upcoming');
  const overdueCount = vaccinations.filter((v) => v.status === 'overdue').length;
  const caughtUp = total > 0 && !nextDue && overdueCount === 0;

  // One calm stats line (absorbs the old Next dose / Status bento cards).
  const statsLine = [
    overdueCount > 0 ? `${overdueCount} overdue` : null,
    nextDue
      ? `due now: ${nextDue.vaccine_name}`
      : nextUpcoming
        ? `next: ${nextUpcoming.vaccine_name}, ${formatDate(nextUpcoming.scheduled_date)}`
        : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const statsText = statsLine
    ? statsLine.charAt(0).toUpperCase() + statsLine.slice(1)
    : total > 0
      ? 'All done for now'
      : '';

  async function handleMarkGiven(id: string) {
    // "Caught up" = no due_soon and no overdue rows remain after this mark.
    const remaining = vaccinations.filter(
      (v) => v.id !== id && (v.status === 'due_soon' || v.status === 'overdue'),
    ).length;
    try {
      await markDone(id);
      if (remaining === 0 && !celebratedCaughtUp.current) {
        celebratedCaughtUp.current = true;
        celebrateRef.current?.fire({
          big: true,
          title: 'All caught up for now',
          body: `${childName} has every due dose recorded.`,
        });
      } else {
        celebrateRef.current?.fire({
          title: 'Dose recorded',
          body: `${childName} was so brave today.`,
        });
      }
    } catch {
      // error handled in hook
    }
  }

  // Full-screen spinner only on the very first load: refetches after
  // "mark as given" keep the list (and the celebration) mounted.
  if (loading && vaccinations.length === 0) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={AppColors.secondary} />
      </View>
    );
  }

  const headerContent = (
    <>
      <Text style={typography.heading}>Vaccines</Text>
      <View style={styles.headerRight}>
        <HeaderChildAvatar />
      </View>
    </>
  );

  return (
    <View style={styles.screen}>
      <TabScreenLayout headerContent={headerContent}>
        {/* Light-green glass hero */}
        <HeroCard style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleCol}>
              {bracketLabel ? <Text style={typography.eyebrow}>{bracketLabel}</Text> : null}
              <Text style={styles.heroTitle}>Vaccination progress</Text>
            </View>
            {caughtUp ? <Sprout mood="cheer" size={56} /> : null}
          </View>

          <View style={styles.heroMetricRow}>
            <Text style={typography.number}>
              {doneCount}
              <Text style={typography.unit}> of {total} given</Text>
            </Text>
            {caughtUp ? (
              <View style={styles.caughtUpSticker}>
                <Sticker icon="star" size={24} />
                <Text style={styles.caughtUpText}>Caught up</Text>
              </View>
            ) : null}
          </View>

          <AnimatedProgress
            value={progress}
            trackColor={AppColors.heroTrack}
            fillColor={AppColors.primary}
            thumb
            thumbRing={AppColors.primary}
            accessibilityLabel={`${progressPct}% of vaccines given`}
          />

          {statsText ? <Text style={typography.bodySM} numberOfLines={2}>{statsText}</Text> : null}

          {/* Upload certificate: a slim ghost row inside the hero */}
          <PressableScale
            style={styles.uploadRow}
            scaleTo={0.99}
            accessibilityLabel="Upload vaccination certificate"
          >
            <Ionicons name="cloud-upload-outline" size={Size.iconRow} color={AppColors.secondary} />
            <Text style={styles.uploadTitle}>Upload certificate</Text>
            <Ionicons name="chevron-forward" size={14} color={AppColors.secondary} />
          </PressableScale>
        </HeroCard>

        {/* Vaccination list */}
        <View style={styles.listSection}>
          <Text style={typography.headingSM}>Schedule</Text>
          <View style={styles.listGroup}>
            {vaccinations.map((vaccine, index) => (
              <VaccineListItem
                key={vaccine.id}
                vaccine={vaccine}
                onMarkGiven={handleMarkGiven}
                isFirst={index === 0}
              />
            ))}
          </View>
          <Text style={[typography.meta, styles.note]}>
            Minor fever after DTP/Pentavalent is common. Apply a cold compress on the injection site if swelling occurs. Contact your pediatrician if fever exceeds 101°F.
          </Text>
        </View>
      </TabScreenLayout>

      {/* Mounted outside the scroll + loading branch so it survives refetches. */}
      <Celebrate ref={celebrateRef} bottomOffset={84} />
    </View>
  );
}

const STATUS_UI: Record<VaccinationRow['status'], { tone: StatusTone; label: string }> = {
  done: { tone: 'success', label: 'Given' },
  due_soon: { tone: 'warning', label: 'Due now' },
  overdue: { tone: 'danger', label: 'Overdue' },
  upcoming: { tone: 'neutral', label: 'Upcoming' },
};

const VaccineListItem = memo(function VaccineListItem({
  vaccine,
  onMarkGiven,
  isFirst,
}: {
  vaccine: VaccinationRow;
  onMarkGiven: (id: string) => void;
  isFirst: boolean;
}) {
  const { status, vaccine_name: name, dose_label } = vaccine;
  // "13 Oct" this year, "13 Oct 2014" otherwise, so an old due date never
  // reads like today.
  const dateStr = formatDate(vaccine.scheduled_date);
  const displayName = dose_label ? `${name} (${dose_label})` : name;
  const ui = STATUS_UI[status];
  // Doses ticked during onboarding are saved with no date: show "Given"
  // without inventing one.
  const givenStr = formatDate(vaccine.administered_date);
  const metaStr =
    status === 'done'
      ? givenStr
        ? `Given ${givenStr}`
        : 'Given, date not recorded'
      : dateStr;
  const isDue = status === 'due_soon';

  return (
    <Pressable
      onPress={isDue ? () => onMarkGiven(vaccine.id) : undefined}
      disabled={!isDue}
      accessibilityRole={isDue ? 'button' : undefined}
      accessibilityLabel={isDue ? `${displayName}, due now. Mark as given` : undefined}
      style={({ pressed }) => [styles.listItem, !isFirst && styles.listItemDivider, pressed && styles.listItemPressed]}
    >
      <View style={styles.listItemContent}>
        <Text style={[styles.listItemTitle, status === 'done' && styles.listItemTitleDone]} numberOfLines={2}>
          {displayName}
        </Text>
        <Text style={typography.meta}>{metaStr}</Text>
      </View>
      {isDue ? (
        <View style={styles.markPill}>
          <Text style={styles.markPillText}>Mark given</Text>
        </View>
      ) : (
        <View style={styles.statusWrap}>
          <StatusPill dot tone={ui.tone} label={ui.label} />
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: AppColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  hero: {
    gap: 12,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTitleCol: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    fontFamily: FontFamily.bold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: AppColors.forestDeep,
  },
  heroMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  caughtUpSticker: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  caughtUpText: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: AppColors.secondary,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    minHeight: 44,
  },
  uploadTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    color: AppColors.secondary,
  },

  listSection: { gap: 8 },
  listGroup: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: AppColors.border,
    borderCurve: 'continuous',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  listItemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  statusWrap: {
    alignSelf: 'center',
  },
  listItemPressed: {
    backgroundColor: AppColors.surfaceContainerLow,
  },
  listItemContent: {
    flex: 1,
    gap: 2,
  },
  listItemTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.onSurface,
  },
  listItemTitleDone: {
    color: AppColors.onSurfaceVariant,
  },
  markPill: {
    height: Size.buttonSmall,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: AppColors.borderStrong,
  },
  markPillText: {
    fontFamily: FontFamily.semibold,
    fontSize: 13,
    color: AppColors.primary,
  },
  note: {
    paddingHorizontal: 4,
    marginTop: 4,
  },
});
