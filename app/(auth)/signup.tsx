import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { DEMO_LOGIN, toMobileDigits, useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';
import { formatPhone, isValidPhone, normalisePhone } from '@/lib/phone';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithOtp, verifyOtp } = useAuth();

  const [name, setName] = useState('');
  // The 10-digit mobile number; the field shows a fixed +91 in front.
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The code box takes focus as soon as the code is sent (R2-17). Native
  // uses autoFocus; on web it was lost while the step changed, so the field
  // (the only one-time-code input) is focused once it is on the page.
  useEffect(() => {
    if (step !== 'otp' || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const t = setTimeout(() => {
      document.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"], input[autocomplete="sms-otp"]')?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [step]);

  // One canonical number per parent: "98765 43210" and "+91 98765 43210"
  // must reach the same account (R2-04).
  function normalisedPhone() {
    return normalisePhone(phone);
  }

  async function handleSendOtp() {
    if (loading) return; // Enter and the button can both fire
    const p = normalisedPhone();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    // The format check runs in demo mode too (R3-10): only the SMS code is
    // bypassed there, so a mistyped number cannot make a second account.
    if (!isValidPhone(p)) {
      setError('Enter your 10-digit mobile number (e.g. 98765 43210)');
      return;
    }
    setLoading(true);
    setError(null);

    dbg.auth('Signup: sending OTP', { name: name.trim(), phone: p });
    const { error: err } = await signInWithOtp(p);
    setLoading(false);

    if (err) {
      dbg.authError('Signup: OTP send failed', err);
      setError(err);
    } else {
      dbg.auth('Signup: OTP sent, showing code input');
      setStep('otp');
    }
  }

  async function handleVerifyOtp() {
    if (loading) return;
    if (!DEMO_LOGIN && otp.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    setError(null);

    const p = normalisedPhone();
    dbg.auth('Signup: verifying OTP', { phone: p });
    const { error: err, isNewUser } = await verifyOtp(p, otp);

    if (err) {
      setLoading(false);
      dbg.authError('Signup: OTP verify failed', err);
      setError(err);
      return;
    }

    // Returning parent (already has at least one child): skip onboarding
    // and drop straight into the app. Don't overwrite their stored name.
    if (!isNewUser) {
      setLoading(false);
      dbg.nav('Signup → Tabs (returning user with children)');
      router.replace('/(tabs)');
      return;
    }

    // New parent: stamp the name they just typed onto the parents row.
    // The handle_new_user trigger created the row with phone only.
    dbg.db('Signup: upserting parent name');
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      const { error: upsertErr } = await supabase
        .from('parents')
        .upsert({
          id: currentUser.id,
          name: name.trim(),
          phone: p,
        }, { onConflict: 'id' });

      if (upsertErr) {
        dbg.dbError('Signup: parent upsert failed', upsertErr);
      } else {
        dbg.db('Signup: parent upsert success');
      }
    } else {
      dbg.authError('Signup: no user after OTP verify', 'currentUser is null');
    }

    setLoading(false);
    dbg.nav('Signup → Onboarding (new user)');
    router.replace('/(onboarding)/parent-details');
  }

  return (
    <View style={layout.screenContainer}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'android' ? 'height' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode="interactive"
        >
          {/* Header */}
          <View style={styles.header}>
            <HeaderIconButton
              icon="arrow-back"
              onPress={() => step === 'otp' ? setStep('details') : router.back()}
              accessibilityLabel="Go back"
            />
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            {step === 'details' ? <Sprout mood="happy" size={40} style={styles.sprout} /> : null}
            <Text style={typography.heading}>
              {step === 'details' ? 'Create your account' : 'Check your messages'}
            </Text>
            <Text style={[typography.body, styles.subtitle]}>
              {step === 'details'
                ? "A calm home for your child's health."
                : `We sent a 6-digit code to ${formatPhone(phone)}`}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {step === 'details' ? (
              <View style={styles.fields}>
                <TextInputField
                  label="Your name"
                  hint="(Parent or Guardian)"
                  hintInline
                  placeholder="e.g. Priya Sharma"
                  autoCapitalize="words"
                  autoComplete="name"
                  value={name}
                  onChangeText={setName}
                  returnKeyType="go"
                  onSubmitEditing={handleSendOtp}
                />
                <TextInputField
                  label="Phone"
                  hint="10-digit mobile number"
                  placeholder="98765 43210"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoComplete="tel"
                  leading={<Text style={styles.countryCode}>+91</Text>}
                  value={phone}
                  onChangeText={(text) => setPhone(toMobileDigits(text))}
                  returnKeyType="go"
                  onSubmitEditing={handleSendOtp}
                />
              </View>
            ) : (
              <View style={styles.fields}>
                <TextInputField
                  label="Verification code"
                  placeholder="6-digit code"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  // Web: the HTML value, so browsers offer the SMS code too.
                  autoComplete={Platform.OS === 'web' ? 'one-time-code' : 'sms-otp'}
                  maxLength={6}
                  style={styles.otpInput}
                  value={otp}
                  onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
                  returnKeyType="go"
                  onSubmitEditing={handleVerifyOtp}
                  autoFocus
                />
              </View>
            )}

            {/* Announced by screen readers as soon as it appears (R2-17). */}
            {error ? (
              <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                {error}
              </Text>
            ) : null}

            <GradientButton
              label={step === 'details' ? 'Create account' : 'Verify'}
              loading={loading}
              onPress={step === 'details' ? handleSendOtp : handleVerifyOtp}
              style={styles.submitButton}
            />

            {step === 'details' ? (
              <Text style={styles.termsText}>
                By signing up, you agree to our{' '}
                <Text style={styles.termsLink} accessibilityRole="link" onPress={() => router.push('/profile/terms')}>
                  Terms of Service
                </Text>
                {' '}and{' '}
                <Text style={styles.termsLink} accessibilityRole="link" onPress={() => router.push('/profile/privacy')}>
                  Privacy Policy
                </Text>
              </Text>
            ) : null}

            {step === 'otp' ? (
              <Pressable onPress={handleSendOtp} style={styles.resendButton} accessibilityRole="button" hitSlop={10}>
                <Text style={styles.resendText}>Didn&apos;t receive it? Resend code</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.linkText}>Sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  sprout: {
    marginBottom: 12,
  },
  countryCode: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: AppColors.onSurface,
  },
  otpInput: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  header: {
    marginLeft: -8,
  },
  titleSection: {
    marginTop: 16,
    marginBottom: 24,
  },
  subtitle: {
    marginTop: 4,
  },
  form: {},
  fields: {
    gap: 16,
  },
  submitButton: {
    marginTop: 24,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
    marginTop: 10,
    textAlign: 'center',
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: 16,
  },
  resendText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: AppColors.secondary,
  },
  termsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.muted,
    textAlign: 'center',
    marginTop: 12,
  },
  termsLink: {
    color: AppColors.secondary,
    fontFamily: 'Inter_600SemiBold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 24,
    gap: 4,
  },
  footerText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: AppColors.onSurfaceVariant,
  },
  linkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: AppColors.secondary,
  },
});
