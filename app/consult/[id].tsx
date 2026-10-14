import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SummaryCard } from '@/components/checkin/SummaryCard';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import type { ConsultationRow } from '@/hooks/useConsultations';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

export default function ConsultDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { children } = useChild();
  // Read by id, not from the active child's list: the Updates screen links
  // here for any child (R2-12). RLS returns only the parent's own children.
  const [consult, setConsult] = useState<ConsultationRow | null>(null);
  const [loading, setLoading] = useState(!!id);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('consultations')
        .select('id, appointment_id, child_id, doctor_name, doctor_specialisation, chief_complaint, outcome, prescription, ai_summary, created_at')
        .eq('id', id)
        .maybeSingle();
      if (!cancelled) {
        setConsult((data as ConsultationRow | null) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);
  const child = children.find((c) => c.id === consult?.child_id) ?? null;

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={AppColors.primary} />
      </View>
    );
  }

  if (!consult) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Visit summary" />
        <View style={styles.centered}>
          <Text style={[typography.body, styles.centerText]}>Consultation not found.</Text>
          <TextButton label="Go back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const { ai_summary: aiSummary, prescription } = consult;
  const date = new Date(consult.created_at).toLocaleDateString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const meta = [date, consult.doctor_name].filter(Boolean).join(' · ');

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Visit summary" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={typography.meta}>{meta}</Text>

        {/* R3-21: the doctor's own notes come first; the AI check-in that led
            to the visit follows as background. */}
        <View style={styles.section}>
          <Text style={typography.headingSM}>Doctor&apos;s notes</Text>
          <View style={styles.card}>
            <Text style={consult.outcome ? styles.cardText : typography.meta}>
              {consult.outcome ?? 'No notes recorded'}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Prescription</Text>
          {prescription ? (
            <View style={[styles.card, styles.rxCard]}>
              <Text style={styles.rxLabel}>Rx</Text>
              <Text style={[styles.cardText, styles.flex]}>{prescription}</Text>
            </View>
          ) : (
            <Text style={typography.meta}>No prescription issued</Text>
          )}
        </View>

        {!!aiSummary && (
          <View style={styles.section}>
            <Text style={typography.headingSM}>Your check-in before the visit</Text>
            <SummaryCard summary={aiSummary} childName={child?.name ?? 'Your child'} sex={child?.sex} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <GradientButton label="Book follow-up" onPress={() => router.push('/consult/booking')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  centerText: { textAlign: 'center' },
  flex: { flex: 1 },

  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },

  section: { gap: 8 },
  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: 16,
  },
  cardText: { fontFamily: FontFamily.regular, fontSize: 15, lineHeight: 22, color: AppColors.onSurface },
  rxCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 12 },
  rxLabel: { fontFamily: FontFamily.bold, fontSize: 15, lineHeight: 22, color: AppColors.secondary },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: AppColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
});
