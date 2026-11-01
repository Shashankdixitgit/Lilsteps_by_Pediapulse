/**
 * Create an account: name, email and password, confirmed with a code
 * emailed to the parent (SMS is off until DLT is done; the phone
 * screen is kept behind PHONE_AUTH).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  AuthError,
  AuthScreen,
  authStyles,
  CodeField,
  EmailField,
  FooterPrompt,
  PasswordField,
  ResendLink,
  TermsLine,
} from '@/components/auth/AuthShared';
import { PhoneSignupScreen } from '@/components/auth/PhoneSignupScreen';
import { GradientButton } from '@/components/gradient-button';
import { TextInputField } from '@/components/text-input-field';
import {
  demoCredentials,
  isEmailCode,
  isValidEmail,
  normaliseEmail,
  passwordProblem,
  PHONE_AUTH,
  useAuth,
} from '@/context/auth';
import { dbg } from '@/lib/debug';
import { supabase } from '@/lib/supabase';
import { DEMO_PARENT_NAME, randomDemoPhone, WEB_DEMO } from '@/lib/webDemo';

export default function SignupScreen() {
  if (PHONE_AUTH) return <PhoneSignupScreen />;
  return <EmailSignupScreen />;
}

function EmailSignupScreen() {
  const { signUpWithEmail, resendSignupCode, verifyEmailCode, updatePassword } = useAuth();

  // Web demo: filled in, with a fresh test account for each tester.
  const [demo] = useState(() => (WEB_DEMO ? demoCredentials(randomDemoPhone()) : null));
  const [name, setName] = useState(WEB_DEMO ? DEMO_PARENT_NAME : '');
  const [email, setEmail] = useState(demo?.email ?? '');
  const [password, setPassword] = useState(demo?.password ?? '');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** New parent: stamp the name they typed onto the parents row, then onboarding. */
  async function finish(isNewUser: boolean) {
    // An existing parent (already has a child) skips onboarding; their stored name stays.
    if (!isNewUser) {
      dbg.nav('Signup → Tabs (returning user with children)');
      router.replace('/(tabs)');
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: upsertErr } = await supabase
        .from('parents')
        .upsert({ id: user.id, name: name.trim(), email: normaliseEmail(email) }, { onConflict: 'id' });
      if (upsertErr) dbg.dbError('Signup: parent upsert failed', upsertErr);
    }
    dbg.nav('Signup → Onboarding (new user)');
    router.replace('/(onboarding)/parent-details');
  }

  async function handleCreate() {
    if (loading) return; // Enter and the button can both fire
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    const e = normaliseEmail(email);
    if (!isValidEmail(e)) {
      setError('Enter your email address (e.g. priya@gmail.com)');
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError(null);
    const r = await signUpWithEmail(name, e, password);
    if (r.error) {
      setLoading(false);
      setError(r.error);
      return;
    }
    if (r.needsCode) {
      setLoading(false);
      setCode('');
      setStep('code');
      return;
    }
    await finish(r.isNewUser);
    setLoading(false);
  }

  /** True when a new code went out (starts the cooldown). */
  async function handleResend(): Promise<boolean> {
    setError(null);
    const r = await resendSignupCode(email);
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
    const r = await verifyEmailCode(email, code, 'signup');
    if (r.error) {
      setLoading(false);
      setError(r.error);
      return;
    }
    // Someone may have registered this address earlier with their own
    // password; proving the code means this person owns the inbox, so the
    // password typed here becomes the account's password.
    const pw = await updatePassword(password);
    if (pw.error) dbg.authError('Signup: set password after code', pw.error);
    await finish(r.isNewUser);
    setLoading(false);
  }

  if (step === 'code') {
    return (
      <AuthScreen
        title="Check your email"
        subtitle={`We sent a code to ${normaliseEmail(email)}. It expires in 10 minutes.`}
        onBack={() => {
          setStep('details');
          setError(null);
        }}
        footer={<FooterPrompt text="Already have an account?" link="Sign in" onPress={() => router.replace('/(auth)/login')} />}
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
      title="Create your account"
      subtitle="A calm home for your child's health."
      sprout="happy"
      footer={<FooterPrompt text="Already have an account?" link="Sign in" onPress={() => router.back()} />}
    >
      <View style={authStyles.fields}>
        <TextInputField
          label="Your name"
          hint="(Parent or Guardian)"
          hintInline
          placeholder="e.g. Priya Sharma"
          autoCapitalize="words"
          autoComplete="name"
          value={name}
          onChangeText={setName}
          returnKeyType="next"
        />
        <EmailField value={email} onChangeText={setEmail} />
        <PasswordField value={password} onChangeText={setPassword} onSubmit={handleCreate} isNew />
      </View>
      <AuthError message={error} />
      <GradientButton label="Create account" loading={loading} onPress={handleCreate} style={authStyles.submitButton} />
      <TermsLine verb="signing up" />
    </AuthScreen>
  );
}
