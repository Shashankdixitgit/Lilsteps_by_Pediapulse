import { useLocalSearchParams } from 'expo-router';
import { Fragment, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderIconButton, ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, Radius } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { formatAgeLabel } from '@/lib/age';
import { notify } from '@/lib/confirm';
import { formatDate } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import type { PrescriptionRow } from '@/hooks/usePrescriptions';

/**
 * The 2020 Telemedicine Practice Guidelines want the prescriber's
 * qualifications and registration number, and the patient's age and weight,
 * on every prescription (R2-13). doctors.registration_number is added by
 * migration 0040; test profiles don't have one yet.
 */
type PrescriptionDetail = Omit<PrescriptionRow, 'doctors'> & {
  doctors?: {
    name: string;
    specialisation: string | null;
    qualifications: string | null;
    registration_number: string | null;
  } | null;
  children?: {
    name: string;
    dob: string;
    weight: number | null;
    allergies_not_known: boolean | null;
  } | null;
};

type AllergyLite = { name: string; severity: string | null };

const REGISTRATION_MISSING = 'Registration no. to be added';

function allergyLine(a: AllergyLite): string {
  const s = a.severity?.trim();
  return s && s.toLowerCase() !== 'unknown' ? `${a.name} (${s})` : a.name;
}

export default function PrescriptionDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [prescription, setPrescription] = useState<PrescriptionDetail | null>(null);
  const [allergies, setAllergies] = useState<AllergyLite[]>([]);
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('prescriptions')
        .select(
          '*, doctors(name, specialisation, qualifications, registration_number), ' +
            'children(name, dob, weight, allergies_not_known), prescription_items(*)',
        )
        .eq('id', id)
        .single<PrescriptionDetail>();

      if (err || !data) {
        setError(err?.message ?? 'not found');
        setLoading(false);
        return;
      }
      data.prescription_items?.sort((a, b) => a.position - b.position);

      // Weight on the day it was issued: the latest reading up to then, else
      // the onboarding value.
      const issuedDay = data.issued_at.slice(0, 10);
      const [{ data: allergyRows }, { data: growth }] = await Promise.all([
        supabase.from('allergies').select('name, severity').eq('child_id', data.child_id).returns<AllergyLite[]>(),
        supabase
          .from('growth_measurements')
          .select('weight')
          .eq('child_id', data.child_id)
          .not('weight', 'is', null)
          .lte('measured_at', issuedDay)
          .order('measured_at', { ascending: false })
          .limit(1)
          .returns<{ weight: number | null }[]>(),
      ]);
      setPrescription(data);
      setAllergies(allergyRows ?? []);
      setWeightKg(growth?.[0]?.weight ?? data.children?.weight ?? null);
      setLoading(false);
    })();
  }, [id]);

  // en-IN like every other date in the app ("13 Oct 2026").
  const issuedDate = prescription ? formatDate(prescription.issued_at, { year: 'always' }) : '';
  const doctor = prescription?.doctors ?? null;
  const child = prescription?.children ?? null;
  const items = prescription?.prescription_items ?? [];

  const credentials = [doctor?.specialisation, doctor?.qualifications?.trim()].filter(Boolean).join(' · ');
  const registration = doctor?.registration_number?.trim()
    ? `Reg. no. ${doctor.registration_number.trim()}`
    : REGISTRATION_MISSING;

  const ageAtIssue =
    child && prescription ? formatAgeLabel(child.dob, { now: new Date(prescription.issued_at) }) : '';
  const childFacts = [ageAtIssue, weightKg ? `${weightKg} kg` : 'Weight not recorded'].filter(Boolean).join(' · ');
  const allergyText =
    allergies.length > 0
      ? allergies.map(allergyLine).join(', ')
      : child?.allergies_not_known
        ? 'Not known yet'
        : 'None recorded';

  async function handleShare() {
    if (!prescription) return;
    const lines = [
      `Prescription${child?.name ? ` for ${child.name}` : ''}`,
      childFacts,
      `Allergies: ${allergyText}`,
      '',
      doctor?.name ?? 'Doctor',
      credentials,
      registration,
      issuedDate ? `Issued ${issuedDate}` : '',
      '',
      ...items.map((it) =>
        [it.medicine, it.dose, it.frequency, it.duration, it.notes].filter((x) => x && String(x).trim()).join(' · '),
      ),
      prescription.notes ? `\nDoctor's notes: ${prescription.notes}` : '',
    ];
    const message = lines.filter((l, i) => l !== '' || lines[i - 1] !== '').join('\n').trim();

    // Web: most desktop browsers have no share sheet, so copy instead.
    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (nav?.share) {
        try {
          await nav.share({ title: 'Prescription', text: message });
        } catch (e) {
          if ((e as { name?: string })?.name !== 'AbortError') notify('Could not share', 'Please try again.');
        }
        return;
      }
      try {
        await nav?.clipboard?.writeText(message);
        notify('Copied', 'The prescription is on your clipboard.');
      } catch {
        notify('Could not share', "This browser can't share or copy text.");
      }
      return;
    }
    try {
      await Share.share({ message });
    } catch {
      notify('Could not share', 'Please try again.');
    }
  }

  return (
    <View style={[layout.screenContainer, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Prescription"
        subtitle={child?.name ? `For ${child.name}` : undefined}
        right={
          prescription ? (
            <HeaderIconButton icon="share-outline" onPress={handleShare} accessibilityLabel="Share prescription" />
          ) : undefined
        }
      />

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
            <Text style={typography.headingSM}>{doctor?.name ?? 'Doctor'}</Text>
            {!!credentials && <Text style={typography.meta}>{credentials}</Text>}
            <Text style={typography.meta}>{registration}</Text>
            {!!issuedDate && <Text style={typography.meta}>Issued {issuedDate}</Text>}
          </View>

          <View style={[styles.card, styles.patientCard]}>
            <View style={styles.factRow}>
              <Text style={[typography.sectionLabel, styles.factLabel]}>Patient</Text>
              <Text style={[typography.bodySM, styles.factValue]}>
                {[child?.name, childFacts].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.factRow}>
              <Text style={[typography.sectionLabel, styles.factLabel]}>Allergies</Text>
              <Text style={[typography.bodySM, styles.factValue]}>{allergyText}</Text>
            </View>
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

  patientCard: { paddingVertical: 4 },
  // Label above value, not side by side, so large text never squeezes either.
  factRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  factLabel: { flexShrink: 1 },
  factValue: { flexShrink: 1, color: AppColors.onSurface },

  notesCard: { padding: 16 },
  notesText: { color: AppColors.onSurface },
});
