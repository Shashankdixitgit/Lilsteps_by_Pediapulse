// Message templates. Keep these small + PHI-light — they hit SMS/WhatsApp/
// email provider logs, so don't include symptom details or DOBs.
//
// renderTemplate: short text for SMS / WhatsApp / push.
// renderEmail:    subject + plain text + branded HTML for email (the default
//                 channel while SMS is off).

export interface RenderedTemplate {
  subject?: string;
  body: string;
  data?: Record<string, unknown>;
}

function fill(t: string, params: Record<string, string>): string {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? '');
}

export type TemplateKey =
  | 'appointment_confirmation'
  | 'appointment_cancelled'
  | 'appointment_rescheduled'
  | 'appointment_reminder_24h'
  | 'appointment_reminder_1h'
  | 'prescription_issued'
  | 'vaccine_due_soon'
  | 'vaccine_overdue'
  | 'new_message'
  | 'checkin_summary_ready'
  | 'followup_payment_request'
  | 'care_plan_started'
  | 'care_plan_renewed'
  | 'care_plan_payment_failed'
  | 'care_plan_cancelled';

const TEMPLATES: Record<TemplateKey, RenderedTemplate> = {
  appointment_confirmation: {
    subject: 'Appointment confirmed',
    body:
      'LilSteps: Your appointment with {{doctor}} on {{date}} at {{time}} is confirmed. ' +
      'Reply STOP to opt out.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/consult' },
  },
  appointment_cancelled: {
    subject: 'Appointment cancelled',
    body: 'LilSteps: Your appointment with {{doctor}} on {{date}} at {{time}} was cancelled.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/consult' },
  },
  appointment_rescheduled: {
    subject: 'Appointment moved',
    body: 'LilSteps: Your appointment with {{doctor}} is now on {{date}} at {{time}}.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/consult' },
  },
  appointment_reminder_24h: {
    subject: 'Appointment tomorrow',
    body:
      'LilSteps: Reminder — appointment with {{doctor}} tomorrow ({{date}}) at {{time}}.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/consult', channel: 'reminders' },
  },
  appointment_reminder_1h: {
    subject: 'Appointment in 1 hour',
    body:
      'LilSteps: Your appointment with {{doctor}} starts at {{time}} — please be ready.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/consult', channel: 'reminders' },
  },
  prescription_issued: {
    subject: 'New prescription from {{doctor}}',
    body:
      'LilSteps: {{doctor}} has issued a new prescription. Open the app to view.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/records' },
  },
  vaccine_due_soon: {
    subject: 'Vaccine due soon',
    body:
      'LilSteps: {{vaccine}} due for {{child}} on {{date}}. Mark it as given in the app once done.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/vaccine', channel: 'reminders' },
  },
  vaccine_overdue: {
    subject: 'Vaccine not marked as given',
    body:
      'LilSteps: {{vaccine}} for {{child}} was due on {{date}}. Given already? Mark it in the app. If not, ask your paediatrician.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/vaccine' },
  },
  new_message: {
    subject: 'New message from {{doctor}}',
    body: 'LilSteps: {{doctor}} sent you a new message.',
    data: { type: 'message', conversationId: '{{conversationId}}', url: '/chat/{{conversationId}}' },
  },
  checkin_summary_ready: {
    subject: 'Check-in summary ready',
    body:
      'LilSteps: Your symptom summary is ready and has been shared with {{doctor}}.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/consult' },
  },
  followup_payment_request: {
    subject: 'Follow-up booked',
    body:
      'LilSteps: {{doctor}} booked a follow-up on {{date}} at {{time}}. Pay in the app to confirm it.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/consult', channel: 'reminders' },
  },
  care_plan_started: {
    subject: 'Your Care Plan has started',
    body: 'LilSteps: Your Care Plan has started. You have 3 video consults to use this month.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/profile/care-plan' },
  },
  care_plan_renewed: {
    subject: 'Your Care Plan has renewed',
    body: 'LilSteps: Your Care Plan renewed. You have 3 video consults to use this month.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/profile/care-plan' },
  },
  care_plan_payment_failed: {
    subject: 'Care Plan payment did not go through',
    body: 'LilSteps: The payment for your Care Plan did not go through. Open the app to check your plan.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/profile/care-plan' },
  },
  care_plan_cancelled: {
    subject: 'Your Care Plan was cancelled',
    body: 'LilSteps: Your Care Plan was cancelled. Open the app to see until when you can use it.',
    // Push: where a tap opens in the app (review should-fix 2).
    data: { url: '/profile/care-plan' },
  },
};

/**
 * Templates only the server sends (they carry a payment link built on the
 * server). The notify endpoint refuses them, so nobody can mail a family a
 * link of their own choosing under the LilSteps name.
 */
export const SERVER_ONLY_TEMPLATES: readonly string[] = [
  'followup_payment_request',
  // Billing news must only ever come from Razorpay's own word (webhook / fetch).
  'care_plan_started',
  'care_plan_renewed',
  'care_plan_payment_failed',
  'care_plan_cancelled',
];

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TEMPLATES, v);
}

export function renderTemplate(
  key: string,
  params: Record<string, string>,
): RenderedTemplate {
  const tpl = TEMPLATES[key as TemplateKey];
  if (!tpl) {
    return { subject: 'LilSteps', body: `LilSteps update (${key})` };
  }
  return {
    subject: tpl.subject ? fill(tpl.subject, params) : undefined,
    body: fill(tpl.body, params),
    // Fill each value on its own — splicing params into a JSON string breaks
    // on quotes / backslashes.
    data: tpl.data ? safePushData(tpl.data, params) : undefined,
  };
}

/** Ids allowed in a push deep link (uuid-like): nothing that changes the path. */
const PUSH_ID_RE = /^[\w-]+$/;

/**
 * Fills the push data. `url` (where a tap opens in the app) is kept only
 * when it is one of the app's known paths with a safe id; otherwise it is
 * dropped and the tap just opens the app (PR #26 review item 5).
 */
function safePushData(data: Record<string, unknown>, params: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'url' && typeof v === 'string') {
      if (v.includes('{{conversationId}}') && !PUSH_ID_RE.test(params.conversationId ?? '')) continue;
    }
    out[k] = typeof v === 'string' ? fill(v, params) : v;
  }
  return out;
}

// ── Email ─────────────────────────────────────────────────────────────────────

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const BRAND = '#49378f';
const INK = '#0b1632';
const SURFACE = '#ebe9ff';

/**
 * Every value that came from the database or a caller: no control
 * characters (CR / LF could inject mail headers), single spaces, capped.
 */
export function cleanParam(v: string | undefined): string {
  return (v ?? '')
    .replace(/[\r\n\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function cleanParams(params: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, cleanParam(String(v ?? ''))]));
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "2026-11-03" → "Tuesday, 3 November" (clinic dates are IST calendar dates). */
export function formatEmailDate(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
  const month = dt.toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' });
  return `${weekday}, ${d} ${month}`;
}

/** "17:30" or "17:30:00" → "5:30 pm". */
export function formatEmailTime(hhmm: string | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  const h = Number(m[1]);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${suffix}`;
}

interface EmailParts {
  subject: string;
  heading: string;
  /** Paragraphs, plain text (escaped for HTML). */
  lines: string[];
  /** Highlighted "when" box. */
  when?: string;
  /** One button (server-built https link only, see safeLink). */
  button?: { label: string; href: string };
}

/** Only an https link on a known payment host makes it into an email. */
export function safeLink(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!['rzp.io', 'razorpay.com', 'razorpay.me'].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

const REFUND_LINES: Record<string, string> = {
  started: 'Your refund of the consult fee has started. It usually reaches your account in 5–7 working days.',
  late: 'As it was cancelled less than 2 hours before the start, the fee is not refunded.',
  not_paid: 'Nothing was charged for this booking.',
  failed:
    "We couldn't start your refund automatically. Our team will process it by hand — reply to this email if you have any questions.",
  plan_returned: 'This consult has gone back to your Care Plan, so you can use it for another booking this month.',
  plan_used: 'As it was cancelled less than 2 hours before the start, this Care Plan consult counts as used.',
  plan_expired:
    'Your Care Plan month had already ended when you cancelled, so this consult could not go back to the plan. Nothing more was charged.',
  plan_rebook:
    'Your Care Plan month has ended, so this consult could not go back to the plan. We will book a free consult for you — our team will be in touch.',
};

// Subjects are generic on purpose: no child name, doctor or time (they show
// in inbox previews and provider logs). Details go in the body only.
function emailParts(key: string, p: Record<string, string>): EmailParts | null {
  const child = p.child || 'your child';
  const doctor = p.doctor || 'your doctor';
  const when = p.date ? `${formatEmailDate(p.date)}${p.time ? ` at ${formatEmailTime(p.time)}` : ''} (India time)` : undefined;
  const videoLine = 'Open the LilSteps app at the time of the consult: the video link appears in the Consult tab 15 minutes before it starts.';

  switch (key) {
    case 'appointment_confirmation':
      return {
        subject: 'Your LilSteps consult is booked',
        heading: 'Your consult is booked',
        when,
        lines: [
          p.plan === 'yes'
            ? `${child}'s video consult with ${doctor} is confirmed, using one of your Care Plan consults.`
            : `${child}'s video consult with ${doctor} is confirmed.`,
          videoLine,
          p.plan === 'yes'
            ? 'Need to change plans? You can cancel from the app. Cancelling 2 hours or more before the start gives the consult back to your plan.'
            : 'Need to change plans? You can cancel from the app. Cancelling 2 hours or more before the start gets a full refund.',
        ],
      };
    case 'appointment_cancelled': {
      const byDoctor = p.by === 'doctor';
      return {
        subject: 'Your LilSteps consult was cancelled',
        heading: 'Your consult was cancelled',
        when,
        lines: [
          byDoctor
            ? `${doctor} had to cancel ${child}'s consult. We're sorry for the trouble — you can book another time in the app.`
            : `You cancelled ${child}'s consult with ${doctor}.`,
          ...(p.refund && REFUND_LINES[p.refund] ? [REFUND_LINES[p.refund]] : []),
        ],
      };
    }
    case 'appointment_rescheduled':
      return {
        subject: 'Your LilSteps consult has a new time',
        heading: 'Your consult has a new time',
        when,
        lines: [
          p.by === 'doctor'
            ? `${doctor} moved ${child}'s video consult to the time below.`
            : `${child}'s video consult with ${doctor} has moved to the time below.`,
          'There is nothing more to pay: your payment carries over.',
          videoLine,
        ],
      };
    case 'followup_payment_request': {
      const href = safeLink(p.link);
      return {
        // Generic on purpose, like every subject here.
        subject: 'Your doctor booked a follow-up — confirm with payment',
        heading: 'Your doctor booked a follow-up',
        when,
        lines: [
          `${doctor} would like to see ${child} again and has kept the time below for a follow-up video consult.`,
          `To confirm it, pay the consult fee (${p.price || '₹449'}). You can pay with the button below, or from the Consult tab in the LilSteps app.`,
          p.until
            ? `The time is kept for you until ${p.until} (India time). If it isn't paid by then, it is released and nothing is charged.`
            : "If it isn't paid in time, the slot is released and nothing is charged.",
        ],
        button: href ? { label: 'Pay and confirm', href } : undefined,
      };
    }
    case 'appointment_reminder_24h':
      return {
        subject: 'Reminder: your LilSteps consult',
        heading: 'Your consult is tomorrow',
        when,
        lines: [`${child}'s video consult with ${doctor}.`, videoLine],
      };
    case 'appointment_reminder_1h':
      return {
        subject: 'Reminder: your LilSteps consult starts soon',
        heading: 'Your consult starts soon',
        when,
        lines: [`${child}'s video consult with ${doctor}.`, 'Find a quiet spot with good internet.', videoLine],
      };
    case 'prescription_issued':
      return {
        subject: 'A new prescription is ready',
        heading: 'A new prescription is ready',
        lines: [`${doctor} has issued a prescription for ${child}. Open the LilSteps app to view or download it.`],
      };
    case 'vaccine_due_soon': {
      const many = Number(p.count) > 1;
      return {
        subject: many ? 'Vaccines due soon' : 'A vaccine is due soon',
        heading: many ? 'Vaccines due soon' : 'A vaccine is due soon',
        when: p.date ? `Due ${formatEmailDate(p.date)}` : undefined,
        lines: [
          `${p.vaccine || (many ? 'Some vaccines' : 'A vaccine')} ${many ? 'are' : 'is'} due for ${child}.`,
          'Vaccines are given in person: plan a visit to your paediatrician or vaccination centre around this date.',
          `Once ${many ? 'they are' : 'it is'} given, mark ${many ? 'them' : 'it'} as given in the Vaccines tab of the LilSteps app so ${child}'s record stays up to date.`,
        ],
      };
    }
    case 'vaccine_overdue': {
      const many = Number(p.count) > 1;
      return {
        subject: many ? 'Vaccines not marked as given' : 'A vaccine is not marked as given',
        heading: many ? 'Were these vaccines given?' : 'Was this vaccine given?',
        when: p.date ? `Was due ${formatEmailDate(p.date)}` : undefined,
        lines: [
          `${p.vaccine || (many ? 'Some vaccines' : 'A vaccine')} for ${child} ${many ? 'were' : 'was'} due on this date and ${many ? 'are' : 'is'} not marked as given in LilSteps yet.`,
          `If ${many ? 'they were' : 'it was'} given, mark ${many ? 'them' : 'it'} as given in the Vaccines tab of the app. We won't remind you about ${many ? 'these doses' : 'this dose'} again.`,
          "If not, please ask your paediatrician about catching up.",
        ],
      };
    }
    case 'new_message':
      return {
        subject: 'You have a new message',
        heading: 'You have a new message',
        lines: [`${doctor} sent you a message. Open the LilSteps app to read and reply.`],
      };
    // Care Plan: billing news only. Generic subjects; never a child's name,
    // a doctor or anything about health.
    case 'care_plan_started':
      return {
        subject: 'Your LilSteps Care Plan has started',
        heading: 'Your Care Plan has started',
        lines: [
          `Thank you for subscribing. Your Care Plan (${p.price || '₹999'} a month) includes 3 video consults each billing month, for any child on your account.`,
          p.until ? `This month runs until ${p.until}. The plan renews on its own each month until you cancel.` : 'The plan renews on its own each month until you cancel.',
          'To use it, book a consult in the LilSteps app and choose “Use a plan consult”. After the 3 included consults, consults are ₹449 as usual. Unused consults do not carry over.',
          'You can cancel any time from Profile → Care Plan. It then stays active until the end of the month you have paid for.',
        ],
      };
    case 'care_plan_renewed':
      return {
        subject: 'Your LilSteps Care Plan has renewed',
        heading: 'Your Care Plan has renewed',
        lines: [
          `We received this month’s payment (${p.price || '₹999'}). You have 3 video consults to use${p.until ? ` until ${p.until}` : ' this month'}.`,
          'You can cancel any time from Profile → Care Plan in the app.',
        ],
      };
    case 'care_plan_payment_failed':
      return {
        subject: 'Your LilSteps Care Plan payment did not go through',
        heading: 'Your plan payment did not go through',
        lines: [
          p.status === 'halted'
            ? 'We tried a few times but could not collect this month’s Care Plan payment, so the plan is paused. No new plan consults are added until a payment goes through.'
            : 'We could not collect this month’s Care Plan payment. Razorpay will try again over the next few days.',
          'Please check the card or UPI account you subscribed with. You can see your plan, or subscribe again, from Profile → Care Plan in the app.',
          'Consults you have already booked are not affected.',
        ],
      };
    case 'care_plan_cancelled':
      return {
        subject: 'Your LilSteps Care Plan was cancelled',
        heading: p.until ? 'Your Care Plan will not renew' : 'Your Care Plan has ended',
        lines: [
          p.until
            ? `Your Care Plan has been cancelled and will not renew. You can keep using the consults left this month until ${p.until}.`
            : 'Your Care Plan has ended and will not renew. Nothing more will be charged.',
          'Consults you have already booked stay booked. You can subscribe again any time from Profile → Care Plan in the app.',
        ],
      };
    case 'checkin_summary_ready':
      return {
        subject: 'Your check-in summary is ready',
        heading: 'Check-in summary ready',
        lines: [`Your symptom summary is ready and has been shared with ${doctor}.`],
      };
    default:
      return null;
  }
}

/** Templates a doctor may receive, with doctor wording. */
export const DOCTOR_EMAIL_TEMPLATES = ['new_message', 'checkin_summary_ready'] as const;

function doctorEmailParts(key: string, p: Record<string, string>): EmailParts | null {
  const child = p.child || 'a patient';
  switch (key) {
    case 'new_message':
      return {
        subject: 'New message in LilSteps',
        heading: 'A parent sent you a message',
        lines: [`${p.parent || 'A parent'} sent you a message about ${child}. Open the LilSteps dashboard to read and reply.`],
      };
    case 'checkin_summary_ready':
      return {
        subject: 'A check-in summary is ready',
        heading: 'A check-in summary is ready',
        lines: [`An AI check-in summary for ${child} is ready in the LilSteps dashboard, before the consult.`],
      };
    default:
      return null;
  }
}

/** Subject, plain text and branded HTML for an email notification. */
export function renderEmail(
  key: string,
  rawParams: Record<string, string>,
  audience: 'parent' | 'doctor' = 'parent',
): RenderedEmail {
  const params = cleanParams(rawParams);
  const parts = (audience === 'doctor' ? doctorEmailParts(key, params) : emailParts(key, params)) ?? {
    subject: 'An update from LilSteps',
    heading: 'An update from LilSteps',
    lines: ['Open the LilSteps app to see what changed.'],
  };
  const greeting =
    audience === 'doctor'
      ? params.doctor
        ? `Hello ${params.doctor},`
        : 'Hello Doctor,'
      : params.parent
        ? `Hi ${params.parent},`
        : 'Hello,';
  const footer = 'Questions? Reply to this email and it reaches the LilSteps team.';

  const text = [
    greeting,
    '',
    parts.heading,
    ...(parts.when ? ['', parts.when] : []),
    '',
    ...parts.lines.flatMap((l) => [l, '']),
    ...(parts.button ? [`${parts.button.label}: ${parts.button.href}`, ''] : []),
    footer,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(parts.subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f5fb;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:${INK};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5fb;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="background:${BRAND};padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">LilSteps</td></tr>
<tr><td style="padding:24px;">
<p style="margin:0 0 12px;font-size:15px;line-height:22px;">${escapeHtml(greeting)}</p>
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;">${escapeHtml(parts.heading)}</h1>
${parts.when ? `<p style="margin:0 0 16px;padding:12px 14px;background:${SURFACE};border-radius:10px;font-size:15px;line-height:22px;font-weight:600;">${escapeHtml(parts.when)}</p>` : ''}
${parts.lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:22px;">${escapeHtml(l)}</p>`).join('\n')}
${parts.button ? `<p style="margin:20px 0 4px;"><a href="${escapeHtml(parts.button.href)}" style="display:inline-block;padding:12px 20px;background:${BRAND};color:#ffffff;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(parts.button.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 24px 24px;color:#65687b;font-size:13px;line-height:19px;border-top:1px solid #ecebf3;">${escapeHtml(footer)}</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: parts.subject, text, html };
}
