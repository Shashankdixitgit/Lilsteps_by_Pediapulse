import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GrowthChart, valueForTab } from '@/components/growth/GrowthChart';
import { LogMeasurementSheet } from '@/components/growth/LogMeasurementSheet';
import { MeasurementRow } from '@/components/growth/MeasurementRow';
import { ChartTab, TimeFilter, computePercentile, monthsBetween, ordinal } from '@/components/growth/whoData';
import { EmptyState } from '@/components/EmptyState';
import { HeaderChildAvatar } from '@/components/HeaderChildAvatar';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useGrowth, type GrowthRow } from '@/hooks/useGrowth';
import { typography } from '@/styles/global';

function bmiOf(m: GrowthRow): number | null {
  if (!m.weight || !m.height) return null;
  const heightM = m.height / 100;
  if (heightM <= 0) return null;
  return m.weight / (heightM * heightM);
}

export default function GrowthScreen() {
  const [chartTab, setChartTab] = useState<ChartTab>('weight');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('All');
  const [showSheet, setShowSheet] = useState(false);
  const [chartWidth, setChartWidth] = useState(0);

  const { child, bracket } = useChild();
  const { measurements: actualMeasurements, addMeasurement } = useGrowth(child?.id ?? null);

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
      measured_at: stamp.slice(0, 10),
      created_at: stamp,
    };
    return [synthetic];
  }, [actualMeasurements, child]);

  const isNewborn = ['NEWBORN', 'EARLY_INFANT'].includes(bracket ?? '');
  const showBMI = !['NEWBORN', 'EARLY_INFANT', 'INFANT', 'TODDLER_EARLY'].includes(bracket ?? '');

  useEffect(() => {
    if (chartTab === 'bmi' && !showBMI) setChartTab('weight');
  }, [chartTab, showBMI]);

  const latest = measurements[0];
  const latestBmi = latest ? bmiOf(latest) : null;
  const childName = child?.name ?? 'Child';
  const dob = child ? new Date(child.dob) : new Date();
  const latestDateStr = latest
    ? new Date(latest.measured_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  const fmt = (v: number | null | undefined) => (v == null ? '—' : Number(v).toFixed(1));

  // BMI-for-age band from the WHO reference, replacing the old fixed "Healthy range" text.
  const bmiStatus = useMemo(() => {
    if (latestBmi == null || !child) return null;
    const p = computePercentile(latestBmi, monthsBetween(new Date(child.dob), new Date(latest!.measured_at)), 'bmi');
    if (p < 5) return { text: 'below the typical range', color: AppColors.warning };
    if (p < 85) return { text: 'in the typical range', color: AppColors.successGreen };
    if (p < 95) return { text: 'a little above the typical range', color: AppColors.warning };
    return { text: 'above the typical range', color: AppColors.danger };
  }, [latestBmi, child, latest]);

  const percentileText = useMemo(() => {
    if (!latest) return `Log a measurement to see ${childName}'s percentile`;
    const latestVal = valueForTab(latest, chartTab);
    if (latestVal == null) return `Log ${chartTab === 'bmi' ? 'weight and height' : chartTab} to see the percentile`;
    const ageAtMeas = monthsBetween(new Date(child!.dob), new Date(latest.measured_at));
    const p = Math.round(computePercentile(latestVal, ageAtMeas, chartTab));
    const label = chartTab === 'bmi' ? 'BMI' : chartTab;
    return `${childName} is at the ${ordinal(p)} percentile for ${label}`;
  }, [latest, chartTab, child, childName]);

  async function handleSaveMeasurement(data: { weight?: number; height?: number; note?: string }) {
    try {
      await addMeasurement(data);
    } catch (e) {
      // The hook just rethrows — surface it so the user knows the save failed
      // (the prior silent catch was why "I added height" appeared not to work).
      const message = e instanceof Error ? e.message : 'Unknown error';
      Alert.alert(
        "Couldn't save measurement",
        `${message}\n\nThe new measurement wasn't recorded. Please try again.`,
      );
    }
  }

  const headerContent = (
    <>
      <Text style={typography.heading}>Growth</Text>
      <View style={styles.headerRight}>
        <Pressable
          onPress={() => setShowSheet(true)}
          accessibilityRole="button"
          accessibilityLabel="Log a measurement"
          hitSlop={4}
          style={({ pressed }) => [styles.logBtn, pressed && styles.logBtnPressed]}
        >
          <Ionicons name="add" size={18} color={AppColors.secondary} />
          <Text style={styles.logLabel}>Log</Text>
        </Pressable>
        <HeaderChildAvatar />
      </View>
    </>
  );

  return (
    <>
      <TabScreenLayout headerContent={headerContent}>
        <View style={styles.metricsBlock}>
          <View style={styles.metricsRow}>
            <View style={styles.capsule}>
              <Text style={styles.capsuleLabel}>Weight</Text>
              <Text style={styles.capsuleValue} numberOfLines={1}>
                {fmt(latest?.weight ?? child?.weight)}
                <Text style={styles.capsuleUnit}> kg</Text>
              </Text>
            </View>
            <View style={styles.capsule}>
              <Text style={styles.capsuleLabel}>{isNewborn ? 'Length' : 'Height'}</Text>
              <Text style={styles.capsuleValue} numberOfLines={1}>
                {fmt(latest?.height ?? child?.height)}
                <Text style={styles.capsuleUnit}> cm</Text>
              </Text>
            </View>
            {showBMI && latestBmi != null ? (
              <View style={styles.capsule}>
                <Text style={styles.capsuleLabel}>BMI</Text>
                <View style={styles.capsuleBmiRow}>
                  {bmiStatus ? <View style={[styles.statusDot, { backgroundColor: bmiStatus.color }]} /> : null}
                  <Text style={styles.capsuleValue} numberOfLines={1}>{latestBmi.toFixed(1)}</Text>
                </View>
              </View>
            ) : null}
          </View>
          {latestDateStr ? (
            <Text style={styles.metricsNote}>
              Last measured {latestDateStr}
              {isNewborn ? ' · length measured lying down' : ''}
              {bmiStatus ? ` · BMI is ${bmiStatus.text} for ${childName}'s age` : ''}
            </Text>
          ) : null}
        </View>

        <View style={styles.chartCard}>
            <View style={[styles.filterRow, styles.chartTabs]}>
              {([
                ['weight', 'Weight'],
                ['height', 'Height'],
                ...(showBMI ? [['bmi', 'BMI']] : []),
              ] as [ChartTab, string][]).map(([value, label]) => (
                <Pressable
                  key={value}
                  onPress={() => setChartTab(value)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: chartTab === value }}
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
                />
              ) : null}
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: AppColors.primary }]} />
                  <Text style={styles.legendText}>{childName}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.legendBand} />
                  <Text style={styles.legendText}>WHO 3rd–97th</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.legendDash}>
                    <View style={styles.legendDashSeg} />
                    <View style={styles.legendDashSeg} />
                  </View>
                  <Text style={styles.legendText}>WHO average</Text>
                </View>
              </View>
            </View>

            <View style={styles.filterRow}>
              {(['3M', '6M', '1Y', 'All'] as TimeFilter[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setTimeFilter(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: timeFilter === f }}
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
              onAction={() => setShowSheet(true)}
            />
          ) : (
            <View style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyHeaderCell}>Date</Text>
                <Text style={styles.historyHeaderCell}>Weight</Text>
                <Text style={styles.historyHeaderCell}>Height</Text>
              </View>
              {measurements.map((e, i) => (
                <MeasurementRow key={e.id} entry={e} prev={measurements[i + 1]} />
              ))}
            </View>
          )}
        </View>
      </TabScreenLayout>

      <LogMeasurementSheet visible={showSheet} onClose={() => setShowSheet(false)} onSave={handleSaveMeasurement} />
    </>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  metricsRow: { flexDirection: 'row', gap: 8 },
  capsule: {
    flex: 1,
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
  capsuleValue: { fontFamily: FontFamily.bold, fontSize: 17, lineHeight: 22, color: AppColors.forestDeep, letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  capsuleUnit: { fontFamily: FontFamily.medium, fontSize: 12, color: AppColors.muted, letterSpacing: 0 },
  capsuleBmiRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  metricsNote: { ...typography.meta, paddingHorizontal: 4 },

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

  // Segmented track shared by the W/H/BMI switch and the time filter, 32 high.
  filterRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    height: 32,
    padding: 3,
    borderRadius: Radius.full,
    backgroundColor: AppColors.surfaceContainer,
  },
  filterChip: {
    minWidth: 52,
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
    ...typography.caption,
  },
});
