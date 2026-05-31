/**
 * Booking Confirmation — Step 3 (final)
 *
 * Shows the summary, books via useAppointments.bookAppointment, then renders
 * a success state in-place. Payment step is intentionally skipped — the
 * proposal MVP does not include payment.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppColors } from '@/constants/theme';
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
    return (
      <View style={[styles.screen, styles.successScreen, { paddingTop: insets.top + 32 }]}>
        <View style={styles.successIcon}>
          <LinearGradient
            colors={[AppColors.successGreen, AppColors.successGreenBright ?? AppColors.successGreen]}
            style={styles.successIconGrad}
          >
            <Ionicons name="checkmark" size={44} color={AppColors.onPrimary} />
          </LinearGradient>
        </View>
        <Text style={styles.successTitle}>Booking confirmed</Text>
        <Text style={styles.successSub}>
          {childName}&apos;s appointment with {doctor?.name ?? 'the doctor'} is set.
        </Text>

        <View style={styles.successCard}>
          <SuccessRow icon="person-outline" label="Doctor" value={doctor?.name ?? '—'} />
          <SuccessRow icon="calendar-outline" label="Date" value={dateLabel ?? '—'} />
          <SuccessRow icon="time-outline" label="Time" value={time ? formatTime(time) : '—'} />
        </View>

        <Pressable
          style={({ pressed }) => [styles.doneBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() => router.replace('/(tabs)')}
        >
          <LinearGradient
            colors={[AppColors.primary, AppColors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.doneBtnGrad}
          >
            <Text style={styles.doneBtnText}>Back to home</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  // ── Review state ───────────────────────────────────────────────────────────
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={AppColors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Confirm Booking</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, s <= 3 && styles.stepDotActive]} />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pageTitle}>Almost there.</Text>
        <Text style={styles.pageSub}>Review the details and confirm.</Text>

        <View style={styles.doctorCard}>
          <LinearGradient
            colors={[`${AppColors.primary}20`, `${AppColors.primary}08`]}
            style={styles.docAvatarBg}
          >
            <Text style={styles.docAvatarInitial}>
              {doctor?.name.split(' ').slice(-1)[0]?.charAt(0) ?? 'D'}
            </Text>
          </LinearGradient>
          <View style={styles.docDetails}>
            <Text style={styles.docName}>{doctor?.name ?? 'Doctor'}</Text>
            <Text style={styles.docRole}>{doctor?.specialisation ?? ''}</Text>
            <Text style={styles.docHospital}>{doctor?.hospital ?? ''}</Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <Text style={styles.cardLabel}>Appointment</Text>
          <DetailRow icon="person-outline" label="Patient" value={childName} />
          <DetailRow icon="calendar-outline" label="Date" value={dateLabel ?? ''} />
          <DetailRow icon="time-outline" label="Time" value={time ? formatTime(time) : ''} />
          <DetailRow icon="videocam-outline" label="Mode" value="Video consultation" />
          <DetailRow icon="hourglass-outline" label="Duration" value="30 minutes" />
        </View>

        {issueText.length > 0 && (
          <View style={styles.issueCard}>
            <View style={styles.issueTitleRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={AppColors.primary} />
              <Text style={styles.issueTitleText}>Your concern</Text>
            </View>
            <Text style={styles.issueBody}>{issueText}</Text>
          </View>
        )}

        <View style={styles.policyNote}>
          <Ionicons name="shield-checkmark-outline" size={16} color={AppColors.primary} />
          <Text style={styles.policyText}>
            Free cancellation up to 2 hours before the appointment.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.payBtn, { opacity: pressed && !booking ? 0.87 : 1 }]}
          onPress={confirmBooking}
          disabled={booking}
        >
          <LinearGradient
            colors={[AppColors.primary, AppColors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.payBtnGrad}
          >
            {booking ? (
              <ActivityIndicator size="small" color={AppColors.onPrimary} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color={AppColors.onPrimary} />
                <Text style={styles.payBtnText}>Confirm booking</Text>
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconWrap}>
        <Ionicons name={icon as never} size={16} color={AppColors.primary} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function SuccessRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.successRow}>
      <Ionicons name={icon as never} size={15} color={AppColors.onSurfaceVariant} />
      <Text style={styles.successRowLabel}>{label}</Text>
      <Text style={styles.successRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: `${AppColors.surfaceContainerHigh}80`,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17, color: AppColors.onSurface },

  steps: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 8 },
  stepDot: { flex: 1, height: 3, borderRadius: 999, backgroundColor: `${AppColors.outlineVariant}30` },
  stepDotActive: { backgroundColor: AppColors.primary },

  scroll: { paddingHorizontal: 20, paddingTop: 20, gap: 20 },

  pageTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 26, color: AppColors.onSurface, letterSpacing: -0.5 },
  pageSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, color: AppColors.onSurfaceVariant, lineHeight: 20, marginTop: -8 },

  doctorCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 18,
    shadowColor: AppColors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
  },
  docAvatarBg: {
    width: 60, height: 60, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  docAvatarInitial: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 24, color: AppColors.primary },
  docDetails: { flex: 1, gap: 2 },
  docName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: AppColors.onSurface },
  docRole: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, color: AppColors.primary },
  docHospital: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: AppColors.onSurfaceVariant },

  detailsCard: {
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, padding: 18, gap: 2,
    shadowColor: AppColors.onSurface, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.onSurfaceVariant, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: `${AppColors.outlineVariant}15`,
  },
  detailIconWrap: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: `${AppColors.primary}10`, alignItems: 'center', justifyContent: 'center',
  },
  detailLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: AppColors.onSurfaceVariant, flex: 1 },
  detailValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.onSurface, textAlign: 'right', maxWidth: '55%' },

  issueCard: {
    backgroundColor: `${AppColors.primary}08`, borderRadius: 16, padding: 16, gap: 8,
    borderWidth: 1, borderColor: `${AppColors.primary}15`,
  },
  issueTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  issueTitleText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.primary },
  issueBody: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: AppColors.onSurface, lineHeight: 20 },

  policyNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: `${AppColors.primary}08`, borderRadius: 12, padding: 14,
  },
  policyText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, color: AppColors.onSurfaceVariant, lineHeight: 18, flex: 1 },

  bottomBar: {
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderTopWidth: 1, borderTopColor: `${AppColors.outlineVariant}15`,
  },
  payBtn: { borderRadius: 999, overflow: 'hidden' },
  payBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  payBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: AppColors.onPrimary },

  successScreen: { alignItems: 'center', justifyContent: 'flex-start', padding: 32, gap: 16 },
  successIcon: { borderRadius: 999, overflow: 'hidden' },
  successIconGrad: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 26, color: AppColors.onSurface, textAlign: 'center', letterSpacing: -0.5 },
  successSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 15, color: AppColors.onSurfaceVariant, textAlign: 'center', lineHeight: 22 },
  successCard: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 20, gap: 4, marginTop: 8,
    shadowColor: AppColors.onSurface, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  successRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: `${AppColors.outlineVariant}15`,
  },
  successRowLabel: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: AppColors.onSurfaceVariant, flex: 1 },
  successRowValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: AppColors.onSurface, textAlign: 'right', flex: 2 },

  doneBtn: { width: '100%', borderRadius: 999, overflow: 'hidden', marginTop: 16 },
  doneBtnGrad: { paddingVertical: 16, alignItems: 'center' },
  doneBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: AppColors.onPrimary },
});
