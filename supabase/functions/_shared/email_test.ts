// deno test supabase/functions/_shared/email_test.ts
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type EmailMessage, sendEmail, type SmtpConfig, smtpConfig } from './email.ts';
import { DOCTOR_EMAIL_TEMPLATES } from './templates.ts';
import { formatEmailDate, formatEmailTime, renderEmail } from './templates.ts';

const CONFIG: SmtpConfig = {
  host: 'smtp.gmail.com',
  port: 465,
  user: 'dev@lilstepsclinics.com',
  pass: 'x',
  from: 'LilSteps <dev@lilstepsclinics.com>',
  replyTo: 'dev@lilstepsclinics.com',
};

Deno.test('sendEmail hands the message to the transport', async () => {
  const sent: Array<{ config: SmtpConfig; msg: EmailMessage }> = [];
  const msg = { to: 'priya@example.com', subject: 's', text: 't', html: '<p>h</p>' };
  const r = await sendEmail(msg, { config: CONFIG, transport: async (config, m) => void sent.push({ config, msg: m }) });
  assertEquals(r, { ok: true });
  assertEquals(sent.length, 1);
  assertEquals(sent[0].msg, msg);
  assertEquals(sent[0].config.port, 465);
});

Deno.test('sendEmail: not configured, blocked port, bad address, transport error', async () => {
  const msg = { to: 'priya@example.com', subject: 's', text: 't', html: 'h' };
  const never = () => Promise.reject(new Error('must not send'));
  assertEquals((await sendEmail(msg, { config: null, transport: never })).notConfigured, true);
  const blocked = await sendEmail(msg, { config: { ...CONFIG, port: 587 }, transport: never });
  assertEquals(blocked.notConfigured, true);
  assertStringIncludes(blocked.error ?? '', '465');
  assertEquals((await sendEmail({ ...msg, to: 'not-an-email' }, { config: CONFIG, transport: never })).ok, false);
  const failed = await sendEmail(msg, { config: CONFIG, transport: () => Promise.reject(new Error('535 bad auth')) });
  assertEquals(failed.ok, false);
  assertStringIncludes(failed.error ?? '', '535');
});

Deno.test('smtpConfig reads the secrets, defaulting to port 465', () => {
  const env: Record<string, string> = { SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'dev@lilstepsclinics.com', SMTP_PASS: 'p' };
  const c = smtpConfig((k) => env[k]);
  assertEquals(c?.port, 465);
  assertEquals(c?.from, 'LilSteps <dev@lilstepsclinics.com>');
  assertEquals(c?.replyTo, 'dev@lilstepsclinics.com');
  assertEquals(smtpConfig(() => undefined), null);
});

Deno.test('date and time read naturally in IST', () => {
  assertEquals(formatEmailDate('2026-11-03'), 'Tuesday, 3 November');
  assertEquals(formatEmailTime('17:30:00'), '5:30 pm');
  assertEquals(formatEmailTime('00:05'), '12:05 am');
  assertEquals(formatEmailTime('12:00'), '12:00 pm');
});

Deno.test('booking confirmation email', () => {
  const e = renderEmail('appointment_confirmation', {
    parent: 'Priya', child: 'Myra', doctor: 'Dr. Madhav', date: '2026-11-03', time: '10:00',
  });
  assertEquals(e.subject, 'Your LilSteps consult is booked');
  assertStringIncludes(e.text, 'Hi Priya,');
  assertStringIncludes(e.text, 'Tuesday, 3 November at 10:00 am (India time)');
  assertStringIncludes(e.html, 'Tuesday, 3 November at 10:00 am');
  // No raw Meet link: the app shows it 15 minutes before the start.
  assert(!/meet\.google\.com/.test(e.text + e.html));
});

Deno.test('cancellation wording follows who cancelled and the refund', () => {
  const base = { child: 'Myra', doctor: 'Dr. Madhav', date: '2026-11-03', time: '10:00' };
  assertStringIncludes(renderEmail('appointment_cancelled', { ...base, by: 'doctor', refund: 'started' }).text, 'had to cancel');
  assertStringIncludes(renderEmail('appointment_cancelled', { ...base, by: 'doctor', refund: 'started' }).text, 'refund of the consult fee has started');
  assertStringIncludes(renderEmail('appointment_cancelled', { ...base, by: 'parent', refund: 'late' }).text, 'not refunded');
  assertStringIncludes(renderEmail('appointment_cancelled', { ...base, by: 'parent', refund: 'failed' }).text, "couldn't start your refund");
  assertStringIncludes(renderEmail('appointment_cancelled', { ...base, by: 'parent', refund: 'not_paid' }).text, 'Nothing was charged');
});

Deno.test('every notification template renders; params are HTML-escaped', () => {
  for (const key of ['appointment_confirmation', 'appointment_cancelled', 'appointment_rescheduled', 'appointment_reminder_24h',
    'appointment_reminder_1h', 'prescription_issued', 'vaccine_due_soon', 'vaccine_overdue', 'new_message', 'checkin_summary_ready', 'unknown_key']) {
    const e = renderEmail(key, { child: '<b>Myra</b>', doctor: 'Dr. "X" & Co', date: '2026-11-03', time: '09:00', vaccine: 'MMR' });
    assert(e.subject.length > 0, key);
    assert(!e.html.includes('<b>Myra</b>'), `${key} html not escaped`);
    assert(e.text.includes('reaches the LilSteps team'), key);
  }
});

// ── Review regressions ────────────────────────────────────────────────────────

const ALL_KEYS = ['appointment_confirmation', 'appointment_cancelled', 'appointment_rescheduled', 'appointment_reminder_24h',
  'appointment_reminder_1h', 'prescription_issued', 'vaccine_due_soon', 'vaccine_overdue', 'new_message', 'checkin_summary_ready'];

Deno.test('R1: CR/LF in a child name cannot add mail headers', async () => {
  const evil = 'Myra\r\nBcc: attacker@evil.example\r\n\u0000X';
  for (const key of ALL_KEYS) {
    for (const audience of ['parent', 'doctor'] as const) {
      const e = renderEmail(key, { child: evil, doctor: evil, parent: evil, vaccine: evil, date: '2026-11-03', time: '10:00' }, audience);
      assert(!/[\r\n]/.test(e.subject), `${key}/${audience} subject has a line break`);
      assert(!/[\r\u0000]/.test(e.text), `${key}/${audience} text has control chars`);
      assert(!e.text.includes('\nBcc:'), `${key}/${audience} text starts a header line`);
    }
  }
  // The sender refuses header values with line breaks even if a template slipped.
  const never = () => Promise.reject(new Error('must not send'));
  const msg = { to: 'priya@example.com', subject: 'Hi', text: 't', html: 'h' };
  assertEquals((await sendEmail({ ...msg, subject: 'Hi\r\nBcc: x@evil.example' }, { config: CONFIG, transport: never })).ok, false);
  assertEquals((await sendEmail({ ...msg, to: 'priya@example.com\r\nBcc: x@evil.example' }, { config: CONFIG, transport: never })).ok, false);
  assertEquals((await sendEmail(msg, { config: { ...CONFIG, from: 'LilSteps\n<x@y.z>' }, transport: never })).ok, false);
});

Deno.test('R2: subjects never carry the child, doctor or time', () => {
  for (const key of ALL_KEYS) {
    const e = renderEmail(key, { child: 'Myra', doctor: 'Dr. Madhav', parent: 'Priya', vaccine: 'MMR', date: '2026-11-03', time: '10:00' });
    for (const secret of ['Myra', 'Madhav', 'MMR', '10:00', 'November', 'Priya']) {
      assert(!e.subject.includes(secret), `${key} subject leaks "${secret}": ${e.subject}`);
    }
    assertStringIncludes(e.text, key === 'vaccine_due_soon' ? 'MMR' : key.startsWith('appointment') ? 'Dr. Madhav' : '');
  }
});

Deno.test('R3: doctor emails use doctor wording; only allow-listed templates', () => {
  assertEquals([...DOCTOR_EMAIL_TEMPLATES].sort(), ['checkin_summary_ready', 'new_message']);
  const summary = renderEmail('checkin_summary_ready', { child: 'Myra', doctor: 'Dr. Madhav' }, 'doctor');
  assert(!summary.text.includes('Your symptom summary'), 'parent wording sent to a doctor');
  assertStringIncludes(summary.text, 'Hello Dr. Madhav,');
  assertStringIncludes(summary.text, 'dashboard');
  const msg = renderEmail('new_message', { child: 'Myra', parent: 'Priya', doctor: 'Dr. Madhav' }, 'doctor');
  assertStringIncludes(msg.text, 'Priya sent you a message about Myra');
  assert(!msg.text.includes('Open the LilSteps app to read'), 'parent wording sent to a doctor');
});

Deno.test('R9: a stalled SMTP server times out and the send is aborted', async () => {
  let aborted = false;
  const stall = (_c: SmtpConfig, _m: EmailMessage, signal: AbortSignal) =>
    new Promise<void>(() => signal.addEventListener('abort', () => (aborted = true)));
  const t0 = performance.now();
  const r = await sendEmail({ to: 'priya@example.com', subject: 's', text: 't', html: 'h' }, { config: CONFIG, transport: stall, timeoutMs: 150 });
  const took = performance.now() - t0;
  assertEquals(r.ok, false);
  assertStringIncludes(r.error ?? '', 'timed out');
  assert(aborted, 'transport was not told to abort');
  assert(took < 1000, `took ${took} ms`);
});
