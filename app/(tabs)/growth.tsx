import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, Card, Tabs } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GrowthChart, valueForTab } from '@/components/growth/GrowthChart';
import { LogMeasurementSheet } from '@/components/growth/LogMeasurementSheet';
import { MeasurementRow } from '@/components/growth/MeasurementRow';
import { ChartTab, TimeFilter, computePercentile, monthsBetween, ordinal } from '@/components/growth/whoData';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { AppColors } from '@/constants/theme';
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
    ? new Date(latest.measured_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—';

  const percentileText = useMemo(() => {
    if (!latest) return `Log a measurement to see ${childName}'s percentile`;
    const latestVal = valueForTab(latest, chartTab);
    if (latestVal == null) return `Log ${chartTab} to see percentile`;
    const ageAtMeas = monthsBetween(new Date(child!.dob), new Date(latest.measured_at));
    const p = Math.round(computePercentile(latestVal, ageAtMeas, chartTab));
    return `${childName} is at the ${ordinal(p)} percentile for ${chartTab}`;
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
      <Text style={styles.headerTitle}>Growth</Text>
      <Button variant="ghost" size="sm" onPress={() => setShowSheet(true)}>
        <Ionicons name="add" size={18} color={AppColors.primary} />
        <Button.Label style={{ color: AppColors.primary, fontFamily: 'PlusJakartaSans_700Bold' }}>Log</Button.Label>
      </Button>
    </>
  );

  return (
    <>
      <TabScreenLayout headerContent={headerContent}>
        <View style={styles.metricsRow}>
          <Card style={styles.metricCard}>
            <Card.Body style={styles.metricCardBody}>
              <Text style={styles.metricLabel}>Weight</Text>
              <View style={styles.metricValueRow}>
                <Text style={styles.metricValue}>{latest?.weight ?? child?.weight ?? '—'}</Text>
                <Text style={styles.metricUnit}>kg</Text>
              </View>
              <Text style={styles.metricDate}>As of {latestDateStr}</Text>
            </Card.Body>
          </Card>
          <Card style={styles.metricCard}>
            <Card.Body style={styles.metricCardBody}>
              <Text style={styles.metricLabel}>{isNewborn ? 'Length' : 'Height'}</Text>
              <View style={styles.metricValueRow}>
                <Text style={styles.metricValue}>{latest?.height ?? child?.height ?? '—'}</Text>
                <Text style={styles.metricUnit}>cm</Text>
              </View>
              <Text style={styles.metricDate}>As of {latestDateStr}</Text>
              {isNewborn && <Text style={styles.newbornNote}>Measured lying down</Text>}
            </Card.Body>
          </Card>
          {showBMI && latestBmi != null && (
            <Card style={[styles.metricCard, { flex: 0.7 }]}>
              <Card.Body style={styles.metricCardBody}>
                <Text style={styles.metricLabel}>BMI</Text>
                <Text style={[styles.metricValue, { fontSize: 26 }]}>{latestBmi.toFixed(1)}</Text>
                <Text style={styles.metricDate}>Healthy range</Text>
              </Card.Body>
            </Card>
          )}
        </View>

        <Card style={styles.chartCard}>
          <Card.Body style={styles.chartCardBody}>
            <Tabs value={chartTab} onValueChange={(v) => setChartTab(v as ChartTab)} style={styles.tabs}>
              <Tabs.List style={styles.tabsList}>
                <Tabs.Indicator style={styles.tabIndicator} />
                <Tabs.Trigger value="weight" style={styles.tabTrigger}>
                  <Tabs.Label style={[styles.tabLabel, chartTab === 'weight' && styles.tabLabelActive]}>Weight</Tabs.Label>
                </Tabs.Trigger>
                <Tabs.Trigger value="height" style={styles.tabTrigger}>
                  <Tabs.Label style={[styles.tabLabel, chartTab === 'height' && styles.tabLabelActive]}>Height</Tabs.Label>
                </Tabs.Trigger>
                {showBMI && (
                  <Tabs.Trigger value="bmi" style={styles.tabTrigger}>
                    <Tabs.Label style={[styles.tabLabel, chartTab === 'bmi' && styles.tabLabelActive]}>BMI</Tabs.Label>
                  </Tabs.Trigger>
                )}
              </Tabs.List>
            </Tabs>

            <View style={styles.percentileBadge}>
              <Ionicons name="information-circle-outline" size={13} color={AppColors.primary} />
              <Text style={styles.percentileText}>{percentileText}</Text>
            </View>

            <View style={styles.chartContainer}>
              <GrowthChart tab={chartTab} measurements={measurements} dob={dob} timeFilter={timeFilter} />
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: AppColors.primary }]} />
                  <Text style={styles.legendText}>{childName}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: `${AppColors.primary}30` }]} />
                  <Text style={styles.legendText}>WHO bands</Text>
                </View>
              </View>
            </View>

            <View style={styles.filterRow}>
              {(['3M', '6M', '1Y', 'All'] as TimeFilter[]).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setTimeFilter(f)}
                  style={[styles.filterChip, timeFilter === f && styles.filterChipActive]}
                >
                  <Text style={[styles.filterText, timeFilter === f && styles.filterTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>
          </Card.Body>
        </Card>

        <View>
          <Text style={[typography.headingMD, { marginBottom: 12 }]}>Measurement History</Text>
          {measurements.length === 0 ? (
            <Text style={styles.emptyText}>No measurements logged yet</Text>
          ) : (
            <>
              <View style={styles.historyHeader}>
                <Text style={styles.historyHeaderCell}>Date</Text>
                <Text style={styles.historyHeaderCell}>Weight</Text>
                <Text style={styles.historyHeaderCell}>Height</Text>
              </View>
              {measurements.map((e, i) => (
                <MeasurementRow key={e.id} entry={e} prev={measurements[i + 1]} />
              ))}
            </>
          )}
        </View>

        <Pressable style={styles.logBtn} onPress={() => setShowSheet(true)}>
          <LinearGradient
            colors={[AppColors.primary, AppColors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.logBtnGradient}
          >
            <Ionicons name="add-circle-outline" size={18} color={AppColors.onPrimary} />
            <Text style={styles.logBtnText}>Log New Measurement</Text>
          </LinearGradient>
        </Pressable>
      </TabScreenLayout>

      <LogMeasurementSheet visible={showSheet} onClose={() => setShowSheet(false)} onSave={handleSaveMeasurement} />
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: AppColors.onSurface, letterSpacing: -0.3 },

  emptyText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    color: AppColors.onSurfaceVariant,
    textAlign: 'center',
    paddingVertical: 24,
    lineHeight: 20,
  },

  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${AppColors.outlineVariant}15`,
  },
  metricCardBody: { padding: 12, gap: 2 },
  metricLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: AppColors.onSurfaceVariant, letterSpacing: 0.2 },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  metricValue: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 32, color: AppColors.onSurface, letterSpacing: -1.5 },
  metricUnit: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: AppColors.onSurfaceVariant },
  metricDate: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, color: AppColors.outlineVariant, marginTop: 2 },
  newbornNote: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 10, color: AppColors.primary, marginTop: 4 },

  chartCard: {
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${AppColors.outlineVariant}15`,
  },
  chartCardBody: { padding: 14, gap: 12 },
  tabs: { alignSelf: 'flex-start' },
  tabsList: { backgroundColor: AppColors.surfaceContainerLow, borderRadius: 10, padding: 3 },
  tabIndicator: { backgroundColor: AppColors.surfaceContainerLowest, borderRadius: 8 },
  tabTrigger: { paddingHorizontal: 16, paddingVertical: 7 },
  tabLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: AppColors.onSurfaceVariant },
  tabLabelActive: { color: AppColors.primary, fontFamily: 'PlusJakartaSans_700Bold' },

  percentileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: `${AppColors.primary}0c`,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  percentileText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: AppColors.primary, lineHeight: 16 },

  chartContainer: { alignItems: 'center', gap: 8 },
  chartLegend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11, color: AppColors.onSurfaceVariant },

  filterRow: { flexDirection: 'row', gap: 6 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: AppColors.surfaceContainerLow },
  filterChipActive: { backgroundColor: `${AppColors.primary}12` },
  filterText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, color: AppColors.onSurfaceVariant },
  filterTextActive: { color: AppColors.primary },

  historyHeader: {
    flexDirection: 'row',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: `${AppColors.outlineVariant}25`,
    marginBottom: 4,
  },
  historyHeaderCell: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    color: AppColors.outlineVariant,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  logBtn: { borderRadius: 999, overflow: 'hidden' },
  logBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  logBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: AppColors.onPrimary },
});
