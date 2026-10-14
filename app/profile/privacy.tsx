import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { LegalDocument, type LegalSection } from '@/components/legal-document';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SettingsCard, SettingsRow } from '@/components/settings-row';
import { TextInputField } from '@/components/text-input-field';
import { AppColors, Radius } from '@/constants/theme';
import { useAuth } from '@/context/auth';
import { clearOnboardingDraft } from '@/context/onboarding';
import { notify } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { SUPPORT_EMAIL } from '@/lib/support';
import { layout, typography } from '@/styles/global';

/*
 * Privacy Policy — DRAFT FOR LAWYER REVIEW (DPDP Act 2023, IT Act 2000 /
 * SPDI Rules 2011). Every statement here must stay true of the running app:
 *   - Database, auth and files: Supabase, project region ap-south-1 (Mumbai).
 *     Supabase encrypts data at rest (AES-256) and in transit (TLS).
 *   - AI check-in: Google Gemini via the ai-checkin edge function.
 *   - Video consults: a Google Meet link from the doctor.
 *   - Push notifications: Expo push service. SMS sign-in codes: SMS provider.
 *   - No advertising or analytics SDKs are in the app today. Update this
 *     page before adding Sentry / PostHog (lib/observability.ts).
 * Do not add claims like "HIPAA compliant" or "end-to-end encrypted".
 */

const UPDATED = '13 October 2026';

const SECTIONS: readonly LegalSection[] = [
  {
    heading: 'What we collect',
    bullets: [
      'About you: your name, mobile number, city, preferred language and how you are related to the child.',
      'About your child: name, date of birth, sex, blood group, weight and height, allergies, conditions, medicines and the answers you give during set-up (such as birth history, feeding, sleep, development, diet and mood).',
      'What you add over time: vaccines, growth entries, health-log notes and photos, uploaded reports and records.',
      'Consults: AI check-in conversations and summaries, bookings, chats with the doctor, consult notes and prescriptions.',
      'Technical: a notification token so we can send you reminders, if you allow notifications.',
    ],
  },
  {
    heading: 'Why we use it',
    bullets: [
      'To run LilSteps for you: your child’s profile, vaccine schedule, growth charts and reminders.',
      'So the doctor you book with can prepare for and give the consult.',
      'To keep your account secure and to help you when you contact us.',
    ],
    paragraphs: [
      'We do not sell your data, and we do not use your child’s health information for advertising.',
    ],
  },
  {
    heading: 'Who can see it',
    bullets: [
      'You. Only you can see your children’s information in the app.',
      'Doctors you book with. A doctor can see a child’s details only after you book a consult with them, so they can prepare.',
      'Service providers who run parts of the app for us, only for that purpose: Supabase (secure database, sign-in and file storage), Google Gemini (prepares the AI check-in summary), Google Meet (video consults), Expo (push notifications) and an SMS provider (sign-in codes).',
      'Authorities, only if Indian law requires us to share it.',
    ],
  },
  {
    heading: 'How it is kept',
    paragraphs: [
      'Your data is stored with Supabase on servers in Mumbai, India. It is encrypted in transit (TLS) whenever it moves between your phone and our servers, and encrypted at rest on those servers.',
      'Access rules on our database make sure each parent can see only their own family’s data, and each doctor only the children booked with them. Files such as reports and photos are private and open only through short-lived links.',
      'Answers you give in an AI check-in are sent to Google’s Gemini service to prepare the summary, which may process them outside India.',
      'No system is perfectly secure. If a breach affects your data, we will tell you and the authorities as the law requires.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'We keep your data while your account is open. When you delete your account, we delete your account and your children’s information from LilSteps straight away.',
    ],
  },
  {
    heading: 'Your choices and rights',
    bullets: [
      'See and correct your details any time in Profile.',
      'Turn notifications off in Profile → Settings.',
      'Delete your account and all your children’s data from this page.',
      `Ask us any question about your data, or raise a concern, at ${SUPPORT_EMAIL}.`,
    ],
  },
  {
    heading: 'Children',
    paragraphs: [
      'LilSteps is for parents and legal guardians aged 18 or older. You add and manage your child’s information as their parent or guardian, and you give consent on their behalf.',
    ],
  },
  {
    heading: 'Changes to this policy',
    paragraphs: [
      'If we change how we use your data, we will update this page and tell you in the app before an important change applies.',
    ],
  },
];

type DeleteStep = 'idle' | 'confirm' | 'deleting';
const CONFIRM_WORD = 'DELETE';

/** Pulls the plain message out of an edge-function error response. */
async function functionErrorMessage(error: unknown): Promise<string> {
  const fallback = 'We could not delete your account right now. Please check your connection and try again.';
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // not JSON
    }
  }
  return fallback;
}

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  // Profile's "Delete account" row opens this page with ?section=delete:
  // scroll straight to the account section.
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const scrolledToDelete = useRef(false);
  const [step, setStep] = useState<DeleteStep>('idle');
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canDelete = typed.trim().toUpperCase() === CONFIRM_WORD;

  function cancelDeletion() {
    setStep('idle');
    setTyped('');
    setError(null);
  }

  async function deleteAccount() {
    if (!user || !canDelete || step === 'deleting') return;
    setStep('deleting');
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      'delete-account',
      { body: { confirm: CONFIRM_WORD } },
    );
    if (fnError || !data?.ok) {
      setError(fnError ? await functionErrorMessage(fnError) : (data?.error ?? 'Something went wrong. Please try again.'));
      setStep('confirm');
      return;
    }
    // The account is gone on the server. Tell the parent first (sign-out can
    // reload the web app and drop a later message), then clear this device.
    notify('Account deleted', 'Your LilSteps account and your children’s data have been deleted.');
    await clearOnboardingDraft(user.id).catch(() => undefined);
    await signOut().catch(() => undefined);
    router.replace('/');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Privacy & security" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: 32 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LegalDocument
          updated={UPDATED}
          intro="This is how LilSteps looks after your information and your child’s. In short: we collect only what we need to care for your child, the doctor you book sees it, and you can delete it all at any time."
          sections={SECTIONS}
        />

        <View style={layout.section}>
          <Text style={styles.sectionLabel}>More</Text>
          <SettingsCard>
            <SettingsRow
              icon="document-text-outline"
              tone="neutral"
              title="Terms of Service"
              chevron
              onPress={() => router.push('/profile/terms')}
            />
          </SettingsCard>
        </View>

        {/* Account deletion (App Store 5.1.1(v)): only for a signed-in parent. */}
        {user ? (
          <View
            style={layout.section}
            onLayout={(e) => {
              if (section !== 'delete' || scrolledToDelete.current) return;
              scrolledToDelete.current = true;
              const y = Math.max(0, e.nativeEvent.layout.y - 16);
              requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
            }}
          >
            <Text style={styles.sectionLabel}>Your account</Text>
            {step === 'idle' ? (
              <>
                <Text style={typography.bodySM}>
                  Deleting your account removes it and every child profile, record, check-in, booking,
                  chat and prescription linked to it. This cannot be undone.
                </Text>
                <GradientButton label="Delete my account" variant="danger" onPress={() => setStep('confirm')} />
              </>
            ) : (
              <View style={styles.confirmCard} accessibilityLiveRegion="polite">
                <Text style={[typography.title, styles.dangerTitle]} accessibilityRole="header">
                  Delete your account?
                </Text>
                <Text style={typography.bodySM}>This will permanently delete:</Text>
                <View style={styles.list}>
                  {[
                    'Your account and sign-in',
                    'All your children’s profiles and health details',
                    'Uploaded records, photos, check-ins and growth entries',
                    'Bookings, chats with doctors and prescriptions (upcoming consults are cancelled)',
                  ].map((line) => (
                    <View key={line} style={styles.listRow}>
                      <Text style={[typography.bodySM, styles.dot]}>•</Text>
                      <Text style={[typography.bodySM, styles.listText]}>{line}</Text>
                    </View>
                  ))}
                </View>
                <Text style={typography.bodySM}>
                  We cannot bring any of it back. Save any reports you want to keep first.
                </Text>
                <TextInputField
                  label={`Type ${CONFIRM_WORD} to confirm`}
                  value={typed}
                  onChangeText={setTyped}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={step !== 'deleting'}
                  error={error ?? undefined}
                />
                <GradientButton
                  label={step === 'deleting' ? 'Deleting…' : 'Delete permanently'}
                  variant="danger"
                  disabled={!canDelete}
                  loading={step === 'deleting'}
                  onPress={deleteAccount}
                  accessibilityLabel="Delete my account permanently"
                />
                <GradientButton
                  label="Keep my account"
                  variant="outline"
                  disabled={step === 'deleting'}
                  onPress={cancelDeletion}
                />
              </View>
            )}
          </View>
        ) : null}

        <Text style={[typography.caption, styles.center]}>
          Questions about your data? Write to {SUPPORT_EMAIL}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.surface },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 24 },
  sectionLabel: {
    ...typography.sectionLabel,
    color: AppColors.muted,
    marginLeft: 4,
  },
  confirmCard: {
    backgroundColor: AppColors.card,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.dangerBorder,
    padding: 16,
    gap: 12,
  },
  dangerTitle: { color: AppColors.danger },
  list: { gap: 6 },
  listRow: { flexDirection: 'row', gap: 8 },
  dot: { color: AppColors.danger },
  listText: { flex: 1 },
  center: { textAlign: 'center' },
});
