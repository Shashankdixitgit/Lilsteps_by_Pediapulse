import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { haptic } from '@/components/ui/useMotion';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { DEMO_LOGIN, useAuth } from '@/context/auth';
import { dbg } from '@/lib/debug';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithOtp, verifyOtp } = useAuth();

  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalisedPhone() {
    return phone.replace(/[\s-]/g, '');
  }

  async function handleSendOtp() {
    const p = normalisedPhone();
    if (!DEMO_LOGIN && !/^\+\d{10,15}$/.test(p)) {
      setError('Enter your phone number in international format (e.g. +919876543210)');
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
                : `We sent a 6-digit code to ${phone}`}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {step === 'phone' ? (
              <View style={styles.fields}>
                <TextInputField
                  label="Phone"
                  hint="Include the country code"
                  placeholder="+919876543210"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoComplete="tel"
                  value={phone}
                  onChangeText={setPhone}
                  error={error ?? undefined}
                />
              </View>
            ) : (
              <View style={styles.fields}>
                <TextInputField
                  label="Verification code"
                  placeholder="000000"
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={6}
                  value={otp}
                  onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
                  style={styles.otpInput}
                  error={error ?? undefined}
                  autoFocus
                />
              </View>
            )}


            <GradientButton
              label={step === 'phone' ? 'Send code' : 'Verify'}
              loading={loading}
              onPress={step === 'phone' ? handleSendOtp : handleVerifyOtp}
              style={styles.submitButton}
            />

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
