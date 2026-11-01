/**
 * Forgot password: a code is emailed, then the parent chooses a new
 * password. Checking the code signs them in, so they land in the app.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  AuthError,
  AuthScreen,
  authStyles,
  CodeField,
  EmailField,
  PasswordField,
  ResendLink,
} from '@/components/auth/AuthShared';
import { GradientButton } from '@/components/gradient-button';
import { isEmailCode, isValidEmail, normaliseEmail, passwordProblem, useAuth } from '@/context/auth';
import { dbg } from '@/lib/debug';

export default function ForgotPasswordScreen() {
  const { sendPasswordResetCode, verifyEmailCode, updatePassword } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();

  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'reset'>('email');
  // The code is checked once; a second try (e.g. after a password the server
  // refused) only sets the password again.
  const [verified, setVerified] = useState<{ isNewUser: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (loading) return;
    const e = normaliseEmail(email);
    if (!isValidEmail(e)) {
      setError('Enter the email address you signed up with');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await sendPasswordResetCode(e);
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setStep('reset');
  }

  /** True when a new code went out (starts the cooldown). */
  async function handleResend(): Promise<boolean> {
    setError(null);
    const r = await sendPasswordResetCode(email);
    if (r.error) setError(r.error);
    return !r.error;
  }

  async function handleReset() {
    if (loading) return;
    if (!verified && !isEmailCode(code)) {
      setError('Please enter the code from the email');
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    let v = verified;
    if (!v) {
      const r = await verifyEmailCode(email, code, 'recovery');
      if (r.error) {
        setLoading(false);
        setError(r.error);
        return;
      }
      v = { isNewUser: r.isNewUser };
      setVerified(v);
    }
    const u = await updatePassword(password);
    setLoading(false);
    if (u.error) {
      setError(u.error);
      return;
    }
    dbg.nav('Forgot password → app');
    router.replace(v.isNewUser ? '/(onboarding)/parent-details' : '/(tabs)');
  }

  if (step === 'reset') {
    return (
      <AuthScreen
        title="Choose a new password"
        subtitle={
          verified
            ? 'Code accepted. Choose your new password.'
            : `If ${normaliseEmail(email)} has a LilSteps account, we sent it a code. It expires in 10 minutes.`
        }
        onBack={() => {
          setStep('email');
          setError(null);
        }}
      >
        <View style={authStyles.fields}>
          {verified ? null : <CodeField value={code} onChangeText={setCode} onSubmit={handleReset} />}
          <PasswordField label="New password" value={password} onChangeText={setPassword} onSubmit={handleReset} isNew />
        </View>
        <AuthError message={error} />
        <GradientButton label="Save new password" loading={loading} onPress={handleReset} style={authStyles.submitButton} />
        {verified ? null : (
          <View style={authStyles.links}>
            <ResendLink onResend={handleResend} />
          </View>
        )}
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Forgot your password?" subtitle="We'll email you a code to set a new one.">
      <View style={authStyles.fields}>
        <EmailField value={email} onChangeText={setEmail} onSubmit={handleSend} returnKeyType="go" />
      </View>
      <AuthError message={error} />
      <GradientButton label="Send code" loading={loading} onPress={handleSend} style={authStyles.submitButton} />
    </AuthScreen>
  );
}
