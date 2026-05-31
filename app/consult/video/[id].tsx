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
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '@/components/gradient-background';
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
        setError(err.message);
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
    <View style={layout.screenContainer}>
      <GradientBackground />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={AppColors.onSurface} />
        </Pressable>
        <Text style={typography.headingMD}>Video consult</Text>
      </View>

      <View style={styles.body}>
        {loading ? (
          <ActivityIndicator color={AppColors.primary} />
        ) : error ? (
          <Text style={[typography.bodyMD, styles.errorText]}>{error}</Text>
        ) : (
          <>
            <View style={styles.iconWrap}>
              <Ionicons name="videocam" size={36} color={AppColors.primary} />
            </View>
            <Text style={[typography.headingMD, styles.title]}>Ready to connect</Text>
            <Text style={[typography.bodySM, styles.subtitle]}>
              You&apos;ll join {doctorName} in Google Meet. They&apos;ll let you in from the waiting room.
            </Text>

            <Pressable
              style={({ pressed }) => [styles.joinBtn, { opacity: pressed ? 0.85 : 1 }]}
              onPress={openRoom}
            >
              <Ionicons name="videocam" size={18} color={AppColors.onPrimary} />
              <Text style={styles.joinBtnText}>Open Meet</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${AppColors.surfaceContainerLowest}B3`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${AppColors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { textAlign: 'center' },
  subtitle: {
    textAlign: 'center',
    color: AppColors.onSurfaceVariant,
    lineHeight: 22,
  },
  errorText: { color: AppColors.tertiary, textAlign: 'center', lineHeight: 22 },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: AppColors.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 9999,
    marginTop: 8,
  },
  joinBtnText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: AppColors.onPrimary,
  },
});
