import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AiCheckinHeroCard } from '@/components/consult/AiCheckinHeroCard';
import { AppointmentCard } from '@/components/consult/AppointmentCard';
import { ConsultHistoryItem } from '@/components/consult/ConsultHistoryItem';
import { DoctorCardCompact } from '@/components/consult/DoctorCardCompact';
import { EmptyStateCard } from '@/components/consult/EmptyStateCard';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { AppColors } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useAppointments } from '@/hooks/useAppointments';
import { useConsultations } from '@/hooks/useConsultations';
import { useDoctors } from '@/hooks/useDoctors';

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
      <View style={styles.headerLeft}>
        <Text style={styles.headerTitle}>LilSteps AI</Text>
        <Text style={styles.headerSub}>Your pediatric assistant</Text>
      </View>
      <Pressable style={styles.addBtn} onPress={() => router.push('/consult/booking')}>
        <Ionicons name="add" size={20} color={AppColors.primary} />
      </Pressable>
    </>
  );

  return (
    <TabScreenLayout headerContent={headerContent}>
      <AiCheckinHeroCard onStart={() => router.push('/checkin')} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          {nextAppointment && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>1</Text>
            </View>
          )}
        </View>
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
          <EmptyStateCard
            icon="calendar-outline"
            title="No upcoming appointments"
            body="Book one after completing a health check-in"
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Doctors</Text>
        {loadingDocs ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : doctors.length === 0 ? (
          <EmptyStateCard
            icon="people-outline"
            title="No doctors yet"
            body="Your pediatricians will appear here"
          />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.doctorsRow}
            style={styles.doctorsScroll}
          >
            {doctors.map((doc) => (
              <DoctorCardCompact key={doc.id} doctor={doc} onBook={() => router.push('/consult/booking')} />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Consultation History</Text>
        {loadingConsult ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : consultations.length === 0 ? (
          <EmptyStateCard
            icon="document-text-outline"
            title="No past consultations"
            body="Your visit history will appear here"
          />
        ) : (
          <View style={styles.historyList}>
            {consultations.map((c) => (
              <ConsultHistoryItem
                key={c.id}
                id={c.id}
                createdAt={c.created_at}
                doctorName={c.doctor_name}
                chiefComplaint={c.chief_complaint}
                outcome={c.outcome}
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
  headerLeft: { gap: 2 },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    color: AppColors.onSurface,
    letterSpacing: -0.5,
  },
  headerSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: AppColors.onSurfaceVariant },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: `${AppColors.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 17,
    color: AppColors.onSurface,
    letterSpacing: -0.3,
  },
  badge: {
    backgroundColor: AppColors.primary,
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 11, color: AppColors.onPrimary },

  loadingRow: { paddingVertical: 20, alignItems: 'center' },

  doctorsScroll: { marginHorizontal: -20 },
  doctorsRow: { gap: 10, paddingHorizontal: 20 },

  historyList: { gap: 10 },
});
