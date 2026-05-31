import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '@/components/gradient-background';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { supabase } from '@/lib/supabase';
import type { PrescriptionRow } from '@/hooks/usePrescriptions';

export default function PrescriptionDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [prescription, setPrescription] = useState<PrescriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('prescriptions')
        .select('*, doctors(name, specialisation), prescription_items(*)')
        .eq('id', id)
        .single<PrescriptionRow>();

      if (err) setError(err.message);
      else {
        if (data?.prescription_items) {
          data.prescription_items.sort((a, b) => a.position - b.position);
        }
        setPrescription(data);
      }
      setLoading(false);
    })();
  }, [id]);

  const issuedDate = prescription
    ? new Date(prescription.issued_at).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';

  return (
    <View style={layout.screenContainer}>
      <GradientBackground />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={AppColors.onSurface} />
        </Pressable>
        <Text style={[typography.headingMD, styles.headerTitle]}>Prescription</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={AppColors.primary} />
        </View>
      ) : error || !prescription ? (
        <View style={styles.center}>
          <Text style={typography.bodyMD}>{error ?? 'Prescription not found'}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={typography.headingMD}>{prescription.doctors?.name ?? 'Doctor'}</Text>
            <Text style={[typography.bodySM, styles.muted]}>
              {prescription.doctors?.specialisation ?? ''}
            </Text>
            <Text style={[typography.bodySM, styles.muted, { marginTop: 8 }]}>
              Issued on {issuedDate}
            </Text>
          </View>

          {prescription.prescription_items && prescription.prescription_items.length > 0 && (
            <View style={styles.itemsBlock}>
              <Text style={[typography.labelSM, styles.sectionLabel]}>MEDICINES</Text>
              {prescription.prescription_items.map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <Text style={typography.headingMD}>{item.medicine}</Text>
                  <Text style={[typography.bodySM, styles.itemMeta]}>
                    {item.dose} · {item.frequency}
                    {item.duration ? ` · ${item.duration}` : ''}
                  </Text>
                  {item.notes && (
                    <Text style={[typography.bodySM, styles.itemNotes]}>{item.notes}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {prescription.notes && (
            <View style={styles.notesBlock}>
              <Text style={[typography.labelSM, styles.sectionLabel]}>DOCTOR&apos;S NOTES</Text>
              <Text style={[typography.bodyMD, styles.notesText]}>{prescription.notes}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${AppColors.surfaceContainerLowest}B3`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1 },

  scroll: { paddingHorizontal: 20, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  card: {
    backgroundColor: `${AppColors.surfaceContainerLowest}CC`,
    borderRadius: 24,
    padding: 24,
  },
  muted: { color: AppColors.onSurfaceVariant },

  itemsBlock: { gap: 12 },
  sectionLabel: {
    color: AppColors.onSurfaceVariant,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  itemCard: {
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 18,
    gap: 4,
  },
  itemMeta: { color: AppColors.onSurfaceVariant },
  itemNotes: { marginTop: 6, color: AppColors.onSurface },

  notesBlock: { gap: 10 },
  notesText: {
    backgroundColor: `${AppColors.surfaceContainer}AA`,
    borderRadius: 18,
    padding: 16,
    color: AppColors.onSurface,
    lineHeight: 22,
  },
});
