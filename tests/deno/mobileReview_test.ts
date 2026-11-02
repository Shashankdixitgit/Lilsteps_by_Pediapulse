// Mobile UI/UX review fixes (1 Nov 2026), pure logic only.
//   deno test --no-check --allow-env --import-map=tests/deno/import_map.json tests/deno/
import { assertEquals } from 'jsr:@std/assert@1';
import { pickedDate } from '@/lib/datePicker';
import {
  createSessionAwareFetch,
  isServerUnavailableError,
  isSessionEndedError,
  isSessionEndedResponse,
  markSessionEnded,
  sessionEndedPending,
  takeSessionEnded,
} from '@/lib/sessionEnded';
import { returnToSteps } from '@/lib/authRedirect';
import { NO_REGISTRATION_TEXT, prescriptionDoctorLines } from '@/lib/prescriptionDoctor';
import { isAllowedPushPath, pushTarget } from '@/lib/pushRoutes';
import { demoLimitText } from '@/lib/webDemo';
import { formatClockTime, formatDate } from '../../lib/date.ts';
import { isNarrowLayout } from '../../components/ui/narrowLayout.ts';
import { checkMeasure } from '../../components/growth/measurementLimits.ts';
import { isCompactTabBar } from '../../components/home/tabBarSpace.ts';

// must-fix 2: Cancel on the Android date picker
Deno.test('date picker: Cancel ("dismissed" with today) is not a choice; "set" is', () => {
  const today = new Date(2026, 10, 2);
  const picked = new Date(2025, 4, 2);
  assertEquals(pickedDate({ type: 'dismissed' }, today), null);
  assertEquals(pickedDate({ type: 'neutralButtonPressed' }, today), null);
  assertEquals(pickedDate({ type: 'set' }, undefined), null);
  assertEquals(pickedDate(undefined, picked), null);
  assertEquals(pickedDate({ type: 'set' }, picked), picked);
});

// must-fix 8: a 401 from our functions means this phone's session ended
Deno.test('session ended: only a 401 from our own functions, sent with a user token', () => {
  const fn = 'https://x.supabase.co/functions/v1/consult-payment';
  assertEquals(isSessionEndedResponse(fn, 401, true), true);
  assertEquals(isSessionEndedResponse(fn, 401, false), false, 'anon call: not a session');
  assertEquals(isSessionEndedResponse(fn, 500, true), false);
  assertEquals(isSessionEndedResponse('https://x.supabase.co/functions/v1/demo-signup', 401, true), false);
  assertEquals(isSessionEndedResponse('https://x.supabase.co/rest/v1/children', 401, true), false);
  assertEquals(isSessionEndedError({ context: { status: 401 } }), true);
  assertEquals(isSessionEndedError({ context: { status: 400 } }), false);
  assertEquals(isSessionEndedError(null), false);
  markSessionEnded();
  assertEquals(sessionEndedPending(), true);
  assertEquals(takeSessionEnded(), true);
  assertEquals(takeSessionEnded(), false, 'shown once');
});

// must-fix 12: a link opened while signed out has Home underneath on native
Deno.test('after sign-in: stack screens get the tabs underneath on native; tabs and web replace', () => {
  assertEquals(returnToSteps('/consult/updates', 'ios'), [
    { op: 'replace', href: '/(tabs)' },
    { op: 'push', href: '/consult/updates' },
  ]);
  assertEquals(returnToSteps('/prescriptions/abc?x=1', 'android')[1], { op: 'push', href: '/prescriptions/abc?x=1' });
  assertEquals(returnToSteps('/records', 'android'), [{ op: 'replace', href: '/records' }]);
  assertEquals(returnToSteps('/vaccine/', 'ios'), [{ op: 'replace', href: '/vaccine/' }]);
  assertEquals(returnToSteps('/consult/updates', 'web'), [{ op: 'replace', href: '/consult/updates' }]);
});

// must-fix 10: no placeholder text on a prescription
Deno.test('prescription: placeholders hidden, missing registration number flagged', () => {
  assertEquals(
    prescriptionDoctorLines({
      specialisation: 'Pediatrician',
      qualifications: 'Test profile · qualifications to be added',
      registration_number: null,
    }),
    { credentials: 'Pediatrician', registration: null },
  );
  assertEquals(
    prescriptionDoctorLines({ specialisation: 'Pediatrician', qualifications: 'MBBS, DCH', registration_number: ' MMC 12345 ' }),
    { credentials: 'Pediatrician · MBBS, DCH', registration: 'Reg. no. MMC 12345' },
  );
  assertEquals(prescriptionDoctorLines(null), { credentials: '', registration: null });
  assertEquals(NO_REGISTRATION_TEXT.includes('registration number'), true);
});

// must-fix 7: a plain message when the demo sign-up limit is hit
Deno.test('demo limit: plain words, pointing to the sample family when there is one', () => {
  assertEquals(demoLimitText(true).includes('I already have an account'), true);
  assertEquals(demoLimitText(false).includes('I already have an account'), false);
  assertEquals(demoLimitText(false).includes('Something went wrong'), false);
});

// should-fix 2: a tapped notification opens what it is about
Deno.test('push tap: in-app paths only; old message pushes still open the chat', () => {
  assertEquals(pushTarget({ url: '/consult' }), '/consult');
  assertEquals(pushTarget({ url: '/profile/care-plan' }), '/profile/care-plan');
  assertEquals(pushTarget({ url: '/chat/abc-123' }), '/chat/abc-123');
  assertEquals(pushTarget({ url: '/profile/edit-child' }), null, 'not on the allow-list');
  assertEquals(pushTarget({ url: '/chat/a/b' }), null);
  assertEquals(pushTarget({ url: '/chat/' }), null);
  assertEquals(pushTarget({ url: '/records/x?y=1' }), null);
  assertEquals(isAllowedPushPath('/(tabs)'), true);
  assertEquals(pushTarget({ url: 'https://evil.example' }), null);
  assertEquals(pushTarget({ url: '//evil.example' }), null);
  assertEquals(pushTarget({ type: 'message', conversationId: 'c-1' }), '/chat/c-1');
  assertEquals(pushTarget({ type: 'message', conversationId: '../x' }), null);
  assertEquals(pushTarget(null), null);
});

// should-fix 14 / 15: one date and time format on every phone
Deno.test('dates and times: "10 Sep", "4:55 PM" built by hand (Android ICU said "Sept", "pm")', () => {
  const now = new Date(2026, 10, 2);
  assertEquals(formatDate('2026-09-10', { now }), '10 Sep');
  assertEquals(formatDate('2027-01-13', { now }), '13 Jan 2027');
  assertEquals(formatDate('2026-01-13', { now, year: 'always' }), '13 Jan 2026');
  assertEquals(formatDate('', { now }), '');
  assertEquals(formatClockTime(new Date(2026, 10, 2, 16, 55)), '4:55 PM');
  assertEquals(formatClockTime(new Date(2026, 10, 2, 0, 5)), '12:05 AM');
  assertEquals(formatClockTime(new Date(2026, 10, 2, 12, 0)), '12:00 PM');
  assertEquals(formatClockTime('not a date'), '');
});

// must-fix 4-6, should-fix 8-11: the small-phone / larger-text layout
Deno.test('narrow layout: iPhone SE, 360 Android at larger text, any phone at 130%', () => {
  assertEquals(isNarrowLayout(320, 1), true);
  assertEquals(isNarrowLayout(375, 1), false);
  assertEquals(isNarrowLayout(360, 1.1), true);
  assertEquals(isNarrowLayout(430, 1.3), true);
  assertEquals(isNarrowLayout(412, 1), false);
  assertEquals(isNarrowLayout(0, 1), false, 'not measured yet');
});

// should-fix 9: at larger text the tab bar gives the labels the full width
Deno.test('tab bar: compact (AI button above) when larger text would cut the labels', () => {
  assertEquals(isCompactTabBar(375, 1), false);
  assertEquals(isCompactTabBar(320, 1), false);
  assertEquals(isCompactTabBar(320, 1.3), true);
  assertEquals(isCompactTabBar(430, 1.3), false, 'a big phone still fits them');
  assertEquals(isCompactTabBar(200, 1), true);
});

// should-fix 19: impossible values for the age are blocked, unusual ones warned
Deno.test('growth log: 0.5 kg for a 9-month-old is blocked; 4 kg warned; newborn 0.9 kg allowed', () => {
  const dob = '2026-02-01';
  const on = new Date(2026, 10, 2); // 9 months
  assertEquals(!!checkMeasure('0.5', 'kg', dob, on).error, true);
  const unusual = checkMeasure('4', 'kg', dob, on);
  assertEquals(!!unusual.error, false);
  assertEquals(!!unusual.warning, true);
  assertEquals(checkMeasure('8.6', 'kg', dob, on), {});
  assertEquals(!!checkMeasure('150', 'cm', dob, on).error, true);
  const preterm = checkMeasure('0.9', 'kg', '2026-10-20', on); // 13 days old
  assertEquals(!!preterm.error, false);
});

// PR #26 review item 2: a 401 refreshes once and retries; sign out only when that fails
const FN = 'https://x.supabase.co/functions/v1/consult-payment';
const userInit = (token = 'old') => ({ method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: '{}' });
function fakeFetch(answers: Array<{ status: number; code?: string }>) {
  const calls: string[] = [];
  const baseFetch = (_input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Headers(init?.headers).get('Authorization') ?? '');
    const a = answers.shift() ?? { status: 200 };
    return Promise.resolve(new Response(JSON.stringify(a.code ? { code: a.code } : { ok: true }), { status: a.status }));
  };
  return { calls, baseFetch };
}

Deno.test('401: refresh once, retry with the new token, stay signed in', async () => {
  const { calls, baseFetch } = fakeFetch([{ status: 401, code: 'session_ended' }, { status: 200 }]);
  let signedOut = 0;
  const f = createSessionAwareFetch({ baseFetch, anonKey: 'anon', refresh: () => Promise.resolve('new'), signOut: async () => { signedOut++; } });
  const res = await f(FN, userInit());
  assertEquals(res.status, 200);
  assertEquals(calls, ['Bearer old', 'Bearer new']);
  assertEquals(signedOut, 0);
  assertEquals(takeSessionEnded(), false);
});

Deno.test('401: refresh fails, signed out (once) with the plain message', async () => {
  const { baseFetch } = fakeFetch([{ status: 401 }]);
  let signedOut = 0;
  const f = createSessionAwareFetch({ baseFetch, anonKey: 'anon', refresh: () => Promise.resolve(null), signOut: async () => { signedOut++; } });
  const res = await f(FN, userInit());
  assertEquals(res.status, 401);
  await Promise.resolve();
  assertEquals(signedOut, 1);
  assertEquals(takeSessionEnded(), true);
});

Deno.test('401: refresh cannot reach the server (offline/5xx), stays signed in', async () => {
  for (const refresh of [() => Promise.resolve('unavailable' as const), () => Promise.reject(new Error('offline'))]) {
    const { baseFetch } = fakeFetch([{ status: 401 }]);
    let signedOut = 0;
    const f = createSessionAwareFetch({ baseFetch, anonKey: 'anon', refresh, signOut: async () => { signedOut++; } });
    const res = await f(FN, userInit());
    assertEquals(res.status, 401);
    await Promise.resolve();
    assertEquals(signedOut, 0);
    assertEquals(takeSessionEnded(), false);
  }
});

Deno.test('401: retry still says session_ended, signed out; a plain 401 retry is not', async () => {
  const a = fakeFetch([{ status: 401 }, { status: 401, code: 'session_ended' }]);
  let out = 0;
  const f = createSessionAwareFetch({ baseFetch: a.baseFetch, anonKey: 'anon', refresh: () => Promise.resolve('new'), signOut: async () => { out++; } });
  await f(FN, userInit());
  await Promise.resolve();
  assertEquals(out, 1);
  takeSessionEnded();
  const b = fakeFetch([{ status: 401 }, { status: 401 }]);
  let out2 = 0;
  const g = createSessionAwareFetch({ baseFetch: b.baseFetch, anonKey: 'anon', refresh: () => Promise.resolve('new'), signOut: async () => { out2++; } });
  await g(FN, userInit());
  assertEquals(out2, 0);
});

Deno.test('503 and anon calls never refresh or sign out', async () => {
  let refreshed = 0;
  const a = fakeFetch([{ status: 503 }, { status: 401 }]);
  const f = createSessionAwareFetch({ baseFetch: a.baseFetch, anonKey: 'anon', refresh: () => { refreshed++; return Promise.resolve('new'); }, signOut: async () => {} });
  assertEquals((await f(FN, userInit())).status, 503);
  assertEquals((await f(FN, userInit('anon'))).status, 401);
  assertEquals(refreshed, 0);
  assertEquals(isServerUnavailableError({ context: { status: 503 } }), true);
});

Deno.test('two requests failing together share one refresh', async () => {
  let refreshed = 0;
  const a = fakeFetch([{ status: 401 }, { status: 401 }, { status: 200 }, { status: 200 }]);
  const f = createSessionAwareFetch({
    baseFetch: a.baseFetch,
    anonKey: 'anon',
    refresh: () => { refreshed++; return Promise.resolve('new'); },
    signOut: async () => {},
  });
  await Promise.all([f(FN, userInit()), f(FN, userInit())]);
  assertEquals(refreshed, 1);
});
