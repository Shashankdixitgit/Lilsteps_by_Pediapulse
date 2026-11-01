/**
 * Sign in. Email + password, or a 6-digit code emailed to the parent
 * (SMS is off until DLT is done; the phone screen is kept behind PHONE_AUTH).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import {
  AuthError,
  AuthLink,
  AuthScreen,
  authStyles,
  CodeField,
  EmailField,
  FooterPrompt,
  PasswordField,
  TermsLine,
} from '@/components/auth/AuthShared';
import { PhoneLoginScreen } from '@/components/auth/PhoneLoginScreen';
import { GradientButton } from '@/components/gradient-button';
import {
  demoCredentials,
  isValidEmail,
  normaliseEmail,
  PHONE_AUTH,
  useAuth,
  type EmailCodeKind,
} from '@/context/auth';
import { dbg } from '@/lib/debug';
import { DEMO_FAMILY_PHONE, WEB_DEMO } from '@/lib/webDemo';

/** Web demo: the sample family that already has visits and records. */
const DEMO = WEB_DEMO && DEMO_FAMILY_PHONE ? demoCredentials(DEMO_FAMILY_PHONE) : null;

export default function LoginScreen() {
  if (PHONE_AUTH) return <PhoneLoginScreen />;
  return <EmailLoginScreen />;
}

function EmailLoginScreen() {
  const { signInWithPassword, sendLoginCode, resendSignupCode, verifyEmailCode } = useAuth();

  const [email, setEmail] = useState(DEMO?.email ?? '');
  const [password, setPassword] = useState(DEMO?.password ?? '');
  const [code, setCode] = useState('');
  // 'email' = a sign-in code; 'signup' = finishing a sign-up whose address wasn't confirmed yet.
  const [codeKind, setCodeKind] = useState<EmailCodeKind | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function go(isNewUser: boolean) {
    if (isNewUser) {
      dbg.nav('Login → Onboarding (new user)');
      router.replace('/(onboarding)/parent-details');
    } else {
      dbg.nav('Login → Tabs (returning user)');
      router.replace('/(tabs)');
    }
  }

  function checkEmail(): string | null {
    const e = normaliseEmail(email);
    if (!isValidEmail(e)) {
      setError('Enter your email address (e.g. priya@gmail.com)');
      return null;
    }
    return e;
  }

  async function handlePasswordSignIn() {
    if (loading) return; // Enter and the button can both fire
    const e = checkEmail();
    if (!e) return;
    if (!password) {
      setError('Enter your password, or sign in with a code instead');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await signInWithPassword(e, password);
    setLoading(false);
    if (r.needsCode) {
      setNotice(null);
      setCode('');
      setCodeKind('signup');
      return;
    }
    if (r.error) {
      setError(r.error);
      return;
    }
    go(r.isNewUser);
  }

  async function handleSendCode() {
    if (loading) return;
    const e = checkEmail();
    if (!e) return;
    setLoading(true);
    setError(null);
    const r = codeKind === 'signup' ? await resendSignupCode(e) : await sendLoginCode(e);
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setCode('');
    if (codeKind) setNotice('We sent a new code.');
    else setCodeKind('email');
  }

  async function handleVerify() {
    if (loading || !codeKind) return;
    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await verifyEmailCode(email, code, codeKind);
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    go(r.isNewUser);
  }

  if (codeKind) {
    return (
      <AuthScreen
        title="Check your email"
        subtitle={
          codeKind === 'signup'
            ? `Your account isn't confirmed yet. We sent a 6-digit code to ${normaliseEmail(email)}`
            : `We sent a 6-digit code to ${normaliseEmail(email)}`
        }
        onBack={() => {
          setCodeKind(null);
          setError(null);
          setNotice(null);
        }}
      >
        <View style={authStyles.fields}>
          <CodeField value={code} onChangeText={setCode} onSubmit={handleVerify} />
        </View>
        <AuthError message={error} />
        <GradientButton label="Verify" loading={loading} onPress={handleVerify} style={authStyles.submitButton} />
        <View style={authStyles.links}>
          <AuthLink center label={notice ?? "Didn't receive it? Resend code"} onPress={handleSendCode} />
        </View>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Let's pick up where you left off."
      sprout="wave"
      footer={<FooterPrompt text="Don't have an account?" link="Sign up" onPress={() => router.push('/(auth)/signup')} />}
    >
      <View style={authStyles.fields}>
        <EmailField value={email} onChangeText={setEmail} />
        <PasswordField value={password} onChangeText={setPassword} onSubmit={handlePasswordSignIn} />
      </View>
      <AuthError message={error} />
      <GradientButton label="Sign in" loading={loading} onPress={handlePasswordSignIn} style={authStyles.submitButton} />
      <View style={authStyles.links}>
        <AuthLink center label="Email me a sign-in code instead" onPress={handleSendCode} />
        <AuthLink
          label="Forgot password?"
          onPress={() =>
            router.push({ pathname: '/(auth)/forgot-password', params: { email: normaliseEmail(email) } })
          }
        />
      </View>
      <TermsLine verb="continuing" />
    </AuthScreen>
  );
}
