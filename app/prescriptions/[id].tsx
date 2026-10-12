import { useLocalSearchParams } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, Radius } from '@/constants/theme';
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

  const doctorMeta = [prescription?.doctors?.specialisation, issuedDate ? `Issued ${issuedDate}` : '']
    .filter(Boolean)
    .join(' · ');
  const items = prescription?.prescription_items ?? [];

  return (
    <View style={[layout.screenContainer, { paddingTop: insets.top }]}>
      <ScreenHeader title="Prescription" />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={AppColors.primary} />
        </View>
      ) : error || !prescription ? (
        <View style={styles.center}>
          {/* The raw backend error is kept in state but not shown to parents. */}
          <Text style={[typography.body, styles.centerText]}>Prescription not found</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.doctorBlock}>
            <Text style={typography.headingSM}>{prescription.doctors?.name ?? 'Doctor'}</Text>
            {!!doctorMeta && <Text style={typography.meta}>{doctorMeta}</Text>}
          </View>

          {items.length > 0 && (
            <View style={layout.section}>
              <Text style={typography.headingSM}>Medicines</Text>
              <View style={styles.card}>
                {items.map((item, index) => (
                  <Fragment key={item.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.item}>
                      <Text style={typography.title}>{item.medicine}</Text>
                      <Text style={typography.bodySM}>
                        {item.dose} · {item.frequency}
                        {item.duration ? ` · ${item.duration}` : ''}
                      </Text>
                      {!!item.notes && <Text style={typography.meta}>{item.notes}</Text>}
                    </View>
                  </Fragment>
                ))}
              </View>
            </View>
          )}

          {!!prescription.notes && (
            <View style={layout.section}>
              <Text style={typography.headingSM}>Doctor&apos;s notes</Text>
              <View style={[styles.card, styles.notesCard]}>
                <Text style={[typography.body, styles.notesText]}>{prescription.notes}</Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  centerText: { textAlign: 'center' },

  doctorBlock: { gap: 4 },

  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  item: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: AppColors.border, marginLeft: 16 },

  notesCard: { padding: 16 },
  notesText: { color: AppColors.onSurface },
});
