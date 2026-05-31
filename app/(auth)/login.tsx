import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientBackground } from '@/components/gradient-background';
import { GradientButton } from '@/components/gradient-button';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { layout, typography } from '@/styles/global';
import { useAuth } from '@/context/auth';
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
    if (!/^\+\d{10,15}$/.test(p)) {
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
    if (otp.length !== 6) {
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
      <GradientBackground />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => step === 'otp' ? setStep('phone') : router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color={AppColors.onSurface} />
            </Pressable>
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={typography.headingXL}>
              {step === 'phone' ? 'Welcome\nBack' : 'Enter\nCode'}
            </Text>
            <Text style={[typography.bodySM, styles.subtitle]}>
              {step === 'phone'
                ? 'Sign in with your phone number to continue'
                : `We sent a 6-digit code to ${phone}`}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {step === 'phone' ? (
              <View style={styles.fields}>
                <TextInputField
                  label="Phone"
                  hint="(with country code)"
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
                  label="Verification Code"
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={(text) => setOtp(text.replace(/[^0-9]/g, ''))}
                  autoFocus
                />
              </View>
            )}

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <GradientButton
              label={loading ? '' : step === 'phone' ? 'Send Code' : 'Verify'}
              onPress={step === 'phone' ? handleSendOtp : handleVerifyOtp}
              style={styles.submitButton}
            />
            {loading && (
              <ActivityIndicator
                color={AppColors.onPrimary}
                style={styles.loadingOverlay}
              />
            )}

            {step === 'otp' && (
              <Pressable onPress={handleSendOtp} style={styles.resendButton}>
                <Text style={styles.resendText}>Didn&apos;t receive it? Resend code</Text>
              </Pressable>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Don&apos;t have an account?</Text>
            <Pressable onPress={() => router.push('/(auth)/signup')}>
              <Text style={styles.linkText}>Sign Up</Text>
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
    paddingHorizontal: 24,
  },
  header: {
    marginBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${AppColors.surfaceContainerLowest}B3`,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: `${AppColors.outlineVariant}26`,
  },
  titleSection: {
    marginTop: 24,
    marginBottom: 32,
  },
  subtitle: {
    marginTop: 8,
  },
  form: {},
  fields: {
    gap: 14,
  },
  submitButton: {
    marginTop: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
  },
  errorText: {
    fontFamily: 'PlusJakartaSans_500Medium',
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: AppColors.primary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 32,
    gap: 4,
  },
  footerText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    color: AppColors.onSurfaceVariant,
  },
  linkText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: AppColors.primary,
  },
});
