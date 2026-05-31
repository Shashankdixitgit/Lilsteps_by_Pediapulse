import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AllergyBanner } from '@/components/home/AllergyBanner';
import { CareTeam, type CareProvider } from '@/components/home/CareTeam';
import { GrowthCards } from '@/components/home/GrowthCards';
import { DailyInsight } from '@/components/home/DailyInsight';
import { HomeHeader } from '@/components/home/HomeHeader';
import { PrimaryCtaCard } from '@/components/home/PrimaryCtaCard';
import { QuickActions } from '@/components/home/QuickActions';
import { VaccinationCard } from '@/components/home/VaccinationCard';
import { AppointmentCard } from '@/components/consult/AppointmentCard';
import { BRACKET_CONFIG } from '@/constants/bracketConfig';
import { AppColors } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useVaccinations } from '@/hooks/useVaccinations';
import { useDoctors } from '@/hooks/useDoctors';
import { useConversations } from '@/hooks/useConversations';
import { useAppointments } from '@/hooks/useAppointments';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { child, parentName, bracket } = useChild();
  const { vaccinations } = useVaccinations(child?.id ?? null);
  const { doctors } = useDoctors();
  const { startConversation } = useConversations(child?.id ?? null);
  const { upcoming, cancelAppointment } = useAppointments(child?.id ?? null);
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
  const vaccineDate = vaccineToShow?.scheduled_date
    ? new Date(vaccineToShow.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';

  const careProviders: CareProvider[] = doctors.slice(0, 3).map((doc) => ({
    id: doc.id,
    name: doc.name,
    role: doc.specialisation,
    initial: doc.name.charAt(0),
  }));

  const headerHeight = insets.top + 56;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll, 
          { 
            paddingTop: headerHeight,
            paddingBottom: 100 + insets.bottom 
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.greetingTop}>
            {getGreeting()}, {parentName || 'there'}.
          </Text>
          <Text style={styles.greetingItalic}>
            {childName} <Text style={styles.greetingItalicSoft}>is thriving today.</Text>
          </Text>
          <Text style={styles.greetingSub}>
            {bracketCfg.greetingSubtext(childName)}
          </Text>
        </View>

        <QuickActions
          onBook={() => router.push('/consult/booking')}
          onGrowth={() => router.navigate('/(tabs)/growth')}
          onVaccines={() => router.navigate('/(tabs)/vaccine')}
          onRecords={() => router.navigate('/(tabs)/records')}
        />

        {allergies.length > 0 && (
          <AllergyBanner allergies={allergies} />
        )}

        <PrimaryCtaCard
          title={bracketCfg.ctaTitle}
          subtitle="Log symptoms or daily wellness"
          onPress={() => router.push('/checkin')}
        />

        {nextTwo.length > 0 && (
          <View style={styles.upcomingBlock}>
            <View style={styles.upcomingHeader}>
              <Text style={styles.sectionTitle}>Upcoming consultations</Text>
              <Pressable onPress={() => router.navigate('/(tabs)/consult')}>
                <Text style={styles.seeAll}>See all →</Text>
              </Pressable>
            </View>
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
        )}

        <GrowthCards data={{ weight: child?.weight ?? 0, height: child?.height ?? 0 }} />

        <VaccinationCard
          nextVaccine={vaccineLabel}
          nextDate={vaccineDate}
          onViewSchedule={() => router.navigate('/(tabs)/vaccine')}
        />

        <CareTeam
          providers={careProviders}
          onAddProvider={() => router.push('/consult/booking')}
          onProviderPress={handleProviderPress}
        />

        <DailyInsight bracket={bracketKey} />
      </ScrollView>

      <HomeHeader
        childName={childName}
        avatarInitial={childName.charAt(0)}
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
    paddingHorizontal: 24,
    gap: 28,
    paddingTop: 12,
  },
  section: {
    gap: 6,
  },
  upcomingBlock: {
    gap: 12,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: AppColors.onSurface,
    letterSpacing: -0.3,
  },
  seeAll: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: AppColors.primary,
  },
  greetingTop: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: AppColors.onSurfaceVariant,
    marginBottom: 6,
  },
  greetingItalic: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 36,
    color: AppColors.onSurface,
    letterSpacing: -1,
    lineHeight: 42,
  },
  greetingItalicSoft: {
    fontFamily: 'PlusJakartaSans_500Medium',
    color: AppColors.primary,
  },
  greetingSub: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    color: AppColors.onSurfaceVariant,
    lineHeight: 22,
    marginTop: 4,
  },
});
