import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Card } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHECKIN_HEADER_HEIGHT, CheckinHeader } from '@/components/checkin/CheckinHeader';
import { DateStrip, getNextDays } from '@/components/checkin/DateStrip';
import { DoctorPicker } from '@/components/checkin/DoctorPicker';
import { SlotPicker } from '@/components/checkin/SlotPicker';
import { SummaryCard } from '@/components/checkin/SummaryCard';
import { AppColors } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useAppointments } from '@/hooks/useAppointments';
import { useCheckin } from '@/hooks/useCheckin';
import { useConversations } from '@/hooks/useConversations';
import { useDoctors, useTimeSlots } from '@/hooks/useDoctors';

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
    return (
      <View style={styles.screen}>
        <View style={[styles.successContainer, { paddingTop: insets.top + 40 }]}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={44} color={AppColors.successGreen} />
          </View>
          <Text style={styles.successTitle}>All set!</Text>
          <Text style={styles.successSub}>
            {childName}&apos;s summary has been sent to {selectedDoctor?.name ?? 'the doctor'}.
          </Text>
          <Card style={styles.successCard}>
            <Card.Body style={styles.successCardBody}>
              <SuccessRow icon="person-outline" label="Doctor" value={selectedDoctor?.name ?? ''} />
              <SuccessRow
                icon="calendar-outline"
                label="Date"
                value={`${days[selectedDay].label}, ${days[selectedDay].sub}`}
              />
              <SuccessRow icon="time-outline" label="Time" value={selectedSlot ?? ''} isLast />
            </Card.Body>
          </Card>

          <Pressable
            style={({ pressed }) => [styles.chatBtn, { opacity: pressed || openingChat ? 0.7 : 1 }]}
            onPress={handleStartChat}
            disabled={openingChat}
          >
            {openingChat ? (
              <ActivityIndicator size="small" color={AppColors.primary} />
            ) : (
              <>
                <Ionicons name="chatbubble-outline" size={16} color={AppColors.primary} />
                <Text style={styles.chatBtnText}>
                  Message {selectedDoctor?.name?.split(' ').slice(-1)[0] ?? 'doctor'}
                </Text>
              </>
            )}
          </Pressable>

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
              <Text style={styles.doneBtnText}>Go to Home</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CheckinHeader title="Pre-visit Summary" onBack={() => router.back()} />

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
            <Text style={styles.loadingText}>Loading summary…</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Doctor</Text>
          {loadingDocs ? (
            <ActivityIndicator size="small" color={AppColors.primary} />
          ) : (
            <DoctorPicker doctors={doctors} selectedId={selectedDoctorId} onSelect={setSelectedDoctorId} />
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pick a Date</Text>
          <DateStrip days={days} selectedIndex={selectedDay} onSelect={setSelectedDay} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pick a Time</Text>
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
            `${AppColors.surface}00`,
            `${AppColors.surface}40`,
            `${AppColors.surface}B0`,
            AppColors.surface,
          ]}
          locations={[0, 0.25, 0.5, 0.7]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          pointerEvents="none"
        />
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            style={({ pressed }) => [styles.confirmBtn, { opacity: pressed && selectedSlot ? 0.88 : 1 }]}
            disabled={!selectedSlot || booking}
            onPress={handleConfirm}
          >
            <LinearGradient
              colors={
                selectedSlot
                  ? [AppColors.primary, AppColors.gradientEnd]
                  : [AppColors.surfaceContainerHigh, AppColors.surfaceContainerHigh]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.confirmGrad}
            >
              {booking ? (
                <ActivityIndicator size="small" color={AppColors.onPrimary} />
              ) : (
                <>
                  <Text style={[styles.confirmText, !selectedSlot && styles.confirmTextDisabled]}>
                    Confirm Booking
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={18}
                    color={selectedSlot ? AppColors.onPrimary : AppColors.onSurfaceVariant}
                  />
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SuccessRow({
  icon,
  label,
  value,
  isLast,
}: {
  icon: string;
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.successRow, isLast && styles.successRowLast]}>
      <Ionicons name={icon as any} size={16} color={AppColors.onSurfaceVariant} />
      <Text style={styles.successRowLabel}>{label}</Text>
      <Text style={styles.successRowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },

  scroll: { paddingHorizontal: 20, gap: 24 },

  loadingSection: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  loadingText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: AppColors.onSurfaceVariant },

  section: { gap: 14 },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: AppColors.onSurface },

  footerWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 12 },
  confirmBtn: { borderRadius: 999, overflow: 'hidden' },
  confirmGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  confirmText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: AppColors.onPrimary },
  confirmTextDisabled: { color: AppColors.onSurfaceVariant },

  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: `${AppColors.successGreen}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
    color: AppColors.onSurface,
    letterSpacing: -0.5,
  },
  successSub: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    color: AppColors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  successCard: {
    width: '100%',
    backgroundColor: AppColors.surfaceContainerLowest,
    borderRadius: 18,
    marginTop: 8,
  },
  successCardBody: { padding: 6 },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: `${AppColors.outlineVariant}15`,
  },
  successRowLast: { borderBottomWidth: 0 },
  successRowLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: AppColors.onSurfaceVariant,
    flex: 1,
  },
  successRowValue: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: AppColors.onSurface,
    textAlign: 'right',
  },
  doneBtn: { width: '100%', borderRadius: 999, overflow: 'hidden', marginTop: 8 },
  doneBtnGrad: { alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  doneBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: AppColors.onPrimary },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: `${AppColors.primary}10`,
    marginTop: 4,
  },
  chatBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: AppColors.primary },
});
