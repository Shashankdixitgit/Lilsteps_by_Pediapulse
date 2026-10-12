import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECKIN_HEADER_HEIGHT, CheckinHeader } from '@/components/checkin/CheckinHeader';
import { DateStrip, getNextDays } from '@/components/checkin/DateStrip';
import { DoctorPicker } from '@/components/checkin/DoctorPicker';
import { SlotPicker } from '@/components/checkin/SlotPicker';
import { SummaryCard } from '@/components/checkin/SummaryCard';
import { GradientButton } from '@/components/gradient-button';
import { AppColors, CanvasFade } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useAppointments } from '@/hooks/useAppointments';
import { useCheckin } from '@/hooks/useCheckin';
import { useConversations } from '@/hooks/useConversations';
import { useDoctors, useTimeSlots } from '@/hooks/useDoctors';
import { typography } from '@/styles/global';

export default function CheckinSummaryScreen() {
  const insets = useSafeAreaInsets();
  const { child } = useChild();
  const checkin = useCheckin(child);
  const { doctors, loading: loadingDocs } = useDoctors();
  const { bookAppointment } = useAppointments(child?.id ?? null);
  const { startConversation } = useConversations(child?.id ?? null);
  const [openingChat, setOpeningChat] = useState(false);

  const days = useMemo(() => getNextDays(5), []);

  const [selectedDay, setSelectedDay] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (doctors.length > 0 && !selectedDoctorId) {
      setSelectedDoctorId(doctors[0].id);
    }
  }, [doctors, selectedDoctorId]);

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId) ?? doctors[0] ?? null;

  const { slots, loading: loadingSlots } = useTimeSlots(
    selectedDoctorId,
    days[selectedDay].isoDate,
  );

  useEffect(() => {
    setSelectedSlot(null);
  }, [selectedDoctorId, selectedDay]);

  const summary = checkin.summary;
  const childName = child?.name ?? 'Child';

  async function handleConfirm() {
    if (!selectedSlot || !selectedDoctor || !child) return;
    setBooking(true);
    try {
      await bookAppointment({
        child_id: child.id,
        doctor_id: selectedDoctor.id,
        date: days[selectedDay].isoDate,
        time: selectedSlot,
        ai_summary_id: checkin.sessionId ?? undefined,
      });
      setConfirmed(true);
    } catch {
      // booking failed
    } finally {
      setBooking(false);
    }
  }

  async function handleStartChat() {
    if (!child || !selectedDoctor || openingChat) return;
    setOpeningChat(true);
    try {
      const convo = await startConversation({
        child_id: child.id,
        doctor_id: selectedDoctor.id,
      });
      router.replace(`/chat/${convo.id}`);
    } catch {
      // ignored — user can retry
    } finally {
      setOpeningChat(false);
    }
  }

  if (confirmed) {
    const when = `${days[selectedDay].label}, ${days[selectedDay].sub}${selectedSlot ? ` at ${selectedSlot}` : ''}`;
    return (
      <View style={[styles.screen, styles.successScreen, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.successBody}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={28} color={AppColors.success} />
          </View>
          <Text style={[typography.heading, styles.centerText]}>All set</Text>
          <Text style={[typography.body, styles.centerText]}>
            {childName}&apos;s summary is with {selectedDoctor?.name ?? 'the doctor'}. See you {when}.
          </Text>
        </View>
        <View style={styles.successActions}>
          <GradientButton label="Go to home" onPress={() => router.replace('/(tabs)')} />
          <GradientButton
            variant="ghost"
            label={`Message ${selectedDoctor?.name?.split(' ').slice(-1)[0] ?? 'doctor'}`}
            onPress={handleStartChat}
            loading={openingChat}
            style={styles.selfCenter}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CheckinHeader title="Pre-visit summary" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + CHECKIN_HEADER_HEIGHT, paddingBottom: 100 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        bounces
        alwaysBounceVertical
      >
        {summary ? (
          <SummaryCard summary={summary} childName={childName} />
        ) : (
          <View style={styles.loadingSection}>
            <ActivityIndicator size="small" color={AppColors.primary} />
            <Text style={typography.meta}>Loading summary…</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={typography.headingSM}>Choose a doctor</Text>
          {loadingDocs ? (
            <ActivityIndicator size="small" color={AppColors.primary} />
          ) : (
            <DoctorPicker doctors={doctors} selectedId={selectedDoctorId} onSelect={setSelectedDoctorId} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Pick a date</Text>
          <DateStrip days={days} selectedIndex={selectedDay} onSelect={setSelectedDay} />
        </View>

        <View style={styles.section}>
          <Text style={typography.headingSM}>Pick a time</Text>
          {loadingSlots ? (
            <ActivityIndicator size="small" color={AppColors.primary} />
          ) : (
            <SlotPicker slots={slots} selectedTime={selectedSlot} onSelect={setSelectedSlot} />
          )}
        </View>
      </ScrollView>

      <View style={styles.footerWrapper} pointerEvents="box-none">
        <LinearGradient
          colors={[
            CanvasFade.a0,
            CanvasFade.a25,
            CanvasFade.a69,
            AppColors.surface,
          ]}
          locations={[0, 0.25, 0.5, 0.7]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <GradientButton
            label="Confirm booking"
            disabled={!selectedSlot || booking}
            loading={booking}
            onPress={handleConfirm}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  scroll: { paddingHorizontal: 20, gap: 24 },

  loadingSection: { alignItems: 'center', gap: 8, paddingVertical: 24 },

  section: { gap: 8 },

  footerWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 12 },

  successScreen: { paddingHorizontal: 20, justifyContent: 'space-between' },
  successBody: { alignItems: 'center', gap: 12, paddingTop: 48 },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  centerText: { textAlign: 'center' },
  successActions: { gap: 4 },
  selfCenter: { alignSelf: 'center' },
});
