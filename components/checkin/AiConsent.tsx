import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GradientButton, TextButton } from '@/components/gradient-button';
import { AppColors, FontFamily, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { typography } from '@/styles/global';

/**
 * R2-09 (Apple 5.1.2(i)): the parent agrees once, before the first check-in,
 * that their answers are sent to Google Gemini. Stored on
 * parents.ai_consent_at (0039) through record_ai_consent(), so it is asked
 * once per account, not once per phone.
 *
 * `status`: 'loading' until the row is read; 'needed' when not yet agreed;
 * 'given' after. A read error counts as 'needed' (asking again is safe).
 */
export function useAiConsent() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [status, setStatus] = useState<'loading' | 'needed' | 'given'>('loading');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('parents')
        .select('ai_consent_at')
        .eq('id', userId)
        .maybeSingle<{ ai_consent_at: string | null }>();
      if (!cancelled) setStatus(data?.ai_consent_at ? 'given' : 'needed');
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const agree = useCallback(async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('record_ai_consent');
    setSaving(false);
    if (err) {
      setError("Couldn't save your choice. Check your internet and try again.");
      return;
    }
    setStatus('given');
  }, []);

  return { status, saving, error, agree };
}

export interface AiConsentCardProps {
  saving: boolean;
  error: string | null;
  onAgree: () => void;
}

/** The one-time consent step shown in place of the symptom picker. */
export function AiConsentCard({ saving, error, onAgree }: AiConsentCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Ionicons name="shield-checkmark-outline" size={20} color={AppColors.secondary} style={styles.icon} />
        <Text style={[typography.headingSM, styles.title]} accessibilityRole="header">
          Before your first check-in
        </Text>
      </View>
      <Text style={typography.bodySM}>
        The check-in uses an AI service, Google Gemini, to ask follow-up questions and write a short summary of what
        you share.
      </Text>
      <View style={styles.points}>
        <Point text="Your answers and your child's age, allergies and conditions are sent to Google Gemini." />
        <Point text="Google processes this data on servers outside India." />
        <Point text="It is not a diagnosis. If you book, the doctor reads your summary." />
        <Point text="You can skip the check-in and book a doctor directly instead." />
      </View>
      <TextButton
        label="Read our Privacy Policy"
        chevron
        onPress={() => router.push('/profile/privacy')}
        accessibilityLabel="Read our Privacy Policy, opens the privacy page"
        style={styles.link}
      />
      {error ? (
        <Text style={[typography.bodySM, styles.error]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <GradientButton
        label="Agree and continue"
        onPress={onAgree}
        loading={saving}
        disabled={saving}
        accessibilityLabel="Agree that my check-in answers are processed by Google Gemini, and continue"
      />
      <TextButton label="Book a doctor without the check-in" onPress={() => router.push('/consult/booking')} />
    </View>
  );
}

function Point({ text }: { text: string }) {
  return (
    <View style={styles.point}>
      <Text style={typography.bodySM}>•</Text>
      <Text style={[typography.bodySM, styles.pointText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    backgroundColor: AppColors.card,
  },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  icon: { marginTop: 1 },
  title: { flex: 1, minWidth: 0 },
  points: { gap: 6 },
  point: { flexDirection: 'row', gap: 8 },
  pointText: { flex: 1, minWidth: 0 },
  link: { alignSelf: 'flex-start' },
  error: { color: AppColors.danger, fontFamily: FontFamily.medium },
});
