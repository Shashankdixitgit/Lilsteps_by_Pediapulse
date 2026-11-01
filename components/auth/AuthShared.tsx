/**
 * Shared pieces of the email sign-in screens (login, signup, forgot
 * password): the screen frame, the 6-digit code field, the password field
 * and the error line. Layout and copy match the original phone screens.
 */
import { router } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sprout } from '@/components/mascot/Sprout';
import { HeaderIconButton } from '@/components/ScreenHeader';
import { TextInputField } from '@/components/text-input-field';
import { AppColors } from '@/constants/theme';
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
 * The 6-digit email code. On web the field takes focus when it appears
 * (native uses autoFocus), as the phone screens did (R2-17).
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
      placeholder="6-digit code"
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      maxLength={6}
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
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  returnKeyType?: 'next' | 'go';
}) {
  return (
    <TextInputField
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
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  isNew?: boolean;
  label?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <View>
      <TextInputField
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
        hitSlop={10}
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
      style={center ? styles.centerLink : undefined}
      accessibilityRole="button"
      hitSlop={10}
    >
      <Text style={center ? styles.resendText : styles.linkText}>{label}</Text>
    </Pressable>
  );
}

export function TermsLine({ verb }: { verb: 'continuing' | 'signing up' }) {
  return (
    <Text style={styles.termsText}>
      By {verb}, you agree to our{' '}
      <Text style={styles.termsLink} accessibilityRole="link" onPress={() => router.push('/profile/terms')}>
        Terms of Service
      </Text>
      {' '}and{' '}
      <Text style={styles.termsLink} accessibilityRole="link" onPress={() => router.push('/profile/privacy')}>
        Privacy Policy
      </Text>
    </Text>
  );
}

export function FooterPrompt({ text, link, onPress }: { text: string; link: string; onPress: () => void }) {
  return (
    <>
      <Text style={styles.footerText}>{text}</Text>
      <Pressable onPress={onPress} accessibilityRole="link" hitSlop={10}>
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
    marginTop: 16,
    gap: 14,
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
    marginTop: 8,
  },
  centerLink: {
    alignSelf: 'center',
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
