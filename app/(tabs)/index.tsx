import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AllergyBanner } from '@/components/home/AllergyBanner';
import { CareTeam, type CareProvider } from '@/components/home/CareTeam';
import { monthsBetween } from '@/components/growth/whoData';
import { GrowthCards } from '@/components/home/GrowthCards';
import { HealthLogCard } from '@/components/home/HealthLogCard';
import { HomeHeader } from '@/components/home/HomeHeader';
import { MentalHealthHomeCard } from '@/components/home/MentalHealthHomeCard';
import { MilestonesCard } from '@/components/home/MilestonesCard';
import { useTabBarSpace } from '@/components/home/tabBarSpace';
import { mentalHealthFromAnswers, useOnboardingAnswers } from '@/components/home/useOnboardingAnswers';
import { LatestCheckinCard, useLatestUnbookedCheckin } from '@/components/home/LatestCheckinCard';
import { NewPrescriptionCard } from '@/components/home/NewPrescriptionCard';
import { PrimaryCtaCard } from '@/components/home/PrimaryCtaCard';
import { NotificationPrimer } from '@/components/home/NotificationPrimer';
import { overdueVaccineCount, VaccinationCard } from '@/components/home/VaccinationCard';
import { AppointmentCard } from '@/components/consult/AppointmentCard';
import { PendingPaymentCard } from '@/components/consult/PendingPaymentCard';
import { doctorInitial } from '@/components/consult/appointmentFormat';
import { CancelNotice, cancelLabel, useCancelAppointment } from '@/components/consult/useCancelAppointment';
import { TextButton } from '@/components/gradient-button';
import { BRACKET_CONFIG } from '@/constants/bracketConfig';
import { milestoneBandForDob } from '@/constants/milestones';
import { AppColors, Motion, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useVaccinations } from '@/hooks/useVaccinations';
import { useConversations } from '@/hooks/useConversations';
import { appointmentHasVideoLink, isUrgentAppointment, useAppointments } from '@/hooks/useAppointments';
import { istTodayDateOnly } from '@/hooks/useGrowth';
import { useUpdates } from '@/hooks/useUpdates';
import { parseDateOnly } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Section title (h2) with an optional ghost link on the right. */
function SectionHeader({ title, linkLabel, onLink }: { title: string; linkLabel?: string; onLink?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={typography.headingSM}>{title}</Text>
      {linkLabel && onLink ? <TextButton label={linkLabel} onPress={onLink} chevron style={styles.sectionLink} /> : null}
    </View>
  );
}

/**
 * The selected child's allergy names, loaded fresh on Home (R3-12). The child
 * context swallows a failed allergy load as "no allergies", which would hide
 * the allergy banner with no warning; here a failure is reported so Home can
 * say "Couldn't load" instead. `null` names = not loaded yet: use the
 * context's list meanwhile.
 */
function useChildAllergies(childId: string | null) {
  // Keyed by child, so a switch never shows the previous child's list.
  const [state, setState] = useState<{ childId: string; names: string[] | null; error: string | null } | null>(null);
  const forChild = useRef<string | null>(null);

  const refetch = useCallback(async () => {
    forChild.current = childId;
    if (!childId) return;
    try {
      const { data, error: err } = await supabase.from('allergies').select('name').eq('child_id', childId);
      if (forChild.current !== childId) return;
      if (err) {
        setState((prev) => ({
          childId,
          names: prev?.childId === childId ? prev.names : null,
          error: err.message || 'Could not load allergies',
        }));
      } else {
        setState({ childId, names: ((data ?? []) as { name: string }[]).map((a) => a.name), error: null });
      }
    } catch (e) {
      if (forChild.current !== childId) return;
      setState((prev) => ({
        childId,
        names: prev?.childId === childId ? prev.names : null,
        error: e instanceof Error ? e.message : 'Could not load allergies',
      }));
    }
  }, [childId]);

  const mine = state && state.childId === childId ? state : null;
  return { names: mine?.names ?? null, error: mine?.error ?? null, refetch };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  // Room for the floating tab bar + AI button, so the last card is never under them (R2-17).
  const tabBarSpace = useTabBarSpace();
  const { child, parentName, bracket } = useChild();
  const {
    vaccinations,
    loading: vaccinesLoading,
    error: vaccinesError,
    refetch: refetchVaccines,
  } = useVaccinations(child?.id ?? null);
  const { startConversation } = useConversations(child?.id ?? null);
  const {
    appointments,
    upcoming,
    paymentDue,
    error: apptsError,
    cancelAppointment,
    refetch: refetchAppts,
  } = useAppointments(child?.id ?? null);
  const allergyLoad = useChildAllergies(child?.id ?? null);
  const { refetch: refetchAllergies } = allergyLoad;
  const updates = useUpdates();
  const { refetch: refetchUpdates } = updates;
  // C2 follow-up from the set-up mood answers (R2-16).
  const { record: setupAnswers, refetch: refetchSetupAnswers } = useOnboardingAnswers(child?.id ?? null);
  const moodLevel = mentalHealthFromAnswers(setupAnswers);
  // Live (non-cancelled) bookings: the check-in card hides check-ins they
  // use or that came before the latest one (H1).
  const liveAppointments = appointments.filter((a) => a.status !== 'cancelled');
  const { latest: unbookedCheckin, refetch: refetchCheckin } = useLatestUnbookedCheckin(
    child?.id ?? null,
    liveAppointments,
  );
  // A consult already booked for today (made before the check-in, so not
  // linked to it) means the parent has acted: don't say "See a doctor
  // today · Not booked yet" (R3-21 "booked").
  const today = istTodayDateOnly();
  const bookedToday = liveAppointments.some((a) => a.status === 'upcoming' && a.date === today);
  // Without the bookings list (load failed) "Not booked yet" can't be trusted either.
  const latestCheckin = bookedToday || apptsError ? null : unbookedCheckin;
  // Home stays mounted under the tabs: refresh after booking / cancelling,
  // finishing a check-in, marking a vaccine dose, reading a reply or opening
  // a prescription elsewhere.
  useFocusEffect(
    useCallback(() => {
      refetchAppts();
      refetchUpdates();
      refetchVaccines();
      refetchCheckin();
      refetchSetupAnswers();
      refetchAllergies();
    }, [refetchAppts, refetchUpdates, refetchVaccines, refetchCheckin, refetchSetupAnswers, refetchAllergies]),
  );

  // R3-12: a failed load (expired session, no network) must not look like
  // "no allergies / no consults". One notice with Retry; the vaccine card
  // shows its own state.
  const loadFailed = !!(apptsError || allergyLoad.error);
  const failedParts = [allergyLoad.error ? 'allergies' : null, apptsError ? 'consultations' : null].filter(Boolean);
  const loadFailedText = `Couldn't load ${failedParts.join(' and ')}. Check your connection and try again.`;
  function retryAll() {
    refetchAppts();
    refetchVaccines();
    refetchAllergies();
    refetchCheckin();
  }
  // Newest prescription for this child the parent hasn't opened yet.
  const childNewRx = updates.prescriptions.filter((p) => p.childId === child?.id);
  const newRx = childNewRx[0] ?? null;
  const nextTwo = upcoming.slice(0, 2);
  const { requestCancel, notice: cancelNotice, cancellingId } = useCancelAppointment(cancelAppointment);

  async function handleProviderPress(doctorId: string) {
    if (!child) return;
    try {
      const convo = await startConversation({ child_id: child.id, doctor_id: doctorId });
      router.push(`/chat/${convo.id}`);
    } catch {
      // ignore — UI will show stale state, retry by tapping again
    }
  }

  const childName = child?.name ?? 'Child';
  const bracketKey = bracket ?? 'TODDLER';
  const bracketCfg = BRACKET_CONFIG[bracketKey];

  // "Good morning, Priya", not the full name.
  const firstName = parentName?.trim().split(/\s+/)[0] ?? '';

  // Age-specific checkpoints (C4): the most recent band the child reached.
  const milestoneBand = child?.dob ? milestoneBandForDob(parseDateOnly(child.dob)) : null;

  const allergies = allergyLoad.names ?? child?.allergies.map((a) => a.name) ?? [];

  // Care team = doctors this child actually has (non-cancelled) appointments
  // with, most recent first. No appointments → no section (we never suggest
  // a doctor the family hasn't chosen).
  const careProviders: CareProvider[] = [];
  const seenDoctors = new Set<string>();
  for (const a of [...appointments].reverse()) {
    if (a.status === 'cancelled' || !a.doctors || seenDoctors.has(a.doctor_id)) continue;
    seenDoctors.add(a.doctor_id);
    const name = a.doctors.name;
    careProviders.push({
      id: a.doctor_id,
      name,
      role: a.doctors.specialisation,
      // The doctor's initial without the "Dr." ("Dr. Emily Chen" -> "E"), like the consult screens.
      initial: doctorInitial(name),
      avatarUrl: a.doctors.avatar_url ?? null,
    });
    if (careProviders.length === 3) break;
  }

  const vaccinesOverdue = overdueVaccineCount(vaccinations) > 0;
  const vaccineSection = (
    <View style={styles.section}>
      <SectionHeader title="Vaccines" />
      <VaccinationCard
        vaccinations={vaccinations}
        loading={vaccinesLoading}
        error={vaccinesError}
        onRetry={refetchVaccines}
        onViewSchedule={() => router.navigate('/(tabs)/vaccine')}
      />
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 64, paddingBottom: tabBarSpace },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(Motion.enter)} style={styles.greeting}>
          <Text style={typography.heading}>Here&apos;s {childName}&apos;s day</Text>
          <Text style={typography.meta}>
            {firstName ? `${getGreeting()}, ${firstName}` : getGreeting()}
          </Text>
        </Animated.View>

        {loadFailed ? (
          <View style={styles.loadError} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={16} color={AppColors.onSurfaceVariant} />
            <Text style={[typography.bodySM, styles.loadErrorText]}>{loadFailedText}</Text>
            <TextButton label="Retry" onPress={retryAll} accessibilityLabel="Retry loading Home" />
          </View>
        ) : null}

        {allergies.length > 0 ? <AllergyBanner allergies={allergies} /> : null}

        {/* Overdue vaccines are urgent: near the top, not last (review should-fix 1). */}
        {vaccinesOverdue ? vaccineSection : null}

        {newRx ? (
          <NewPrescriptionCard
            doctorName={newRx.doctorName}
            issuedAt={newRx.issuedAt}
            moreCount={childNewRx.length - 1}
            onPress={() => {
              updates.markPrescriptionSeen(newRx.id);
              router.push(`/prescriptions/${newRx.id}` as never);
            }}
          />
        ) : null}

        {latestCheckin ? (
          <LatestCheckinCard
            checkin={latestCheckin}
            onPress={() =>
              router.push({ pathname: '/checkin/summary', params: { sessionId: latestCheckin.id } })
            }
          />
        ) : null}

        {moodLevel && child ? (
          <MentalHealthHomeCard level={moodLevel} childId={child.id} childName={childName} />
        ) : null}

        {/* Bookings not paid yet (the parent left the payment page, or a
            doctor's follow-up): findable here until the hold runs out. */}
        {paymentDue.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader title="Waiting for payment" />
            {paymentDue.map((f) => (
              <PendingPaymentCard
                key={f.id}
                appointmentId={f.id}
                childId={f.child_id}
                doctorId={f.doctor_id}
                doctorName={f.doctors?.name ?? 'Doctor'}
                doctorAvatarUrl={f.doctors?.avatar_url}
                date={f.date}
                time={f.time}
                holdExpiresAt={f.hold_expires_at ?? null}
                followUp={!!f.followup_of}
                onSettled={refetchAppts}
              />
            ))}
          </View>
        ) : null}

        <PrimaryCtaCard
          title={bracketCfg.ctaTitle}
          subtitle="Log symptoms or daily wellness"
          onPress={() => router.push('/checkin')}
          secondaryLabel="Book a doctor"
          onSecondary={() => router.push('/consult/booking')}
        />

        <HealthLogCard childName={childName} onPress={() => router.push('/health-log')} />

        <NotificationPrimer />

        {/* Shown once the child has any consult, so past visits and doctor
            messages (Consult tab) stay reachable with nothing upcoming. */}
        {nextTwo.length > 0 || cancelNotice || appointments.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title={nextTwo.length > 0 ? 'Upcoming consultations' : 'Consultations'}
              linkLabel="See all"
              onLink={() => router.navigate('/(tabs)/consult')}
            />
            <CancelNotice notice={cancelNotice} />
            {nextTwo.length === 0 && !cancelNotice ? (
              <Text style={typography.bodySM}>No upcoming consults. See past visits and messages.</Text>
            ) : null}
            {nextTwo.map((a) => {
              const item = { id: a.id, date: a.date, time: a.time, doctorName: a.doctors?.name ?? 'Doctor', doctorAvatarUrl: a.doctors?.avatar_url ?? null, paidWithPlan: a.paid_with_plan === true };
              const summaryId = a.ai_summary_id;
              const urgent = isUrgentAppointment(a);
              return (
                <View key={a.id} style={styles.apptBlock}>
                  <AppointmentCard
                    doctorName={item.doctorName}
                    doctorAvatarUrl={item.doctorAvatarUrl}
                    doctorSpecialisation={a.doctors?.specialisation ?? ''}
                    date={a.date}
                    time={a.time}
                    onJoinVideo={() =>
                      router.push({ pathname: '/consult/video/[id]', params: { id: a.id } })
                    }
                    videoLinkReady={appointmentHasVideoLink(a)}
                    onMessageDoctor={() => handleProviderPress(a.doctor_id)}
                    onCancel={() => requestCancel(item)}
                    cancelAccessibilityLabel={cancelLabel(item)}
                    cancelling={cancellingId === a.id}
                    urgent={urgent}
                    onViewSummary={
                      summaryId
                        ? () => router.push({ pathname: '/consult/summary/[id]', params: { id: summaryId } })
                        : undefined
                    }
                  />
                  {urgent ? (
                    <View style={styles.urgentNote}>
                      <Ionicons name="alert-circle" size={16} color={AppColors.danger} />
                      <Text style={[typography.bodySM, styles.urgentNoteText]}>
                        Don&apos;t wait if {childName} gets worse: see a doctor today or call 112.
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="Growth" linkLabel="See chart" onLink={() => router.navigate('/(tabs)/growth')} />
          {/* 0 / null = not measured yet → GrowthCards shows "—", never "0 cm". */}
          <GrowthCards
            data={{
              weight: child?.weight && child.weight > 0 ? child.weight : null,
              height: child?.height && child.height > 0 ? child.height : null,
            }}
            heightLabel={child && monthsBetween(parseDateOnly(child.dob), new Date()) < 24 ? 'Length' : 'Height'}
          />
        </View>

        {milestoneBand ? (
          <View style={styles.section}>
            <SectionHeader title="Milestones" />
            <MilestonesCard band={milestoneBand} childName={childName} childId={child?.id ?? null} />
          </View>
        ) : null}

        {vaccinesOverdue ? null : vaccineSection}

        {careProviders.length > 0 ? (
          <CareTeam providers={careProviders} onProviderPress={handleProviderPress} />
        ) : null}
      </ScrollView>

      <HomeHeader
        childName={childName}
        avatarInitial={Array.from(childName)[0] ?? ''}
        hasUnread={updates.hasUnread}
        unreadCount={updates.count}
        paddingTop={insets.top}
        onNotifications={() => router.push('/consult/updates')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: AppColors.surface,
  },
  scroll: {
    paddingHorizontal: 20,
    gap: 24,
  },
  greeting: {
    gap: 4,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  apptBlock: {
    gap: 8,
  },
  loadError: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
  },
  loadErrorText: {
    flex: 1,
    minWidth: 160,
  },
  urgentNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.dangerBorder,
    backgroundColor: AppColors.dangerSurface,
  },
  urgentNoteText: {
    flex: 1,
    color: AppColors.danger,
  },
  // 44 high like every tap target (review should-fix 16); the negative
  // margin keeps the section title row as tight as before.
  sectionLink: {
    minHeight: 44,
    paddingVertical: 0,
    marginVertical: -6,
  },
});
