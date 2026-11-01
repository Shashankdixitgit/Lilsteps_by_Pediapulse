// deno test supabase/functions/_shared/email_test.ts
import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type EmailMessage, sendEmail, type SmtpConfig, smtpConfig } from './email.ts';
import { formatEmailDate, formatEmailTime, renderEmail } from './templates.ts';

const CONFIG: SmtpConfig = { host: 'smtp.gmail.com', port: 465, user: 'dev@lilstepsclinics.com', pass: 'x', from: 'LilSteps <dev@lilstepsclinics.com>' };

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
  assertEquals(e.subject, "Booked: Myra's consult with Dr. Madhav");
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
    'appointment_reminder_1h', 'prescription_issued', 'vaccine_due_soon', 'new_message', 'checkin_summary_ready', 'unknown_key']) {
    const e = renderEmail(key, { child: '<b>Myra</b>', doctor: 'Dr. "X" & Co', date: '2026-11-03', time: '09:00', vaccine: 'MMR' });
    assert(e.subject.length > 0, key);
    assert(!e.html.includes('<b>Myra</b>'), `${key} html not escaped`);
    assert(e.text.includes('The LilSteps team'), key);
  }
});
