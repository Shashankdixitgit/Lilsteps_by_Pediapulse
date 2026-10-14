// Parent-side video consultation entry.
//
// Opens the doctor's Google Meet (or whichever conferencing URL the doctor
// has saved in their dashboard Settings). The doctor admits the parent from
// the Meet waiting room.
//
// The link comes from get_my_appointment_meet_link (0035): the per-booking
// Meet link (create-meet-event) or the doctor's room, only for the parent's
// own non-cancelled consult and only inside the join window. Parents can't
// read doctors.default_meet_link directly. Join is only active from JOIN_OPENS_MINUTES before the start time; until
// then (or if no link is set yet) the screen says when it opens and offers
// Message doctor, so it is never a dead end.

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  appointmentEnded,
  appointmentStart,
  canJoinVideo,
  CONSULT_MINUTES,
  doctorShortName,
  JOIN_OPENS_MINUTES,
  whenLabel,
} from '@/components/consult/appointmentFormat';
import { GradientButton, TextButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors } from '@/constants/theme';
import { useChild } from '@/context/child';
import { useConversations } from '@/hooks/useConversations';
import { supabase } from '@/lib/supabase';
import { layout, typography } from '@/styles/global';

interface VideoAppointment {
  id: string;
  child_id: string;
  doctor_id: string;
  date: string;
  time: string;
  status: 'upcoming' | 'completed' | 'cancelled' | 'no_show';
  doctors: { name: string } | null;
}

/** Why the consult couldn't be loaded; each gets its own message (R2-21). */
type LoadFailure = 'auth' | 'network' | 'notFound' | 'other';

function failureOf(err: { message?: string; code?: string; status?: number } | null | undefined): LoadFailure {
  if (!err) return 'other';
  const msg = (err.message ?? '').toLowerCase();
  if (err.status === 401 || err.code === 'PGRST301' || err.code === '42501' || /jwt|token|not signed in|auth/.test(msg)) {
    return 'auth';
  }
  if (/network|failed to fetch|fetch failed|timeout|timed out|offline/.test(msg)) return 'network';
  return 'other';
}

const FAILURE_TEXT: Record<LoadFailure, string> = {
  auth: 'Your sign-in has expired. Please sign in again to open this consult.',
  network: "We couldn't reach LilSteps. Check your internet and try again.",
  notFound: "We couldn't find this consult. It may have been cancelled.",
  other: "Something went wrong opening this consult. Please try again.",
};

/** get_my_appointment_meet_link: link is null outside the join window. */
interface MeetLinkInfo {
  has_link: boolean;
  link: string | null;
}

export default function ParentVideoScreen() {
  const insets = useSafeAreaInsets();
  const { id: appointmentId } = useLocalSearchParams<{ id: string }>();
  const [appt, setAppt] = useState<VideoAppointment | null>(null);
  const [meet, setMeet] = useState<MeetLinkInfo | null>(null);
  const [loadError, setLoadError] = useState<LoadFailure | null>(null);
  // The window is open on this phone but the server held the link back
  // after a fresh check: the phone's clock is probably wrong (R2-21).
  const [clockSuspect, setClockSuspect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [openingChat, setOpeningChat] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { startConversation } = useConversations(appt?.child_id ?? null);
  const { children } = useChild();
  const forChild = children.find((c) => c.id === appt?.child_id)?.name;

  const load = useCallback(async () => {
    if (!appointmentId) return;
    setLoading(true);
    setLoadError(null);
    const [{ data, error }, linkRes] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, child_id, doctor_id, date, time, status, doctors(name)')
        .eq('id', appointmentId)
        .maybeSingle<VideoAppointment>(),
      supabase.rpc('get_my_appointment_meet_link', { p_appointment_id: appointmentId }),
    ]);
    if (error || linkRes.error) {
      const { data: sessionData } = await supabase.auth.getSession();
      setLoadError(sessionData.session ? failureOf(error ?? linkRes.error) : 'auth');
    } else if (!data) setLoadError('notFound');
    else {
      const info = (linkRes.data as MeetLinkInfo | null) ?? { has_link: false, link: null };
      setAppt(data);
      setMeet(info);
      setClockSuspect(info.has_link && !info.link && canJoinVideo(data.date, data.time, new Date()));
    }
    setLoading(false);
  }, [appointmentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Re-check the clock (and the link, which may be added late) every 30 s so
  // Join switches on by itself.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const hasLink = !!meet?.has_link;
  const link = meet?.link ?? null;
  const joinOpen = !!appt && canJoinVideo(appt.date, appt.time, now);
  const ended = !!appt && appointmentEnded(appt.date, appt.time, now) && !joinOpen;
  // The doctor closed the visit before its time was up (R2-12).
  const closedEarly =
    !!appt && appt.status === 'completed' && now.getTime() < appointmentStart(appt.date, appt.time).getTime() + CONSULT_MINUTES * 60_000;

  useEffect(() => {
    // The server hands out the link only inside the join window, and the
    // doctor may add one late: fetch again when the window opens.
    if (appt && !link && joinOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinOpen]);

  async function openRoom() {
    if (!link) return;
    setActionError(null);
    try {
      await Linking.openURL(link);
    } catch {
      setActionError("Couldn't open the video link. Please try again.");
    }
  }

  async function messageDoctor() {
    if (!appt || openingChat) return;
    setOpeningChat(true);
    setActionError(null);
    try {
      const convo = await startConversation({
        child_id: appt.child_id,
        doctor_id: appt.doctor_id,
        appointment_id: appt.id,
      });
      router.push(`/chat/${convo.id}`);
    } catch {
      setActionError("Couldn't open the chat. Please try again.");
    } finally {
      setOpeningChat(false);
    }
  }

  async function openVisitSummary() {
    if (!appt) return;
    setActionError(null);
    const { data } = await supabase
      .from('consultations')
      .select('id')
      .eq('appointment_id', appt.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();
    if (data) router.push({ pathname: '/consult/[id]', params: { id: data.id } });
    else setActionError("The visit summary isn't ready yet. Please check again in a few minutes.");
  }

  const doctorName = appt?.doctors?.name ?? 'your doctor';
  const messageLabel = `Message ${doctorShortName(appt?.doctors?.name)}`;

  function renderBody() {
    if (loading && !appt) return <ActivityIndicator color={AppColors.primary} />;
    if (loadError || !appt) {
      return (
        <>
          <Text style={[typography.body, styles.errorText]} accessibilityRole="alert">
            {FAILURE_TEXT[loadError ?? 'other']}
          </Text>
          {loadError === 'auth' ? (
            <GradientButton label="Sign in again" onPress={() => router.replace('/(auth)/login')} style={styles.wide} />
          ) : (
            <GradientButton label="Try again" variant="outline" onPress={load} style={styles.wide} />
          )}
        </>
      );
    }

    const when = whenLabel(appt.date, appt.time, now);

    if (appt.status === 'cancelled') {
      return (
        <StatusBlock icon="close-circle-outline" title="This consult was cancelled" body={when}>
          <TextButton label="Back" onPress={() => router.back()} />
        </StatusBlock>
      );
    }

    if (closedEarly) {
      const short = doctorShortName(appt.doctors?.name);
      return (
        <StatusBlock
          icon="document-text-outline"
          title="Visit closed"
          body={`${short} closed this visit early. Read the visit summary for the doctor's notes.`}
        >
          <GradientButton label="Read the visit summary" onPress={openVisitSummary} style={styles.wide} />
          <TextButton label={messageLabel} onPress={messageDoctor} />
        </StatusBlock>
      );
    }

    if (ended || appt.status === 'completed' || appt.status === 'no_show') {
      return (
        <StatusBlock
          icon="checkmark-done-outline"
          title="This consult has ended"
          body={`${when}. Questions afterwards? Message ${doctorShortName(appt.doctors?.name)}.`}
        >
          <GradientButton label={messageLabel} onPress={messageDoctor} loading={openingChat} style={styles.wide} />
        </StatusBlock>
      );
    }

    if (!hasLink) {
      return (
        <StatusBlock
          icon="videocam-outline"
          title="No video link yet"
          body={`${when} · Video · ${CONSULT_MINUTES} min. ${doctorName} hasn't added a video link yet. The Join button shows here as soon as they do. You can message them to check.`}
        >
          <GradientButton label={messageLabel} variant="outline" onPress={messageDoctor} loading={openingChat} style={styles.wide} />
        </StatusBlock>
      );
    }

    if (!joinOpen) {
      return (
        <StatusBlock
          icon="time-outline"
          title={`Join opens ${JOIN_OPENS_MINUTES} min before`}
          body={`${when} · Video · ${CONSULT_MINUTES} min with ${doctorName} on Google Meet. Come back here a few minutes before the start.`}
        >
          <GradientButton label="Join video" onPress={openRoom} disabled style={styles.wide} />
          <TextButton label={messageLabel} onPress={messageDoctor} />
        </StatusBlock>
      );
    }

    if (!link) {
      // Window open on this phone but no link: either the refetch is in
      // flight, or the server (which uses its own clock) says it's too early
      // or too late, so the phone's clock is likely off.
      return (
        <StatusBlock
          icon={clockSuspect ? 'time-outline' : 'videocam-outline'}
          title={clockSuspect ? "Check your phone's time" : 'Getting your video link'}
          body={
            clockSuspect
              ? `${when} · Video · ${CONSULT_MINUTES} min with ${doctorName}. The link opens ${JOIN_OPENS_MINUTES} min before the start, but your phone's clock seems to differ from ours. Set the time to automatic in your phone settings, then try again.`
              : `${when} · Video · ${CONSULT_MINUTES} min with ${doctorName}.`
          }
        >
          <GradientButton label="Try again" variant="outline" onPress={load} loading={loading} style={styles.wide} />
          <TextButton label={messageLabel} onPress={messageDoctor} />
        </StatusBlock>
      );
    }

    return (
      <StatusBlock
        icon="videocam"
        title="Ready to connect"
        body={`You'll join ${doctorName} in Google Meet. They'll let you in from the waiting room.`}
      >
        <GradientButton label="Join video" onPress={openRoom} style={styles.wide} />
        <Text style={[typography.meta, styles.center]}>
          On a phone, you may need the Google Meet app (free on the App Store and Google Play).
        </Text>
        <TextButton label={messageLabel} onPress={messageDoctor} />
      </StatusBlock>
    );
  }

  return (
    <View style={[layout.screenContainer, { paddingTop: insets.top }]}>
      <ScreenHeader title="Video consult" subtitle={forChild ? `For ${forChild}` : undefined} />

      <View style={styles.body}>
        {renderBody()}
        {actionError ? (
          <Text style={[typography.bodySM, styles.errorText]} accessibilityRole="alert">
            {actionError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function StatusBlock({
  icon,
  title,
  body,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={AppColors.primary} />
      </View>
      <Text style={[typography.headingSM, styles.center]} accessibilityRole="header">
        {title}
      </Text>
      <Text style={[typography.bodySM, styles.center]}>{body}</Text>
      <View style={styles.actions}>{children}</View>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AppColors.mintSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  center: { textAlign: 'center' },
  errorText: { color: AppColors.danger, textAlign: 'center' },
  actions: { marginTop: 16, alignSelf: 'stretch', alignItems: 'center', gap: 4 },
  wide: { alignSelf: 'stretch' },
});
