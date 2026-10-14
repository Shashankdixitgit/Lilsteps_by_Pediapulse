/**
 * Pre-visit summary for an upcoming consult: the AI check-in summary the
 * doctor reads (checkin_sessions.ai_summary), opened from the upcoming
 * consult card. `id` is the checkin_sessions id (appointments.ai_summary_id).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SummaryCard } from '@/components/checkin/SummaryCard';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useCheckinSession } from '@/hooks/useCheckin';
import { typography } from '@/styles/global';

export default function PreVisitSummaryScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { children } = useChild();
  const { summary, childId, loading, error, retry } = useCheckinSession(id ?? null);
  const sessionChild = children.find((c) => c.id === childId) ?? null;
  const childName = sessionChild?.name ?? 'Your child';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Pre-visit summary" subtitle={childId ? `For ${childName}` : undefined} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={AppColors.primary} />
        </View>
      ) : error || !summary ? (
        <View style={styles.centered}>
          <Text style={[typography.body, styles.center]} accessibilityRole="alert">
            {error ?? "We couldn't load the summary."}
          </Text>
          <GradientButton label="Try again" variant="outline" onPress={retry} />
          <TextButton label="Go back" onPress={() => router.back()} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={typography.bodySM}>
            This is what your doctor sees before the consult. You can add anything new in the chat.
          </Text>
          {/* Opened from a booked consult: no "Book the earliest slot below" (R3-21). */}
          <SummaryCard summary={summary} childName={childName} sex={sessionChild?.sex} showUrgency booked />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  center: { textAlign: 'center' },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
});
