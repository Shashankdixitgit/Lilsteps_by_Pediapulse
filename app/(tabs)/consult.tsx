import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AiCheckinHeroCard } from '@/components/consult/AiCheckinHeroCard';
import { AppointmentCard } from '@/components/consult/AppointmentCard';
import { ConsultHistoryItem } from '@/components/consult/ConsultHistoryItem';
import { ConversationListItem } from '@/components/consult/ConversationListItem';
import { CancelNotice, cancelLabel, useCancelAppointment } from '@/components/consult/useCancelAppointment';
import { DoctorCardCompact } from '@/components/consult/DoctorCardCompact';
import { EmptyStateCard } from '@/components/consult/EmptyStateCard';
import { HeaderChildAvatar } from '@/components/HeaderChildAvatar';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { TabScreenLayout } from '@/components/TabScreenLayout';
import { AppColors, Radius } from '@/constants/theme';
import { useChild } from '@/context/child';
import { appointmentHasVideoLink, isUrgentAppointment, useAppointments } from '@/hooks/useAppointments';
import { parentConsultTitle, useConsultations } from '@/hooks/useConsultations';
import { useConversations } from '@/hooks/useConversations';
import { useDoctors } from '@/hooks/useDoctors';
import { typography } from '@/styles/global';

export default function ConsultScreen() {
  const { child } = useChild();
  const { doctors, loading: loadingDocs } = useDoctors();
  const {
    upcoming,
    cancelAppointment,
    loading: loadingAppts,
    refetch: refetchAppts,
  } = useAppointments(child?.id ?? null);
  const { consultations, loading: loadingConsult, refetch: refetchConsults } = useConsultations(child?.id ?? null);
  const {
    conversations,
    loading: loadingConvos,
    refetch: refetchConvos,
    startConversation,
  } = useConversations(child?.id ?? null);
  const { requestCancel, notice: cancelNotice, cancellingId } = useCancelAppointment(cancelAppointment);

  // "Message doctor" on an appointment opens the chat directly, as on Home.
  async function messageDoctor(doctorId: string) {
    if (!child) return;
    try {
      const convo = await startConversation({ child_id: child.id, doctor_id: doctorId });
      router.push(`/chat/${convo.id}`);
    } catch {
      // Ignore: tapping again retries.
    }
  }

  // Tabs stay mounted: refresh when the tab comes back into view (after a
  // booking, a chat, or a consult the doctor just completed).
  useFocusEffect(
    useCallback(() => {
      refetchAppts();
      refetchConvos();
      refetchConsults();
    }, [refetchAppts, refetchConvos, refetchConsults]),
  );

  const headerContent = (
    <>
      <Text style={typography.heading} accessibilityRole="header">
        Consult
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
        <CancelNotice notice={cancelNotice} />
        {loadingAppts && upcoming.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : upcoming.length > 0 ? (
          upcoming.map((a) => {
            const item = { id: a.id, date: a.date, time: a.time, doctorName: a.doctors?.name ?? 'Doctor' };
            const summaryId = a.ai_summary_id;
            return (
              <AppointmentCard
                key={a.id}
                doctorName={item.doctorName}
                doctorSpecialisation={a.doctors?.specialisation ?? ''}
                date={a.date}
                time={a.time}
                onJoinVideo={() => router.push({ pathname: '/consult/video/[id]', params: { id: a.id } })}
                videoLinkReady={appointmentHasVideoLink(a)}
                onMessageDoctor={() => messageDoctor(a.doctor_id)}
                onCancel={() => requestCancel(item)}
                cancelAccessibilityLabel={cancelLabel(item)}
                cancelling={cancellingId === a.id}
                urgent={isUrgentAppointment(a)}
                onViewSummary={
                  summaryId
                    ? () => router.push({ pathname: '/consult/summary/[id]', params: { id: summaryId } })
                    : undefined
                }
              />
            );
          })
        ) : (
          <EmptyStateCard icon="calendar-outline" title="No upcoming appointments" />
        )}
      </View>

      <View style={styles.section}>
        <Text style={typography.headingSM}>Messages</Text>
        {loadingConvos && conversations.length === 0 ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={AppColors.primary} />
          </View>
        ) : conversations.length === 0 ? (
          <EmptyStateCard icon="chatbubbles-outline" title="No messages yet" />
        ) : (
          <View style={styles.listCard}>
            {conversations.map((c, i) => (
              <ConversationListItem
                key={c.id}
                id={c.id}
                doctorName={c.doctors?.name ?? 'Doctor'}
                preview={c.last_message?.content ?? null}
                previewFromParent={c.last_message?.sender === 'parent'}
                lastAt={c.last_message?.created_at ?? c.last_message_at ?? c.created_at}
                unread={c.unread_count ?? 0}
                divider={i > 0}
                onPress={(id) => router.push(`/chat/${id}`)}
              />
            ))}
          </View>
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
                onBook={(id) => router.push({ pathname: '/consult/describe', params: { doctorId: id } })}
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
                chiefComplaint={parentConsultTitle(c)}
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
