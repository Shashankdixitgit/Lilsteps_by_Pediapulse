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
    if (!/^\+\d{10,15}$/.test(p)) {
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
    if (otp.length !== 6) {
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
      <GradientBackground />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'android' ? 'height' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode="interactive"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => step === 'otp' ? setStep('details') : router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color={AppColors.onSurface} />
            </Pressable>
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={typography.headingXL}>
              {step === 'details' ? 'Create\nAccount' : 'Enter\nCode'}
            </Text>
            <Text style={[typography.bodySM, styles.subtitle]}>
              {step === 'details'
                ? 'Join thousands of parents protecting their children\'s health'
                : `We sent a 6-digit code to ${phone}`}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {step === 'details' ? (
              <View style={styles.fields}>
                <TextInputField
                  label="Your Name"
                  hint="(Parent or Guardian)"
                  placeholder="e.g. Sarah Johnson"
                  autoCapitalize="words"
                  autoComplete="name"
                  value={name}
                  onChangeText={setName}
                />
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
              label={loading ? '' : step === 'details' ? 'Create Account' : 'Verify'}
              onPress={step === 'details' ? handleSendOtp : handleVerifyOtp}
              style={styles.submitButton}
            />
            {loading && (
              <ActivityIndicator
                color={AppColors.onPrimary}
                style={styles.loadingOverlay}
              />
            )}

            {step === 'details' && (
              <Text style={styles.termsText}>
                By signing up, you agree to our{' '}
                <Text style={styles.termsLink}>Terms of Service</Text>
                {' '}and{' '}
                <Text style={styles.termsLink}>Privacy Policy</Text>
              </Text>
            )}

            {step === 'otp' && (
              <Pressable onPress={handleSendOtp} style={styles.resendButton}>
                <Text style={styles.resendText}>Didn&apos;t receive it? Resend code</Text>
              </Pressable>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.linkText}>Sign In</Text>
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
    marginTop: 24,
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
  termsText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    color: AppColors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 18,
  },
  termsLink: {
    color: AppColors.primary,
    fontFamily: 'PlusJakartaSans_600SemiBold',
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
