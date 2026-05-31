/**
 * Debug logger for LilSteps backend integration.
 * All logs are prefixed with [LS] for easy filtering in terminal.
 *
 * Usage:  import { dbg } from '@/lib/debug';
 *         dbg.auth('signInWithOtp', { email });
 *         dbg.error('signInWithOtp', error);
 */

const ENABLED = __DEV__; // Only log in development

type LogCategory = 'AUTH' | 'DB' | 'GROQ' | 'NAV' | 'HOOK' | 'APP';

function log(category: LogCategory, action: string, data?: unknown) {
  if (!ENABLED) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `[LS:${category}] ${timestamp}`;

  if (data !== undefined) {
    console.log(`${prefix} ${action}`, typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
  } else {
    console.log(`${prefix} ${action}`);
  }
}

function logError(category: LogCategory, action: string, error: unknown) {
  if (!ENABLED) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const prefix = `[LS:${category}] ${timestamp}`;
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 3).join('\n') : undefined;

  console.error(`${prefix} FAILED: ${action}`, message);
  if (stack) console.error(`${prefix} Stack:`, stack);
}

export const dbg = {
  auth: (action: string, data?: unknown) => log('AUTH', action, data),
  db: (action: string, data?: unknown) => log('DB', action, data),
  groq: (action: string, data?: unknown) => log('GROQ', action, data),
  nav: (action: string, data?: unknown) => log('NAV', action, data),
  hook: (action: string, data?: unknown) => log('HOOK', action, data),
  app: (action: string, data?: unknown) => log('APP', action, data),

  authError: (action: string, error: unknown) => logError('AUTH', action, error),
  dbError: (action: string, error: unknown) => logError('DB', action, error),
  groqError: (action: string, error: unknown) => logError('GROQ', action, error),
};
