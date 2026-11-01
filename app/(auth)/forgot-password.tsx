/**
 * Forgot password: a 6-digit code is emailed, then the parent chooses a new
 * password. Checking the code signs them in, so they land in the app.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  AuthError,
  AuthLink,
  AuthScreen,
  authStyles,
  CodeField,
  EmailField,
  PasswordField,
} from '@/components/auth/AuthShared';
import { GradientButton } from '@/components/gradient-button';
import { isValidEmail, normaliseEmail, passwordProblem, useAuth } from '@/context/auth';
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
  const [notice, setNotice] = useState<string | null>(null);

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
    if (step === 'reset') setNotice('We sent a new code.');
    setStep('reset');
  }

  async function handleReset() {
    if (loading) return;
    if (!verified && code.length !== 6) {
      setError('Please enter the 6-digit code');
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
        subtitle={`If ${normaliseEmail(email)} has a LilSteps account, we sent it a 6-digit code.`}
        onBack={() => {
          setStep('email');
          setError(null);
          setNotice(null);
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
            <AuthLink center label={notice ?? "Didn't receive it? Resend code"} onPress={handleSend} />
          </View>
        )}
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Forgot your password?" subtitle="We'll email you a 6-digit code to set a new one.">
      <View style={authStyles.fields}>
        <EmailField value={email} onChangeText={setEmail} onSubmit={handleSend} returnKeyType="go" />
      </View>
      <AuthError message={error} />
      <GradientButton label="Send code" loading={loading} onPress={handleSend} style={authStyles.submitButton} />
    </AuthScreen>
  );
}
