import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AiCheckinHeroCard } from '@/components/consult/AiCheckinHeroCard';
import { AppointmentCard } from '@/components/consult/AppointmentCard';
import { ConsultHistoryItem } from '@/components/consult/ConsultHistoryItem';
import { DoctorCardCompact } from '@/components/consult/DoctorCardCompact';
import { EmptyStateCard } from '@/components/consult/EmptyStateCard';
import { HeaderChildAvatar } from '@/components/HeaderChildAvatar';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { AppColors, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useAppointments } from '@/hooks/useAppointments';
import { useConsultations } from '@/hooks/useConsultations';
import { useDoctors } from '@/hooks/useDoctors';
import { typography } from '@/styles/global';

export default function ConsultScreen() {
  const { child } = useChild();
  const { doctors, loading: loadingDocs } = useDoctors();
  const { upcoming, cancelAppointment, loading: loadingAppts } = useAppointments(child?.id ?? null);
  const { consultations, loading: loadingConsult } = useConsultations(child?.id ?? null);

  const nextAppointment = upcoming[0] ?? null;

  async function handleCancel(id: string) {
    try {
      await cancelAppointment(id);
    } catch {
      // error handled
    }
  }

  const headerContent = (
    <>
      <Text style={typography.heading} accessibilityRole="header">
        LilSteps AI
      </Text>
      <View style={styles.headerRight}>
        <HeaderIconButton
          icon="add"
          onPress={() => router.push('/consult/booking')}
          accessibilityLabel="Book a consultation"
          color={AppColors.primary}
        />
        <HeaderChildAvatar />
      </View>
    </>
  );

  return (
    <TabScreenLayout headerContent={headerContent}>
      <AiCheckinHeroCard onStart={() => router.push('/checkin')} />

      <View style={styles.section}>
        <Text style={typography.headingSM}>Upcoming</Text>
        {loadingAppts ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : nextAppointment ? (
          <AppointmentCard
            doctorName={nextAppointment.doctors?.name ?? 'Doctor'}
            doctorSpecialisation={nextAppointment.doctors?.specialisation ?? ''}
            hospital={nextAppointment.doctors?.hospital ?? ''}
            date={nextAppointment.date}
            time={nextAppointment.time.slice(0, 5)}
            onJoinVideo={() =>
              router.push({ pathname: '/consult/video/[id]', params: { id: nextAppointment.id } })
            }
            onCancel={() => handleCancel(nextAppointment.id)}
          />
        ) : (
          <EmptyStateCard icon="calendar-outline" title="No upcoming appointments" />
        )}
      </View>

      <View style={styles.section}>
        <Text style={typography.headingSM}>Your doctors</Text>
        {loadingDocs ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : doctors.length === 0 ? (
          <EmptyStateCard icon="people-outline" title="No doctors yet" />
        ) : (
          <View style={styles.listCard}>
            {doctors.map((doc, i) => (
              <DoctorCardCompact
                key={doc.id}
                doctor={doc}
                inList
                divider={i > 0}
                onBook={() => router.push('/consult/booking')}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={typography.headingSM}>Past consultations</Text>
        {loadingConsult ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : consultations.length === 0 ? (
          <EmptyStateCard icon="document-text-outline" title="No past consultations" />
        ) : (
          <View style={styles.listCard}>
            {consultations.map((c, i) => (
              <ConsultHistoryItem
                key={c.id}
                id={c.id}
                createdAt={c.created_at}
                doctorName={c.doctor_name}
                chiefComplaint={c.chief_complaint}
                outcome={c.outcome}
                divider={i > 0}
                onPress={(id) => router.push(`/consult/${id}`)}
              />
            ))}
          </View>
        )}
      </View>
    </TabScreenLayout>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  section: { gap: 8 },
  loadingRow: { paddingVertical: 16, alignItems: 'center' },
  listCard: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    overflow: 'hidden',
  },
});
