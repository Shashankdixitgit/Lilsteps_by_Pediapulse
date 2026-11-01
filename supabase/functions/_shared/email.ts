// Transactional email over SMTP (Google Workspace: smtp.gmail.com, sending
// as dev@lilstepsclinics.com with an app password).
//
// Secrets: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, EMAIL_FROM
// (e.g. "LilSteps <dev@lilstepsclinics.com>"), optional EMAIL_REPLY_TO
// (defaults to SMTP_USER: replies reach the LilSteps team; a care@ /
// support@ alias is recommended later). Supabase Edge Functions block
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
  replyTo: string;
}

/** Sends one message; throws on failure. `signal` aborts a stalled send. */
export type EmailTransport = (config: SmtpConfig, msg: EmailMessage, signal: AbortSignal) => Promise<void>;

const BLOCKED_PORTS = new Set([25, 587]);

/** Connect + send must finish within this, so a stalled SMTP server can't hold up a payment or cancel. */
export const SMTP_TIMEOUT_MS = 8_000;

/** Header values must be one line: CR / LF would let a value add mail headers. */
const HEADER_BREAK = /[\r\n]/;

export function smtpConfig(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): SmtpConfig | null {
  const host = env('SMTP_HOST');
  const user = env('SMTP_USER');
  const pass = env('SMTP_PASS');
  if (!host || !user || !pass) return null;
  const port = Number(env('SMTP_PORT') ?? '465');
  return { host, port, user, pass, from: env('EMAIL_FROM') ?? `LilSteps <${user}>`, replyTo: env('EMAIL_REPLY_TO') ?? user };
}

export const smtpTransport: EmailTransport = async (config, msg, signal) => {
  const client = new SMTPClient({
    connection: {
      hostname: config.host,
      port: config.port,
      tls: true,
      auth: { username: config.user, password: config.pass },
    },
  });
  // On timeout, drop the connection so the half-open socket doesn't linger.
  const onAbort = () => {
    Promise.resolve()
      .then(() => client.close())
      .catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    await client.send({
      from: config.from,
      to: msg.to,
      replyTo: config.replyTo,
      subject: msg.subject,
      content: msg.text,
      html: msg.html,
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
    try {
      await client.close();
    } catch {
      // The message is already sent (or failed above); a close error changes nothing.
    }
  }
};

export async function sendEmail(
  msg: EmailMessage,
  opts: { config?: SmtpConfig | null; transport?: EmailTransport; timeoutMs?: number } = {},
): Promise<EmailResult> {
  const config = opts.config === undefined ? smtpConfig() : opts.config;
  if (!config) return { ok: false, error: 'Email (SMTP) not configured', notConfigured: true };
  if (BLOCKED_PORTS.has(config.port)) {
    return { ok: false, error: `SMTP_PORT ${config.port} is blocked in Edge Functions; use 465`, notConfigured: true };
  }
  if ([msg.subject, msg.to, config.from, config.replyTo].some((v) => HEADER_BREAK.test(v))) {
    return { ok: false, error: 'Refused: line break in an email header' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.to)) return { ok: false, error: 'Invalid email address' };

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${opts.timeoutMs ?? SMTP_TIMEOUT_MS} ms`));
    }, opts.timeoutMs ?? SMTP_TIMEOUT_MS);
  });
  try {
    await Promise.race([(opts.transport ?? smtpTransport)(config, msg, controller.signal), timeout]);
    return { ok: true };
  } catch (e) {
    // Provider text stays in notification_log / logs, never shown to people.
    return { ok: false, error: `SMTP: ${(e as Error).message}`.slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}
