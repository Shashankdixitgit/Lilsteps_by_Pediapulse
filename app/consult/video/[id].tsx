// Parent-side video consultation entry.
//
// Opens the doctor's Google Meet (or whichever conferencing URL the doctor
// has saved in their dashboard Settings). The doctor admits the parent from
// the Meet waiting room.
//
// No 100ms, no /v/<code>, no localhost juggling. The Meet URL is HTTPS-hosted
// by Google, deep-links into the Meet app on iOS / Android, falls back to
// the browser otherwise.

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { supabase } from '@/lib/supabase';

export default function ParentVideoScreen() {
  const insets = useSafeAreaInsets();
  const { id: appointmentId } = useLocalSearchParams<{ id: string }>();
  const [meetLink, setMeetLink] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState<string>('your doctor');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appointmentId) return;
    (async () => {
      setLoading(true);
      // Preference order:
      //   1. appointments.meet_link — per-appointment, created by the
      //      create-meet-event Edge Function from the doctor's Calendar
      //   2. doctors.default_meet_link — the manual permanent room
      const { data, error: err } = await supabase
        .from('appointments')
        .select('meet_link, doctors(name, default_meet_link)')
        .eq('id', appointmentId)
        .maybeSingle<{
          meet_link: string | null;
          doctors: { name: string; default_meet_link: string | null } | null;
        }>();

      if (err) {
        // Copy only: show a friendly line instead of the raw database message.
        setError("We couldn't open this video room. Please go back and try again.");
      } else {
        if (data?.doctors?.name) setDoctorName(data.doctors.name);
        const link = data?.meet_link ?? data?.doctors?.default_meet_link ?? null;
        if (link) setMeetLink(link);
        else setError(
          `${data?.doctors?.name ?? 'The doctor'} hasn't set up a video room yet. ` +
            'Please send them a message to reschedule.',
        );
      }
      setLoading(false);
    })();
  }, [appointmentId]);

  function openRoom() {
    if (meetLink) Linking.openURL(meetLink);
  }

  return (
    <View style={[layout.screenContainer, { paddingTop: insets.top }]}>
      <ScreenHeader title="Video consult" />

      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator color={AppColors.primary} />
        ) : error ? (
          <Text style={[typography.body, styles.errorText]}>{error}</Text>
        ) : (
          <>
            <View style={styles.iconWrap}>
              <Ionicons name="videocam" size={28} color={AppColors.primary} />
            </View>
            <Text style={[typography.headingSM, styles.center]}>Ready to connect</Text>
            <Text style={[typography.bodySM, styles.center]}>
              You&apos;ll join {doctorName} in Google Meet. They&apos;ll let you in from the waiting room.
            </Text>
            <GradientButton label="Open Meet" onPress={openRoom} style={styles.joinBtn} />
          </>
        )}
      </View>
    </View>
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
  joinBtn: { marginTop: 16, alignSelf: 'stretch' },
});
