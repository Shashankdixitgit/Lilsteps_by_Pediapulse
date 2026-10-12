import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/gradient-button';
import { Sprout } from '@/components/mascot/Sprout';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { DEMO_LOGIN, useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import { dbg } from '@/lib/debug';

export default function SignupScreen() {
  const insets = useSafeAreaInsets();
  const { signInWithOtp, verifyOtp } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalisedPhone() {
    return phone.replace(/[\s-]/g, '');
  }

  async function handleSendOtp() {
    const p = normalisedPhone();
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!DEMO_LOGIN && !/^\+\d{10,15}$/.test(p)) {
      setError('Enter your phone number in international format (e.g. +919876543210)');
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
                : `We sent a 6-digit code to ${phone}`}
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
                  placeholder="e.g. Sarah Johnson"
                  autoCapitalize="words"
                  autoComplete="name"
                  value={name}
                  onChangeText={setName}
                />
                <TextInputField
                  label="Phone"
                  hint="Include the country code"
                  placeholder="+919876543210"
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  autoComplete="tel"
                  value={phone}
                  onChangeText={setPhone}
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
                  style={styles.otpInput}
                  value={otp}
                  onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
                  autoFocus
                />
              </View>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <GradientButton
              label={step === 'details' ? 'Create account' : 'Verify'}
              loading={loading}
              onPress={step === 'details' ? handleSendOtp : handleVerifyOtp}
              style={styles.submitButton}
            />

            {step === 'details' ? (
              <Text style={styles.termsText}>
                By signing up, you agree to our{' '}
                <Text style={styles.termsLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>
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
    color: AppColors.tertiary,
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
