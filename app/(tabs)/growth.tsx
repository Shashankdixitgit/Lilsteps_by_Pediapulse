import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GrowthChart, valueForTab } from '@/components/growth/GrowthChart';
import { confirmAsync } from '@/components/growth/confirm';
import { LogMeasurementSheet, type LogMeasurementData } from '@/components/growth/LogMeasurementSheet';
import { MeasurementRow } from '@/components/growth/MeasurementRow';
import { formatHeight, formatWeight } from '@/components/growth/format';
import {
  ChartTab,
  TimeFilter,
  computePercentile,
  monthsBetween,
  ordinal,
  outsideReference,
  referenceLabel,
  type GrowthSex,
} from '@/components/growth/whoData';
import { EmptyState } from '@/components/EmptyState';
import { HeaderChildAvatar } from '@/components/HeaderChildAvatar';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { useTabBarSpace } from '@/components/home/tabBarSpace';
import { useCompactWidth } from '@/components/home/useCompactWidth';
import { TextButton } from '@/components/gradient-button';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useGrowth, type GrowthRow } from '@/hooks/useGrowth';
import { formatDate, parseDateOnly, toDateOnlyString } from '@/lib/date';
import { typography } from '@/styles/global';

function bmiOf(m: GrowthRow): number | null {
  if (!m.weight || !m.height) return null;
  const heightM = m.height / 100;
  if (heightM <= 0) return null;
  return m.weight / (heightM * heightM);
}

/**
 * How much weight may change between two entries before we ask "Is this
 * right?" (R2-15). A fixed 20% wrongly flagged babies, who double their birth
 * weight by about 5 months and triple it by a year. So the allowance grows
 * with the months between entries, faster for younger children:
 * up to ~30% a month under 12 months, ~10% a month at 1-2 years, ~5% after
 * (generous, so only typing slips are caught). A loss of more than 20% is
 * always checked, except the normal ~10% drop in a baby's first days is
 * well inside that.
 */
function allowedWeightChange(ageMonths: number, monthsElapsed: number): { up: number; down: number } {
  const perMonth = ageMonths < 12 ? 0.3 : ageMonths < 24 ? 0.1 : 0.05;
  return { up: 0.2 + perMonth * monthsElapsed, down: 0.2 };
}

export default function GrowthScreen() {
  // Room for the floating tab bar + AI button (R2-17).
  const tabBarSpace = useTabBarSpace();
  const [selectedTab, setChartTab] = useState<ChartTab>('weight');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('All');
  const compact = useCompactWidth();
  const [showSheet, setShowSheet] = useState(false);
  // The entry being edited; null = logging a new one.
  const [editing, setEditing] = useState<GrowthRow | null>(null);
  // New key per opening, so the sheet's fields start fresh each time.
  const [sheetKey, setSheetKey] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);

  const { child, bracket, refetch: refetchChildren } = useChild();
  const {
    measurements: actualMeasurements,
    addMeasurement,
    updateMeasurement,
    deleteMeasurement,
  } = useGrowth(child?.id ?? null);

  // If no measurements logged yet but the child has weight/height on record
  // (from onboarding or a direct DB edit), synthesize a single "today" entry
  // so the chart shows a real dot rather than just WHO bands.
  const measurements: GrowthRow[] = useMemo(() => {
    if (actualMeasurements.length > 0) return actualMeasurements;
    if (!child) return [];
    if (child.weight == null && child.height == null) return [];
    const stamp = child.height_updated_at ?? child.weight_updated_at ?? new Date().toISOString();
    const synthetic: GrowthRow = {
      id: `synthetic-${child.id}`,
      child_id: child.id,
      weight: child.weight,
      height: child.height,
      note: null,
      // Local calendar day of the stamp (slicing the UTC string can give yesterday in IST).
      measured_at: toDateOnlyString(new Date(stamp)),
      created_at: stamp,
    };
    return [synthetic];
  }, [actualMeasurements, child]);

  const showBMI = !['NEWBORN', 'EARLY_INFANT', 'INFANT', 'TODDLER_EARLY'].includes(bracket ?? '');

  // No BMI tab for infants: fall back to weight without an extra render.
  const chartTab: ChartTab = selectedTab === 'bmi' && !showBMI ? 'weight' : selectedTab;

  // G1: percentiles use the boys' or girls' WHO table for this child.
  const sex: GrowthSex = child?.sex === 'male' || child?.sex === 'female' ? child.sex : null;

  const latest = measurements[0];
  const latestBmi = latest ? bmiOf(latest) : null;
  const childName = child?.name ?? 'Child';
  // DOB / measured_at are 'YYYY-MM-DD': read them as local dates, never UTC.
  const dob = useMemo(() => (child ? parseDateOnly(child.dob) : new Date()), [child]);
  // Under 2 years children are measured lying down: "Length" everywhere on
  // this tab (capsule, chart switch, history, log sheet); "Height" after.
  const isUnderTwo = monthsBetween(dob, new Date()) < 24;
  const heightWord = isUnderTwo ? 'Length' : 'Height';
  const latestDateStr = latest ? formatDate(latest.measured_at) : null;

  // The header shows ONE reading (the latest by date): weight, length and the
  // date all come from that row, never mixed with an older one (R3-12). Right
  // after the parent saves an entry dated before the one shown, say why it is
  // not the one shown. It is set only by that save (never worked out from
  // created_at, which the sign-up birth-weight row and Replace both trip, R2-15).
  const [backDated, setBackDated] = useState<{ childId: string; text: string } | null>(null);
  const backDatedNote = backDated && backDated.childId === child?.id ? backDated.text : null;

  // BMI-for-age band from the WHO reference, replacing the old fixed "Healthy range" text.
  const bmiStatus = useMemo(() => {
    // Infants have no BMI card, so no BMI caption either.
    if (!showBMI || latestBmi == null || !child) return null;
    const p = computePercentile(latestBmi, monthsBetween(dob, parseDateOnly(latest!.measured_at)), 'bmi', sex);
    if (p < 5) return { text: 'below the typical range', color: AppColors.warning, outOfRange: true };
    if (p < 85) return { text: 'in the typical range', color: AppColors.successGreen, outOfRange: false };
    if (p < 95) return { text: 'a little above the typical range', color: AppColors.warning, outOfRange: true };
    return { text: 'above the typical range', color: AppColors.danger, outOfRange: true };
  }, [showBMI, latestBmi, child, latest, dob, sex]);

  const percentileText = useMemo(() => {
    if (!latest) return `Log a measurement to see ${childName}'s percentile`;
    const latestVal = valueForTab(latest, chartTab);
    const label = chartTab === 'bmi' ? 'BMI' : chartTab === 'height' ? heightWord.toLowerCase() : 'weight';
    if (latestVal == null) {
      return `Log ${chartTab === 'bmi' ? `weight and ${heightWord.toLowerCase()}` : label} to see the percentile`;
    }
    const ageAtMeas = monthsBetween(dob, parseDateOnly(latest.measured_at));
    const outside = outsideReference(latestVal, ageAtMeas, chartTab, sex);
    if (outside === 'above') return `${childName} is above the 97th percentile for ${label}`;
    if (outside === 'below') return `${childName} is below the 3rd percentile for ${label}`;
    const p = Math.round(computePercentile(latestVal, ageAtMeas, chartTab, sex));
    return `${childName} is at about the ${ordinal(p)} percentile for ${label}`;
  }, [latest, chartTab, dob, childName, heightWord, sex]);

  function openNew() {
    setEditing(null);
    setSheetKey((k) => k + 1);
    setShowSheet(true);
  }

  function openEdit(entry: GrowthRow) {
    setEditing(entry);
    setSheetKey((k) => k + 1);
    setShowSheet(true);
  }

  // Errors are thrown back to the sheet, which stays open and shows them.
  // Returning false keeps the sheet open without saving (the parent said no
  // to "Replace?" or "Is this right?").
  // After every change the child is reloaded so Home shows the latest values.
  async function handleSaveMeasurement(data: LogMeasurementData): Promise<void | false> {
    const isSynthetic = (m: GrowthRow) => m.id.startsWith('synthetic-');
    let target = editing && !isSynthetic(editing) ? editing : null;
    let toSave = data;

    // Same-day log: offer to replace that day's entry instead of piling up a
    // second one. Fields left empty keep the earlier entry's values.
    if (!editing) {
      const sameDay = actualMeasurements.find((m) => m.measured_at === data.measured_at);
      if (sameDay) {
        const ok = await confirmAsync(
          `Replace the ${formatDate(data.measured_at)} entry?`,
          `${childName} already has a measurement on this day. Replace it with this one? To keep both, cancel and change the date.`,
          { confirmLabel: 'Replace' },
        );
        if (!ok) return false;
        target = sameDay;
        toSave = {
          ...data,
          weight: data.weight ?? sameDay.weight,
          height: data.height ?? sameDay.height,
          note: data.note ?? sameDay.note,
        };
      }
    }

    // "Is this right?" when the change from the entry before is large: a
    // weight change beyond what is normal for the child's age and the time
    // between the two entries (allowedWeightChange), or a height/length that
    // went down.
    // A same-day entry being replaced counts as "before" (42 → 61 kg on one
    // day is exactly the slip to catch); the entry being edited does not.
    const others = measurements.filter((m) => m.id !== editing?.id);
    const before = (pick: (m: GrowthRow) => number | null) =>
      others.find((m) => m.measured_at <= toSave.measured_at && pick(m) != null);
    const prevW = before((m) => m.weight);
    const prevH = before((m) => m.height);
    const jumps: string[] = [];
    if (toSave.weight != null && prevW?.weight) {
      const change = (toSave.weight - prevW.weight) / prevW.weight;
      const allowed = allowedWeightChange(
        monthsBetween(dob, parseDateOnly(prevW.measured_at)),
        monthsBetween(parseDateOnly(prevW.measured_at), parseDateOnly(toSave.measured_at)),
      );
      if (change > allowed.up || -change > allowed.down) {
        jumps.push(
          `Weight ${change > 0 ? 'went up' : 'went down'} from ${Number(prevW.weight)} kg to ${toSave.weight} kg (${Math.round(Math.abs(change) * 100)}%) since ${formatDate(prevW.measured_at)}.`,
        );
      }
    }
    if (toSave.height != null && prevH?.height && toSave.height < prevH.height - 1) {
      jumps.push(
        `${heightWord} went down from ${Number(prevH.height)} cm to ${toSave.height} cm since ${formatDate(prevH.measured_at)}.`,
      );
    }
    if (jumps.length > 0) {
      const ok = await confirmAsync(
        'Is this right?',
        `${jumps.join(' ')} That's a big change. Please check the numbers before saving.`,
        { confirmLabel: 'Save anyway' },
      );
      if (!ok) return false;
    }

    if (target) {
      await updateMeasurement(target.id, toSave);
    } else {
      // Editing the sign-up values (shown before any entry exists) creates
      // the first real entry in their place.
      await addMeasurement(toSave, { replacesBaseline: !!editing });
    }

    // A new entry dated before the one in the header: tell the parent why the
    // header does not change. Set only once the save worked; cleared by any other save.
    const note =
      child && !target && latest && !latest.id.startsWith('synthetic-') && toSave.measured_at < latest.measured_at
        ? {
            childId: child.id,
            text: `Your new entry is dated ${formatDate(toSave.measured_at)}, so it shows in the history below, not here.`,
          }
        : null;

    setBackDated(note);
    await refetchChildren();
  }

  async function handleDeleteMeasurement() {
    if (!editing) return;
    await deleteMeasurement(editing.id);
    await refetchChildren();
  }

  const headerContent = (
    <>
      <Text style={[typography.heading, styles.headerTitle]}>Growth</Text>
      <View style={styles.headerRight}>
        <Pressable
          onPress={openNew}
          accessibilityRole="button"
          accessibilityLabel={`Log a measurement for ${childName}`}
          hitSlop={4}
          style={({ pressed }) => [styles.logBtn, pressed && styles.logBtnPressed]}
        >
          <Ionicons name="add" size={18} color={AppColors.secondary} />
          {/* At 200% zoom the header has no room for the word; the icon keeps its label (A3). */}
          {compact ? null : <Text style={styles.logLabel}>Log</Text>}
        </Pressable>
        <HeaderChildAvatar />
      </View>
    </>
  );

  return (
    <>
      <TabScreenLayout headerContent={headerContent} scrollContentStyle={{ paddingBottom: tabBarSpace }}>
        <View style={styles.metricsBlock}>
          <View style={styles.metricsRow}>
            <View style={styles.capsule}>
              <Text style={styles.capsuleLabel}>Weight</Text>
              <Text style={styles.capsuleValue}>
                {formatWeight(latest?.weight)}
                <Text style={styles.capsuleUnit}> kg</Text>
              </Text>
            </View>
            <View style={styles.capsule}>
              <Text style={styles.capsuleLabel}>{heightWord}</Text>
              <Text style={styles.capsuleValue}>
                {formatHeight(latest?.height)}
                <Text style={styles.capsuleUnit}> cm</Text>
              </Text>
            </View>
            {showBMI && latestBmi != null ? (
              <View style={styles.capsule}>
                <Text style={styles.capsuleLabel}>BMI</Text>
                <View style={styles.capsuleBmiRow}>
                  {bmiStatus ? <View style={[styles.statusDot, { backgroundColor: bmiStatus.color }]} /> : null}
                  <Text style={styles.capsuleValue}>{latestBmi.toFixed(1)}</Text>
                </View>
              </View>
            ) : null}
          </View>
          {latestDateStr ? (
            <Text style={styles.metricsNote}>
              Last measured {latestDateStr}
              {/* Only when this reading has a length (R3-21). */}
              {isUnderTwo && latest?.height != null && latest.height > 0 ? ' · length measured lying down' : ''}
              {showBMI && bmiStatus ? ` · BMI is ${bmiStatus.text} for ${childName}'s age` : ''}
            </Text>
          ) : null}
          {backDatedNote ? <Text style={styles.metricsNote}>{backDatedNote}</Text> : null}
          {showBMI && bmiStatus?.outOfRange ? (
            <View style={styles.doctorNote}>
              <Ionicons name="information-circle-outline" size={16} color={AppColors.secondary} />
              <View style={styles.doctorNoteText}>
                <Text style={typography.bodySM}>
                  {`One reading is not a diagnosis. If ${childName}'s BMI stays ${bmiStatus.text}, talk to your doctor.`}
                </Text>
                <TextButton label="Book a consult" onPress={() => router.push('/consult/booking')} style={styles.doctorNoteBtn} />
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.chartCard}>
            <View style={[styles.filterRow, styles.chartTabs]} accessibilityRole="tablist">
              {([
                ['weight', 'Weight'],
                ['height', heightWord],
                ...(showBMI ? [['bmi', 'BMI']] : []),
              ] as [ChartTab, string][]).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setChartTab(value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: chartTab === value }}
                  // react-native-web ignores accessibilityState.selected.
                  aria-selected={chartTab === value}
                  style={[styles.filterChip, chartTab === value && styles.filterChipActive]}
                >
                  <Text style={[styles.filterText, chartTab === value && styles.filterTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={typography.bodySM}>{percentileText}</Text>

            <View style={styles.chartContainer} onLayout={(e) => setChartWidth(Math.floor(e.nativeEvent.layout.width))}>
              {chartWidth > 0 ? (
                <GrowthChart
                  tab={chartTab}
                  measurements={measurements}
                  dob={dob}
                  timeFilter={timeFilter}
                  width={chartWidth}
                  childName={childName}
                  label={chartTab === 'height' ? heightWord.toLowerCase() : undefined}
                  sex={sex}
                />
              ) : null}
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: AppColors.primary }]} />
                  <Text style={styles.legendText}>{childName}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.legendBand} />
                  <Text style={styles.legendText}>Typical range (approx.)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.legendDash}>
                    <View style={styles.legendDashSeg} />
                    <View style={styles.legendDashSeg} />
                  </View>
                  <Text style={styles.legendText}>Average (approx.)</Text>
                </View>
              </View>
              {/* G1: say which table the percentile and shaded range use. */}
              <Text style={[styles.legendText, styles.referenceNote]}>
                {sex
                  ? `Percentile and shaded range use the ${referenceLabel(sex)}.`
                  : `Percentile and shaded range: ${referenceLabel(null)}.`}
              </Text>
            </View>

            <View style={styles.filterRow}>
              {(['3M', '6M', '1Y', 'All'] as TimeFilter[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setTimeFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: timeFilter === f }}
                  aria-pressed={timeFilter === f}
                  style={[styles.filterChip, timeFilter === f && styles.filterChipActive]}
                >
                  <Text style={[styles.filterText, timeFilter === f && styles.filterTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Measurement history</Text>
          {measurements.length === 0 ? (
            <EmptyState
              mood="happy"
              prop="resize"
              title={`Let's start ${childName}'s growth story`}
              body="Log a height or weight and we'll draw the chart for you."
              actionLabel="Log first measurement"
              onAction={openNew}
            />
          ) : (
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyHeaderCell}>Date</Text>
                <Text style={styles.historyHeaderCell}>Weight</Text>
                <Text style={styles.historyHeaderCell}>{heightWord}</Text>
                <View style={styles.historyHeaderSpacer} />
              </View>
              {measurements.map((e, i) => (
                <MeasurementRow
                  key={e.id}
                  entry={e}
                  prev={measurements[i + 1]}
                  heightLabel={heightWord}
                  onPress={() => openEdit(e)}
                />
              ))}
            </View>
          )}
        </View>
      </TabScreenLayout>

      <LogMeasurementSheet
        key={sheetKey}
        visible={showSheet}
        onClose={() => setShowSheet(false)}
        onSave={handleSaveMeasurement}
        entry={editing}
        onDelete={editing && !editing.id.startsWith('synthetic-') ? handleDeleteMeasurement : undefined}
        childName={childName}
        dob={child?.dob ?? null}
        lengthLabel={isUnderTwo}
      />
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: { flexShrink: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    paddingHorizontal: 8,
  },
  logBtnPressed: { opacity: 0.6 },
  logLabel: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.secondary },

  metricsBlock: { gap: 8 },
  // Wraps instead of truncating at large text sizes (200%).
  metricsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  capsule: {
    flexGrow: 1,
    flexBasis: 96,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: AppColors.card,
    borderRadius: Radius.full,
    gap: 2,
  },
  capsuleLabel: { ...typography.caption },
  capsuleValue: { fontFamily: FontFamily.bold, fontSize: 17, lineHeight: 22, color: AppColors.forestDeep, letterSpacing: -0.3, fontVariant: ['tabular-nums'], textAlign: 'center' },
  capsuleUnit: { fontFamily: FontFamily.medium, fontSize: 12, color: AppColors.muted, letterSpacing: 0 },
  capsuleBmiRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  metricsNote: { ...typography.meta, paddingHorizontal: 4 },
  doctorNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    backgroundColor: AppColors.card,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  doctorNoteText: { flex: 1, minWidth: 0, gap: 4 },
  doctorNoteBtn: { alignSelf: 'flex-start', marginLeft: -8 },

  chartCard: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderCurve: 'continuous',
    padding: 16,
    gap: 12,
  },
  chartTabs: { alignSelf: 'flex-start' },

  chartContainer: { alignSelf: 'stretch', gap: 8 },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  legendBand: { width: 16, height: 10, borderRadius: 3, backgroundColor: AppColors.infoSurface, borderWidth: 1, borderColor: AppColors.infoBorder },
  legendDash: { flexDirection: 'row', gap: 3 },
  legendDashSeg: { width: 6, height: 2, borderRadius: 1, backgroundColor: AppColors.info },
  legendText: { ...typography.caption, color: AppColors.onSurfaceVariant },
  referenceNote: { textAlign: 'center', marginTop: 6 },

  // Segmented track shared by the W/H/BMI switch and the time filter, 32 high.
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    minHeight: 32,
    padding: 3,
    borderRadius: Radius.full,
    backgroundColor: AppColors.surfaceContainer,
  },
  filterChip: {
    minWidth: 52,
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: Radius.full,
  },
  filterChipActive: { backgroundColor: AppColors.card },
  filterText: { fontFamily: FontFamily.medium, fontSize: 13, color: AppColors.onSurfaceVariant },
  filterTextActive: { color: AppColors.primary, fontFamily: FontFamily.semibold },

  section: { gap: 8 },
  historyCard: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingHorizontal: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  historyHeaderCell: {
    flex: 1,
    minWidth: 0,
    ...typography.caption,
  },
  historyHeaderSpacer: { width: 20 },
});
