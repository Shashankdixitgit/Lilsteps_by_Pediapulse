/**
 * Sign in. Email + password, or a code emailed to the parent
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
  ResendLink,
  TermsLine,
} from '@/components/auth/AuthShared';
import { PhoneLoginScreen } from '@/components/auth/PhoneLoginScreen';
import { GradientButton } from '@/components/gradient-button';
import {
  demoCredentials,
  isEmailCode,
  isValidEmail,
  normaliseEmail,
  PHONE_AUTH,
  useAuth,
  type EmailCodeKind,
} from '@/context/auth';
import { takeReturnTo } from '@/lib/authRedirect';
import { dbg } from '@/lib/debug';
import { openReturnTo } from '@/lib/navigation';
import { DEMO_FAMILY_PHONE, WEB_DEMO } from '@/lib/webDemo';
import { SESSION_ENDED_TEXT, takeSessionEnded } from '@/lib/sessionEnded';

/** Web demo: the sample family that already has visits and records. */
const DEMO = WEB_DEMO && DEMO_FAMILY_PHONE ? demoCredentials(DEMO_FAMILY_PHONE) : null;

export default function LoginScreen() {
  if (PHONE_AUTH) return <PhoneLoginScreen />;
  return <EmailLoginScreen />;
}

function EmailLoginScreen() {
  const { signInWithPassword, sendLoginCode, resendSignupCode, verifyEmailCode, updatePassword } = useAuth();

  const [email, setEmail] = useState(DEMO?.email ?? '');
  const [password, setPassword] = useState(DEMO?.password ?? '');
  const [code, setCode] = useState('');
  // 'email' = a sign-in code; 'signup' = finishing a sign-up whose address wasn't confirmed yet.
  const [codeKind, setCodeKind] = useState<EmailCodeKind | null>(null);
  const [loading, setLoading] = useState(false);
  // Sent here because the server ended this phone's session (lib/sessionEnded).
  const [error, setError] = useState<string | null>(() => (takeSessionEnded() ? SESSION_ENDED_TEXT : null));

  function go(isNewUser: boolean) {
    // A protected link opened while signed out (AuthGate) opens now.
    const back = takeReturnTo();
    if (isNewUser) {
      // A brand-new account has nothing to show at that link yet.
      dbg.nav('Login → Onboarding (new user)');
      router.replace('/(onboarding)/parent-details');
    } else if (back) {
      dbg.nav(`Login → ${back} (returning user, requested link)`);
      openReturnTo(back);
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
    const r = await sendLoginCode(e);
    setLoading(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setCode('');
    setCodeKind('email');
  }

  /** From the code screen; true when a new code went out (starts the cooldown). */
  async function handleResend(): Promise<boolean> {
    setError(null);
    const e = normaliseEmail(email);
    const r = codeKind === 'signup' ? await resendSignupCode(e) : await sendLoginCode(e);
    if (r.error) setError(r.error);
    return !r.error;
  }

  async function handleVerify() {
    if (loading || !codeKind) return;
    if (!isEmailCode(code)) {
      setError('Please enter the code from the email');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await verifyEmailCode(email, code, codeKind);
    if (r.error) {
      setLoading(false);
      setError(r.error);
      return;
    }
    // Finishing an unconfirmed sign-up: set the password typed here, so an
    // account someone else pre-registered with this address can't keep
    // their password.
    if (codeKind === 'signup' && password) await updatePassword(password);
    setLoading(false);
    go(r.isNewUser);
  }

  if (codeKind) {
    return (
      <AuthScreen
        title="Check your email"
        subtitle={
          codeKind === 'signup'
            ? `Your account isn't confirmed yet. We sent a code to ${normaliseEmail(email)}. It expires in 10 minutes.`
            : `If an account exists for ${normaliseEmail(email)}, we've sent a code to it. It expires in 10 minutes.`
        }
        onBack={() => {
          setCodeKind(null);
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
