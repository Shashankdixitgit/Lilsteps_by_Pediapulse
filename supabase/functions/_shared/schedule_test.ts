// deno test --allow-env supabase/functions/_shared/schedule_test.ts
// deno-lint-ignore-file no-explicit-any
// Reschedule + follow-up helpers (0051): consult-time keys, follow-up link
// expiry, the email return URL, the follow-up / reschedule emails, and the
// per-time reminder idempotency.
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { consultStart, emailPaymentReturnUrl, followupLinkExpiry, istParts, startsAtKey } from './schedule.ts';
import { renderEmail, renderTemplate, safeLink, SERVER_ONLY_TEMPLATES } from './templates.ts';
import { alreadyNotified } from './parentNotify.ts';

Deno.test('consult times: IST wall clock and the starts_at key', () => {
  assertEquals(consultStart('2026-11-03', '17:30:00').toISOString(), '2026-11-03T12:00:00.000Z');
  assertEquals(startsAtKey('2026-11-03', '17:30:00'), '2026-11-03T17:30');
  assertEquals(startsAtKey('2026-11-03', '09:05'), '2026-11-03T09:05');
  // 23:30 UTC is 05:00 the next day in India.
  assertEquals(istParts(new Date('2026-11-03T23:30:00Z')), { date: '2026-11-04', time: '05:00' });
});

Deno.test('follow-up link lives as long as the hold, less the webhook grace, never under 16 min', () => {
  const now = Date.parse('2026-11-01T10:00:00Z');
  assertEquals(followupLinkExpiry('2026-11-02T10:00:00Z', 4, now).toISOString(), '2026-11-02T09:56:00.000Z');
  // A hold about to end still gets a link Razorpay accepts (>= 15 min).
  assertEquals(followupLinkExpiry('2026-11-01T10:05:00Z', 4, now).toISOString(), '2026-11-01T10:16:00.000Z');
});

Deno.test('email payment return URL: first web origin, else the app', () => {
  assertEquals(emailPaymentReturnUrl('https://lilstepsclinics.com/, https://x.test'), 'https://lilstepsclinics.com/payment-return');
  assertEquals(emailPaymentReturnUrl(''), 'lilsteps://payment-return');
  assertEquals(emailPaymentReturnUrl(undefined), 'lilsteps://payment-return');
});

Deno.test('follow-up email: generic subject, details in the body, one safe pay button', () => {
  const m = renderEmail('followup_payment_request', {
    parent: 'Priya',
    doctor: 'Dr. Rao',
    child: 'Asha',
    date: '2026-11-03',
    time: '17:30',
    link: 'https://rzp.io/rzp/abc123',
    price: '₹449',
    until: 'Monday, 2 November at 5:30 pm',
  });
  assertEquals(m.subject, 'Your doctor booked a follow-up — confirm with payment');
  assert(!m.subject.includes('Asha') && !m.subject.includes('Rao'), 'no names in the subject');
  assertStringIncludes(m.text, 'Hi Priya,');
  assertStringIncludes(m.text, 'Tuesday, 3 November at 5:30 pm (India time)');
  assertStringIncludes(m.text, 'Pay and confirm: https://rzp.io/rzp/abc123');
  assertStringIncludes(m.text, 'until Monday, 2 November at 5:30 pm');
  assertStringIncludes(m.html, 'href="https://rzp.io/rzp/abc123"');
  assertEquals(renderTemplate('followup_payment_request', { doctor: 'Dr. Rao', date: 'x', time: 'y' }).body.includes('Dr. Rao'), true);
});

Deno.test('follow-up email: a link that is not a Razorpay https link is dropped', () => {
  assertEquals(safeLink('javascript:alert(1)'), null);
  assertEquals(safeLink('http://rzp.io/x'), null);
  assertEquals(safeLink('https://evil.example/rzp.io'), null);
  assertEquals(safeLink('https://rzp.io.evil.example/x'), null);
  assertEquals(safeLink('https://rzp.io/rzp/x'), 'https://rzp.io/rzp/x');
  const m = renderEmail('followup_payment_request', { link: 'https://evil.example/pay', date: '2026-11-03', time: '17:30' });
  assert(!m.html.includes('evil.example'));
  assert(!m.text.includes('evil.example'));
  // ...and the notify endpoint refuses the template outright.
  assert(SERVER_ONLY_TEMPLATES.includes('followup_payment_request'));
});

Deno.test('reschedule email says who moved it and that nothing more is due', () => {
  const byDoctor = renderEmail('appointment_rescheduled', { doctor: 'Dr. Rao', child: 'Asha', date: '2026-11-03', time: '17:30', by: 'doctor' });
  assertStringIncludes(byDoctor.text, "Dr. Rao moved Asha's video consult");
  assertStringIncludes(byDoctor.text, 'nothing more to pay');
  const byParent = renderEmail('appointment_rescheduled', { doctor: 'Dr. Rao', child: 'Asha', date: '2026-11-03', time: '17:30', by: 'parent' });
  assertStringIncludes(byParent.text, "Asha's video consult with Dr. Rao has moved");
});

// A tiny stand-in for the supabase-js query builder: records the filters and
// answers each count query from `answer`.
function fakeAdmin(answer: (filters: string[]) => number) {
  const calls: string[][] = [];
  const builder = (filters: string[]): any => {
    const b: any = {
      select: () => b,
      eq: (c: string, v: string) => builder([...filters, `eq ${c}=${v}`]),
      or: (v: string) => builder([...filters, `or ${v}`]),
      then: (res: (r: { count: number }) => unknown) => {
        calls.push(filters);
        return Promise.resolve({ count: answer(filters) }).then(res);
      },
    };
    return b;
  };
  return { admin: { from: () => builder([]) } as any, calls };
}

Deno.test('reminders: per consult time; old rows count only for a consult never moved', async () => {
  // A sent row exists for the OLD time only.
  const sentFor = (f: string[]) =>
    f.some((x) => x.includes('status.eq.sent')) &&
    (f.some((x) => x === 'eq payload->>starts_at=2026-11-03T10:00') || f.some((x) => x.includes('starts_at.is.null')))
      ? 1
      : 0;
  const moved = fakeAdmin(sentFor);
  assertEquals(
    await alreadyNotified(moved.admin, 'a1', 'appointment_reminder_24h', { key: '2026-11-04T09:00', legacyCounts: false }),
    false,
    'moved consult: reminded again for its new time',
  );
  const same = fakeAdmin(sentFor);
  assertEquals(
    await alreadyNotified(same.admin, 'a1', 'appointment_reminder_24h', { key: '2026-11-03T10:00', legacyCounts: false }),
    true,
  );
  const legacy = fakeAdmin(sentFor);
  assertEquals(
    await alreadyNotified(legacy.admin, 'a1', 'appointment_reminder_24h', { key: '2026-11-04T09:00', legacyCounts: true }),
    true,
    'never moved: a pre-0051 row (no starts_at) still counts',
  );
  assert(legacy.calls.every((f) => f.some((x) => x.includes('starts_at.is.null'))));
  // Without a time it behaves as before (one per consult).
  const plain = fakeAdmin(() => 0);
  assertEquals(await alreadyNotified(plain.admin, 'a1', 'appointment_confirmation'), false);
  assert(plain.calls.every((f) => !f.some((x) => x.includes('starts_at'))));
});
