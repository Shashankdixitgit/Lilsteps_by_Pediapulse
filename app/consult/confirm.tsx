/**
 * Booking Confirmation — Step 3 (final)
 *
 * Shows the summary, books via useAppointments.bookAppointment, then renders
 * a success state in-place. Payment step is intentionally skipped — the
 * proposal MVP does not include payment.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors, FontFamily, Radius, Size } from '@/constants/theme';
import { typography } from '@/styles/global';
import { useChild } from '@/context/child';
import { supabase } from '@/lib/supabase';
import { useAppointments } from '@/hooks/useAppointments';

interface DoctorInfo {
  name: string;
  specialisation: string;
  hospital: string;
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function ConfirmScreen() {
  const insets = useSafeAreaInsets();
  const { child } = useChild();
  const { doctorId, dateIso, dateLabel, time, issue } = useLocalSearchParams<{
    doctorId: string;
    dateIso: string;
    dateLabel: string;
    time: string;
    issue: string;
  }>();
  const { bookAppointment } = useAppointments(child?.id ?? null);

  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (!doctorId) return;
    (async () => {
      const { data } = await supabase
        .from('doctors')
        .select('name, specialisation, hospital')
        .eq('id', doctorId)
        .maybeSingle<DoctorInfo>();
      if (data) setDoctor(data);
    })();
  }, [doctorId]);

  const childName = child?.name ?? 'Your child';
  const issueText = issue ? decodeURIComponent(issue) : '';

  async function confirmBooking() {
    if (!child || !doctorId || !dateIso || !time) return;
    setBooking(true);
    try {
      await bookAppointment({
        child_id: child.id,
        doctor_id: doctorId,
        date: dateIso,
        time,
      });
      setConfirmed(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Booking failed';
      Alert.alert("Couldn't book", `${msg}\n\nPlease pick another slot.`);
    } finally {
      setBooking(false);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (confirmed) {
    const when = [dateLabel, time ? formatTime(time) : null].filter(Boolean).join(' at ');
    return (
      <View style={[styles.screen, styles.successScreen, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.successBody}>
          <Sprout mood="cheer" size={64} entrance />
          <Text style={[typography.heading, styles.centerText]}>You&apos;re booked</Text>
          <Text style={[typography.body, styles.centerText]}>
            {childName} will see {doctor?.name ?? 'the doctor'}
            {when ? ` on ${when}` : ''}.
          </Text>
        </View>
        <GradientButton label="Back to home" onPress={() => router.replace('/(tabs)')} />
      </View>
    );
  }

  // ── Review state ───────────────────────────────────────────────────────────
  const initial = doctor?.name.split(' ').slice(-1)[0]?.charAt(0) ?? 'D';
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Confirm booking" backDisabled={booking} />

      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, s <= 3 && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={typography.heading}>Review and confirm</Text>

        <View style={styles.card}>
          <View style={styles.docRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={styles.docText}>
              <Text style={styles.docName} numberOfLines={1}>
                {doctor?.name ?? 'Doctor'}
              </Text>
              {doctor?.specialisation ? (
                <Text style={typography.meta} numberOfLines={1}>
                  {doctor.specialisation}
                </Text>
              ) : null}
              {doctor?.hospital ? (
                <Text style={typography.caption} numberOfLines={1}>
                  {doctor.hospital}
                </Text>
              ) : null}
            </View>
          </View>
          <DetailRow label="Patient" value={childName} />
          <DetailRow label="Date" value={dateLabel ?? ''} />
          <DetailRow label="Time" value={time ? formatTime(time) : ''} />
          <DetailRow label="Mode" value="Video · 30 min" />
          {issueText.length > 0 && <DetailRow label="Concern" value={issueText} />}
        </View>

        <View style={styles.policyNote}>
          <Ionicons name="shield-checkmark-outline" size={Size.iconMeta} color={AppColors.secondary} />
          <Text style={typography.caption}>Free cancellation up to 2 hours before.</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <GradientButton label="Confirm booking" onPress={confirmBooking} loading={booking} disabled={booking} />
      </View>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[typography.meta, styles.detailLabel]}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
  stepDot: { flex: 1, height: 3, borderRadius: 999, backgroundColor: AppColors.border },
  stepDotActive: { backgroundColor: AppColors.primary },

  scroll: { paddingHorizontal: 20, paddingTop: 16, gap: 16 },

  card: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: FontFamily.semibold, fontSize: 15, color: AppColors.primary },
  docText: { flex: 1, gap: 2 },
  docName: { ...typography.title, lineHeight: 20 },

  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },
  detailLabel: { width: 72, lineHeight: 20 },
  detailValue: { ...typography.title, lineHeight: 20, flex: 1, textAlign: 'right' },

  policyNote: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },

  bottomBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: AppColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AppColors.border,
  },

  successScreen: { paddingHorizontal: 20, justifyContent: 'space-between' },
  successBody: { alignItems: 'center', gap: 12, paddingTop: 48 },
  centerText: { textAlign: 'center' },
});
