// Mobile UI/UX review fixes (1 Nov 2026), pure logic only.
//   deno test --no-check --allow-env --import-map=tests/deno/import_map.json tests/deno/
import { assertEquals } from 'jsr:@std/assert@1';
import { pickedDate } from '@/lib/datePicker';
import {
  isSessionEndedError,
  isSessionEndedResponse,
  markSessionEnded,
  sessionEndedPending,
  takeSessionEnded,
} from '@/lib/sessionEnded';
import { returnToSteps } from '@/lib/authRedirect';
import { NO_REGISTRATION_TEXT, prescriptionDoctorLines } from '@/lib/prescriptionDoctor';
import { pushTarget } from '@/lib/pushRoutes';
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
