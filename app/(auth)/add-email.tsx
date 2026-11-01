/**
 * Add your email — for parents who signed up by phone before SMS was
 * switched off. A code goes to the new address (Supabase "Change email
 * address" template); once it's checked, the parent chooses a password so
 * they can sign in again by email. Booking emails then reach them too.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  AuthError,
  AuthLink,
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

export default function AddEmailScreen() {
  const { addEmail, verifyEmailCode, updatePassword, hasChildren, user, session, loading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function continueIntoApp() {
    const target = hasChildren ? '/(tabs)' : '/(onboarding)/parent-details';
    dbg.nav(`AddEmail → ${target}`);
    router.replace(target as '/(tabs)');
  }

  // Opened directly (e.g. /add-email) by someone who has nothing to do here:
  // already has an email → into the app; not signed in → sign-in.
  const hasEmail = !!user?.email;
  useEffect(() => {
    if (authLoading || step !== 'email') return;
    if (!session) {
      router.replace('/(auth)/login');
      return;
    }
    if (hasEmail && hasChildren !== null) continueIntoApp();
    // continueIntoApp only reads hasChildren.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session, hasEmail, hasChildren, step]);

  async function handleSend() {
    if (loading) return;
    const e = normaliseEmail(email);
    if (!isValidEmail(e)) {
      setError('Enter your email address (e.g. priya@gmail.com)');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await addEmail(e);
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setCode('');
    setStep('code');
  }

  /** True when a new code went out (starts the cooldown). */
  async function handleResend(): Promise<boolean> {
    setError(null);
    const r = await addEmail(email);
    if (r.error) setError(r.error);
    return !r.error;
  }

  async function handleVerify() {
    if (loading) return;
    if (!isEmailCode(code)) {
      setError('Please enter the code from the email');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await verifyEmailCode(email, code, 'email_change');
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    // verifyEmailCode also copies the address onto the parents row.
    setStep('password');
  }

  async function handlePassword() {
    if (loading) return;
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    const r = await updatePassword(password);
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    continueIntoApp();
  }

  if (step === 'password') {
    return (
      <AuthScreen
        title="Choose a password"
        subtitle={`Next time, sign in with ${normaliseEmail(email)} and this password.`}
        onBack={continueIntoApp}
      >
        <View style={authStyles.fields}>
          <PasswordField value={password} onChangeText={setPassword} onSubmit={handlePassword} isNew />
        </View>
        <AuthError message={error} />
        <GradientButton label="Save password" loading={loading} onPress={handlePassword} style={authStyles.submitButton} />
      </AuthScreen>
    );
  }

  if (step === 'code') {
    return (
      <AuthScreen
        title="Check your email"
        subtitle={`We sent a code to ${normaliseEmail(email)}. It expires in 10 minutes.`}
        onBack={() => {
          setStep('email');
          setError(null);
        }}
      >
        <View style={authStyles.fields}>
          <CodeField value={code} onChangeText={setCode} onSubmit={handleVerify} />
        </View>
        <AuthError message={error} />
        <GradientButton label="Verify" loading={loading} onPress={handleVerify} style={authStyles.submitButton} />
        <View style={authStyles.links}>
          <ResendLink onResend={handleResend} />
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Add your email"
      subtitle="LilSteps now signs you in and sends booking updates by email. Add yours to keep getting them."
      sprout="wave"
      onBack={continueIntoApp}
    >
      <View style={authStyles.fields}>
        <EmailField value={email} onChangeText={setEmail} onSubmit={handleSend} returnKeyType="go" />
      </View>
      <AuthError message={error} />
      <GradientButton label="Send code" loading={loading} onPress={handleSend} style={authStyles.submitButton} />
      <View style={authStyles.links}>
        <AuthLink label="Not now" onPress={continueIntoApp} />
      </View>
    </AuthScreen>
  );
}
