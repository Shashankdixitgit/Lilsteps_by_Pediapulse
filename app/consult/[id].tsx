import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SummaryCard } from '@/components/checkin/SummaryCard';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import type { ConsultationRow } from '@/hooks/useConsultations';
import { formatDate } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';
import { goBack } from '@/lib/navigation';

type LinkedRx = {
  id: string;
  issued_at: string;
  diagnosis: string | null;
  prescription_items: { medicine: string }[] | null;
};

/** "Viral fever · PARACETAMOL, SALINE" — what the prescription is for. */
function rxLine(rx: LinkedRx): string {
  const meds = (rx.prescription_items ?? []).map((i) => i.medicine).filter(Boolean).join(', ');
  return [rx.diagnosis?.trim(), meds].filter(Boolean).join(' · ') || 'Prescription';
}

export default function ConsultDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { children } = useChild();
  // Read by id, not from the active child's list: the Updates screen links
  // here for any child (R2-12). RLS returns only the parent's own children.
  const [consult, setConsult] = useState<ConsultationRow | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [linkedRx, setLinkedRx] = useState<LinkedRx[]>([]);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('consultations')
        .select('id, appointment_id, child_id, doctor_name, doctor_specialisation, chief_complaint, outcome, prescription, ai_summary, created_at')
        .eq('id', id)
        .maybeSingle();
      const row = (data as ConsultationRow | null) ?? null;
      // Prescriptions issued from the dashboard for this visit (they live in
      // their own table): linked here so the summary never says "No
      // prescription issued" next to one in Records (review should-fix 13).
      let rx: LinkedRx[] = [];
      if (row?.appointment_id) {
        const { data: rows } = await supabase
          .from('prescriptions')
          .select('id, issued_at, diagnosis, prescription_items(medicine)')
          .eq('appointment_id', row.appointment_id)
          .order('issued_at', { ascending: true });
        rx = (rows as LinkedRx[] | null) ?? [];
      }
      if (!cancelled) {
        setConsult(row);
        setLinkedRx(rx);
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
          <TextButton label="Go back" onPress={goBack} />
        </View>
      </View>
    );
  }

  const { ai_summary: aiSummary, prescription } = consult;
  const date = formatDate(consult.created_at, { year: 'always' });
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
          {linkedRx.map((rx) => (
            <PressableScale
              key={rx.id}
              onPress={() => router.push({ pathname: '/prescriptions/[id]', params: { id: rx.id } })}
              accessibilityRole="button"
              accessibilityLabel={`Open prescription${rx.diagnosis ? ` for ${rx.diagnosis}` : ''}`}
              style={[styles.card, styles.rxCard]}
            >
              <Text style={styles.rxLabel}>Rx</Text>
              <View style={styles.flex}>
                <Text style={styles.cardText}>{rxLine(rx)}</Text>
                <Text style={typography.meta}>View prescription</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={AppColors.outline} />
            </PressableScale>
          ))}
          {prescription ? (
            <View style={[styles.card, styles.rxCard]}>
              <Text style={styles.rxLabel}>Rx</Text>
              <Text style={[styles.cardText, styles.flex]}>{prescription}</Text>
            </View>
          ) : linkedRx.length === 0 ? (
            <Text style={typography.meta}>No prescription issued</Text>
          ) : null}
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
