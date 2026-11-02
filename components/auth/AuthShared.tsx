/**
 * Shared pieces of the email sign-in screens (login, signup, forgot
 * password): the screen frame, the 6-digit code field, the password field
 * and the error line. Layout and copy match the original phone screens.
 */
import { router } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sprout } from '@/components/mascot/Sprout';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
import { EMAIL_CODE_LENGTH } from '@/context/auth';
import { layout, typography } from '@/styles/global';

export function AuthScreen({
  title,
  subtitle,
  sprout,
  onBack,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  /** Mascot above the title (first step only). */
  sprout?: 'wave' | 'happy';
  onBack?: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={layout.screenContainer}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
        >
          <View style={styles.header}>
            <HeaderIconButton
              icon="arrow-back"
              onPress={onBack ?? (() => router.back())}
              accessibilityLabel="Go back"
            />
          </View>

          <View style={styles.titleSection}>
            {sprout ? <Sprout mood={sprout} size={40} style={styles.sprout} /> : null}
            <Text style={typography.heading}>{title}</Text>
            <Text style={[typography.body, styles.subtitle]}>{subtitle}</Text>
          </View>

          <View>{children}</View>

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Announced by screen readers as soon as it appears (R2-17). */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.errorText} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      {message}
    </Text>
  );
}

/**
 * The email code (6 digits by default; up to 10 if Auth is set that way).
 * On web the field takes focus when it appears (native uses autoFocus), as
 * the phone screens did (R2-17).
 */
export function CodeField({
  value,
  onChangeText,
  onSubmit,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const t = setTimeout(() => {
      document.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <TextInputField
      label="Code from the email"
      placeholder="Code from the email"
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      maxLength={EMAIL_CODE_LENGTH.max}
      value={value}
      onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ''))}
      returnKeyType="go"
      onSubmitEditing={onSubmit}
      style={styles.otpInput}
      autoFocus
    />
  );
}

export function EmailField({
  value,
  onChangeText,
  onSubmit,
  returnKeyType = 'next',
  error,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  returnKeyType?: 'next' | 'go';
  /** Shown under the field, which turns red. */
  error?: string;
}) {
  return (
    <TextInputField
      error={error}
      label="Email"
      placeholder="you@example.com"
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="email"
      textContentType="emailAddress"
      value={value}
      onChangeText={onChangeText}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmit}
    />
  );
}

/** Password with a Show / Hide toggle. `isNew`: the browser / OS offers a strong password. */
export function PasswordField({
  value,
  onChangeText,
  onSubmit,
  isNew = false,
  label = 'Password',
  error,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  isNew?: boolean;
  label?: string;
  /** Shown under the field, which turns red (review should-fix 20). */
  error?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <View>
      <TextInputField
        error={error}
        label={label}
        hint={isNew ? 'At least 8 characters, with upper-case and lower-case letters and a number' : undefined}
        placeholder={isNew ? 'Choose a password' : 'Your password'}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={isNew ? 'new-password' : 'current-password'}
        textContentType={isNew ? 'newPassword' : 'password'}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <Pressable
        onPress={() => setShown((s) => !s)}
        style={styles.showToggle}
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Hide password' : 'Show password'}
      >
        <Text style={styles.linkText}>{shown ? 'Hide password' : 'Show password'}</Text>
      </Pressable>
    </View>
  );
}

/** A small text button (Resend code, Forgot password?, …). */
export function AuthLink({ label, onPress, center }: { label: string; onPress: () => void; center?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.target, center && styles.centerLink]}
      accessibilityRole="button"
    >
      <Text style={center ? styles.resendText : styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** Seconds to wait between "Resend code" taps (Supabase allows one email a minute). */
export const RESEND_COOLDOWN_S = 60;

/**
 * "Didn't receive it? Resend code", then "You can resend in 42 s" for a
 * minute after each send (and right after the first code goes out), so
 * repeated taps can't hit Supabase's per-minute email limit.
 */
export function ResendLink({ onResend }: { onResend: () => Promise<boolean> }) {
  const [left, setLeft] = useState(RESEND_COOLDOWN_S);
  const [busy, setBusy] = useState(false);
  const [sentAgain, setSentAgain] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (left <= 0) return;
    timer.current = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  async function tap() {
    if (busy || left > 0) return;
    setBusy(true);
    const ok = await onResend();
    setBusy(false);
    if (ok) {
      setSentAgain(true);
      setLeft(RESEND_COOLDOWN_S);
    }
  }

  const label =
    left > 0
      ? `${sentAgain ? 'We sent a new code. ' : ''}You can resend in ${left} s`
      : busy
        ? 'Sending…'
        : "Didn't receive it? Resend code";
  return (
    <Pressable
      onPress={tap}
      disabled={busy || left > 0}
      style={[styles.target, styles.centerLink]}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy || left > 0 }}
    >
      <Text style={[styles.resendText, left > 0 || busy ? styles.resendWaiting : null]}>{label}</Text>
    </Pressable>
  );
}

export function TermsLine({ verb }: { verb: 'continuing' | 'signing up' }) {
  // Two real buttons (44 high), not inline links in 12 px text, so they are
  // easy to tap (review should-fix 16).
  return (
    <View style={styles.terms}>
      <Text style={styles.termsText}>By {verb}, you agree to our</Text>
      <View style={styles.termsRow}>
        <Pressable onPress={() => router.push('/profile/terms')} accessibilityRole="link" style={styles.target}>
          <Text style={[styles.termsText, styles.termsLink]}>Terms of Service</Text>
        </Pressable>
        <Text style={styles.termsText}>and</Text>
        <Pressable onPress={() => router.push('/profile/privacy')} accessibilityRole="link" style={styles.target}>
          <Text style={[styles.termsText, styles.termsLink]}>Privacy Policy</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function FooterPrompt({ text, link, onPress }: { text: string; link: string; onPress: () => void }) {
  return (
    <>
      <Text style={styles.footerText}>{text}</Text>
      <Pressable onPress={onPress} accessibilityRole="link" style={styles.target}>
        <Text style={styles.linkText}>{link}</Text>
      </Pressable>
    </>
  );
}

export const authStyles = StyleSheet.create({
  fields: {
    gap: 16,
  },
  submitButton: {
    marginTop: 24,
  },
  links: {
    marginTop: 8,
    gap: 0,
    alignItems: 'center',
  },
});

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
  subtitle: {
    marginTop: 4,
  },
  errorText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    color: AppColors.danger,
    marginTop: 10,
    textAlign: 'center',
  },
  otpInput: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 22,
    letterSpacing: 6,
    fontVariant: ['tabular-nums'],
  },
  showToggle: {
    alignSelf: 'flex-end',
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  // Every small text button is at least 44 high (review should-fix 16).
  target: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  centerLink: {
    alignSelf: 'center',
  },
  terms: { marginTop: 12, alignItems: 'center' },
  termsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', columnGap: 4 },
  resendText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: AppColors.secondary,
  },
  resendWaiting: {
    fontFamily: 'Inter_500Medium',
    color: AppColors.muted,
  },
  termsText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.muted,
    textAlign: 'center',
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
