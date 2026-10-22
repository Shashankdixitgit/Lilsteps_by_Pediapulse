import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { haptic } from '@/components/ui/useMotion';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { DEMO_LOGIN, toMobileDigits, useAuth } from '@/context/auth';
import { dbg } from '@/lib/debug';
import { DEMO_FAMILY_PHONE, DEMO_OTP, WEB_DEMO } from '@/lib/webDemo';
import { formatPhone, isValidPhone, normalisePhone } from '@/lib/phone';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithOtp, verifyOtp } = useAuth();

  // The 10-digit mobile number; the field shows a fixed +91 in front.
  // Web demo: the sample family that already has visits and records.
  const [phone, setPhone] = useState(WEB_DEMO ? DEMO_FAMILY_PHONE : '');
  const [otp, setOtp] = useState(WEB_DEMO ? DEMO_OTP : '');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
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
    // The format check runs in demo mode too (R3-10): only the SMS code is
    // bypassed there, so a mistyped number cannot make a second account.
    if (!isValidPhone(p)) {
      setError('Enter your 10-digit mobile number (e.g. 98765 43210)');
      return;
    }
    setLoading(true);
    setError(null);

    dbg.auth('Login: sending OTP', { phone: p });
    const { error: err } = await signInWithOtp(p);
    setLoading(false);

    if (err) {
      dbg.authError('Login: OTP send failed', err);
      setError(err);
    } else {
      dbg.auth('Login: OTP sent, showing code input');
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
    dbg.auth('Login: verifying OTP', { phone: p, otpLength: otp.length });
    const { error: err, isNewUser } = await verifyOtp(p, otp);
    setLoading(false);

    if (err) {
      dbg.authError('Login: OTP verify failed', err);
      haptic('warning');
      setError(err);
    } else if (isNewUser) {
      dbg.nav('Login → Onboarding (new user)');
      router.replace('/(onboarding)/parent-details');
    } else {
      dbg.nav('Login → Tabs (returning user)');
      router.replace('/(tabs)');
    }
  }

  return (
    <View style={layout.screenContainer}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <HeaderIconButton
              icon="arrow-back"
              onPress={() => step === 'otp' ? setStep('phone') : router.back()}
              accessibilityLabel="Go back"
            />
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            {step === 'phone' ? <Sprout mood="wave" size={40} style={styles.sprout} /> : null}
            <Text style={typography.heading}>
              {step === 'phone' ? 'Welcome back' : 'Check your messages'}
            </Text>
            <Text style={[typography.body, styles.subtitle]}>
              {step === 'phone'
                ? "Let's pick up where you left off."
                : `We sent a 6-digit code to ${formatPhone(phone)}`}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {step === 'phone' ? (
              <View style={styles.fields}>
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
                  value={otp}
                  onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
                  returnKeyType="go"
                  onSubmitEditing={handleVerifyOtp}
                  style={styles.otpInput}
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
              label={step === 'phone' ? 'Send code' : 'Verify'}
              loading={loading}
              onPress={step === 'phone' ? handleSendOtp : handleVerifyOtp}
              style={styles.submitButton}
            />

            {/* A new number signs up from here too, so the agreement shows on login as well. */}
            {step === 'phone' ? (
              <Text style={styles.termsText}>
                By continuing, you agree to our{' '}
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
            <Text style={styles.footerText}>Don&apos;t have an account?</Text>
            <Pressable onPress={() => router.push('/(auth)/signup')} accessibilityRole="link" hitSlop={10}>
              <Text style={styles.linkText}>Sign up</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
    marginTop: 10,
    textAlign: 'center',
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
  resendButton: {
    alignSelf: 'center',
    marginTop: 16,
  },
  resendText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: AppColors.secondary,
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
