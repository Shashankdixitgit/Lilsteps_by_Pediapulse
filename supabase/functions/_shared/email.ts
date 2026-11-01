// Transactional email over SMTP (Google Workspace: smtp.gmail.com, sending
// as dev@lilstepsclinics.com with an app password).
//
// Secrets: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, EMAIL_FROM
// (e.g. "LilSteps <dev@lilstepsclinics.com>"). Supabase Edge Functions block
// outgoing ports 25 and 587, so only implicit TLS on 465 works here.
//
// The transport is injectable so tests can capture messages without a server.

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailResult {
  ok: boolean;
  providerId?: string;
  error?: string;
  /** No SMTP settings yet: nothing was attempted. */
  notConfigured?: boolean;
}

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

/** Sends one message; throws on failure. */
export type EmailTransport = (config: SmtpConfig, msg: EmailMessage) => Promise<void>;

const BLOCKED_PORTS = new Set([25, 587]);

export function smtpConfig(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): SmtpConfig | null {
  const host = env('SMTP_HOST');
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  if (!host || !user || !pass) return null;
  const port = Number(env('SMTP_PORT') ?? '465');
  return { host, port, user, pass, from: env('EMAIL_FROM') ?? `LilSteps <${user}>` };
}

export const smtpTransport: EmailTransport = async (config, msg) => {
  const client = new SMTPClient({
    connection: {
      hostname: config.host,
      port: config.port,
      tls: true,
      auth: { username: config.user, password: config.pass },
    },
  });
  try {
    await client.send({ from: config.from, to: msg.to, subject: msg.subject, content: msg.text, html: msg.html });
  } finally {
    try {
      await client.close();
    } catch {
      // The message is already sent (or failed above); a close error changes nothing.
    }
  }
};

export async function sendEmail(
  msg: EmailMessage,
  opts: { config?: SmtpConfig | null; transport?: EmailTransport } = {},
): Promise<EmailResult> {
  const config = opts.config === undefined ? smtpConfig() : opts.config;
  if (!config) return { ok: false, error: 'Email (SMTP) not configured', notConfigured: true };
  if (BLOCKED_PORTS.has(config.port)) {
    return { ok: false, error: `SMTP_PORT ${config.port} is blocked in Edge Functions; use 465`, notConfigured: true };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.to)) return { ok: false, error: 'Invalid email address' };
  try {
    await (opts.transport ?? smtpTransport)(config, msg);
    return { ok: true };
  } catch (e) {
    // Provider text stays in notification_log / logs, never shown to people.
    return { ok: false, error: `SMTP: ${(e as Error).message}`.slice(0, 500) };
  }
}
