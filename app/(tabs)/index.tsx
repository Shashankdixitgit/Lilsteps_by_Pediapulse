import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AllergyBanner } from '@/components/home/AllergyBanner';
import { CareTeam, type CareProvider } from '@/components/home/CareTeam';
import { GrowthCards } from '@/components/home/GrowthCards';
import { HomeHeader } from '@/components/home/HomeHeader';
import { PrimaryCtaCard } from '@/components/home/PrimaryCtaCard';
import { VaccinationCard } from '@/components/home/VaccinationCard';
import { AppointmentCard } from '@/components/consult/AppointmentCard';
import { TextButton } from '@/components/gradient-button';
import { BRACKET_CONFIG } from '@/constants/bracketConfig';
import { AppColors, Motion } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useVaccinations } from '@/hooks/useVaccinations';
import { useConversations } from '@/hooks/useConversations';
import { useAppointments } from '@/hooks/useAppointments';
import { formatDate } from '@/lib/date';
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

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { child, parentName, bracket } = useChild();
  const { vaccinations } = useVaccinations(child?.id ?? null);
  const { startConversation } = useConversations(child?.id ?? null);
  const { appointments, upcoming, cancelAppointment } = useAppointments(child?.id ?? null);
  const nextTwo = upcoming.slice(0, 2);

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

  const allergies = child?.allergies.map(a => a.name) ?? [];

  // Prioritise overdue (clinically urgent) over upcoming so the card surfaces
  // the most actionable thing — "All caught up!" was misleading when many
  // doses were overdue but none upcoming.
  const overdueVaccine = vaccinations.find(v => v.status === 'overdue');
  const upcomingVaccine = vaccinations.find(v => v.status === 'due_soon' || v.status === 'upcoming');
  const vaccineToShow = overdueVaccine ?? upcomingVaccine;
  const vaccineLabel = overdueVaccine
    ? `Overdue: ${overdueVaccine.vaccine_name}`
    : upcomingVaccine?.vaccine_name ?? 'All caught up!';
  const vaccineDate = formatDate(vaccineToShow?.scheduled_date) || '—';

  // Care team = doctors this child actually has (non-cancelled) appointments
  // with, most recent first. No appointments → no section (we never suggest
  // a doctor the family hasn't chosen).
  const careProviders: CareProvider[] = [];
  const seenDoctors = new Set<string>();
  for (const a of [...appointments].reverse()) {
    if (a.status === 'cancelled' || !a.doctors || seenDoctors.has(a.doctor_id)) continue;
    seenDoctors.add(a.doctor_id);
    const name = a.doctors.name;
    // Last-name initial ("Dr. Emily Chen" -> "C"), like the consult screens.
    const lastWord = name.trim().split(' ').slice(-1)[0] ?? name;
    careProviders.push({
      id: a.doctor_id,
      name,
      role: a.doctors.specialisation,
      initial: Array.from(lastWord)[0] ?? '',
    });
    if (careProviders.length === 3) break;
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 64, paddingBottom: 100 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(Motion.enter)} style={styles.greeting}>
          <Text style={typography.heading} numberOfLines={1}>
            Here&apos;s {childName}&apos;s day
          </Text>
          <Text style={typography.meta} numberOfLines={1}>
            {parentName ? `${getGreeting()}, ${parentName}` : getGreeting()}
          </Text>
        </Animated.View>

        {allergies.length > 0 ? <AllergyBanner allergies={allergies} /> : null}

        <PrimaryCtaCard
          title={bracketCfg.ctaTitle}
          subtitle="Log symptoms or daily wellness"
          onPress={() => router.push('/checkin')}
          secondaryLabel="Book a doctor"
          onSecondary={() => router.push('/consult/booking')}
        />

        {nextTwo.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Upcoming consultations"
              linkLabel="See all"
              onLink={() => router.navigate('/(tabs)/consult')}
            />
            {nextTwo.map((a) => (
              <AppointmentCard
                key={a.id}
                doctorName={a.doctors?.name ?? 'Doctor'}
                doctorSpecialisation={a.doctors?.specialisation ?? ''}
                hospital={a.doctors?.hospital ?? ''}
                date={a.date}
                time={a.time.slice(0, 5)}
                onJoinVideo={() =>
                  router.push({ pathname: '/consult/video/[id]', params: { id: a.id } })
                }
                onCancel={() => cancelAppointment(a.id).catch(() => {})}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="Growth" linkLabel="See chart" onLink={() => router.navigate('/(tabs)/growth')} />
          <GrowthCards data={{ weight: child?.weight ?? 0, height: child?.height ?? 0 }} />
        </View>

        <View style={styles.section}>
          <SectionHeader title="Vaccines" />
          <VaccinationCard
            nextVaccine={vaccineLabel}
            nextDate={vaccineDate}
            status={overdueVaccine ? 'overdue' : upcomingVaccine ? 'upcoming' : 'done'}
            onViewSchedule={() => router.navigate('/(tabs)/vaccine')}
          />
        </View>

        {careProviders.length > 0 ? (
          <CareTeam providers={careProviders} onProviderPress={handleProviderPress} />
        ) : null}
      </ScrollView>

      <HomeHeader
        childName={childName}
        avatarInitial={Array.from(childName)[0] ?? ''}
        hasUnread={false}
        paddingTop={insets.top}
        onNotifications={() => router.push('/profile')}
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
  sectionLink: {
    minHeight: 32,
    paddingVertical: 0,
  },
});
