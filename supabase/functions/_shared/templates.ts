// Message templates. Keep these small + PHI-light — they hit SMS/WhatsApp logs
// at providers, so don't include symptom details or DOBs.

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
  | 'appointment_reminder_24h'
  | 'appointment_reminder_1h'
  | 'prescription_issued'
  | 'vaccine_due_soon'
  | 'new_message'
  | 'checkin_summary_ready';

const TEMPLATES: Record<TemplateKey, RenderedTemplate> = {
  appointment_confirmation: {
    subject: 'Appointment confirmed',
    body:
      'Pedia Pulse: Your appointment with {{doctor}} on {{date}} at {{time}} is confirmed. ' +
      'Reply STOP to opt out.',
  },
  appointment_reminder_24h: {
    subject: 'Appointment tomorrow',
    body:
      'Pedia Pulse: Reminder — appointment with {{doctor}} tomorrow ({{date}}) at {{time}}.',
  },
  appointment_reminder_1h: {
    subject: 'Appointment in 1 hour',
    body:
      'Pedia Pulse: Your appointment with {{doctor}} starts at {{time}} — please be ready.',
  },
  prescription_issued: {
    subject: 'New prescription from Dr. {{doctor}}',
    body:
      'Pedia Pulse: Dr. {{doctor}} has issued a new prescription. Open the app to view.',
  },
  vaccine_due_soon: {
    subject: 'Vaccination due soon',
    body:
      'Pedia Pulse: {{vaccine}} is due for {{child}} on {{date}}. Book a slot in the app.',
  },
  new_message: {
    subject: 'New message from Dr. {{doctor}}',
    body: 'Pedia Pulse: Dr. {{doctor}} sent you a new message.',
    data: { type: 'message', conversationId: '{{conversationId}}' },
  },
  checkin_summary_ready: {
    subject: 'Check-in summary ready',
    body:
      'Pedia Pulse: Your symptom summary is ready and has been shared with Dr. {{doctor}}.',
  },
};

export function renderTemplate(
  key: string,
  params: Record<string, string>,
): RenderedTemplate {
  const tpl = TEMPLATES[key as TemplateKey];
  if (!tpl) {
    return { subject: 'Pedia Pulse', body: `Pedia Pulse update (${key})` };
  }
  return {
    subject: tpl.subject ? fill(tpl.subject, params) : undefined,
    body: fill(tpl.body, params),
    data: tpl.data
      ? JSON.parse(fill(JSON.stringify(tpl.data), params))
      : undefined,
  };
}
