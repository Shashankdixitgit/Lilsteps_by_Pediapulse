// deno test --allow-env supabase/functions/_shared/parentNotify_test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canReceiveEmail, inBackground, isTestAddress } from './parentNotify.ts';

Deno.test('R8: test logins and mail-less domains are never emailed', async () => {
  assert(isTestAddress('doctor.test@lilsteps.dev'));
  assert(isTestAddress('phone-9000055501@demo.lilsteps.dev'));
  assert(!isTestAddress('priya@gmail.com'));
  assert(!isTestAddress('x@notlilsteps.dev'));
  const never = () => Promise.reject(new Error('must not look up test domains'));
  assertEquals(await canReceiveEmail('doctor.test@lilsteps.dev', never), false);
  assertEquals(await canReceiveEmail('someone@no-mail-here.example', async () => false), false);
  assertEquals(await canReceiveEmail('priya@has-mail.example', async () => true), true);
  assertEquals(await canReceiveEmail('not-an-address', async () => true), false);
});

Deno.test('R9: background work does not hold up the caller and uses waitUntil', async () => {
  const waited: Promise<unknown>[] = [];
  (globalThis as any).EdgeRuntime = { waitUntil: (p: Promise<unknown>) => waited.push(p) };
  let finished = false;
  const slow = new Promise<void>((resolve) => setTimeout(() => {
    finished = true;
    resolve();
  }, 100));
  const t0 = performance.now();
  inBackground('test', slow);
  assert(performance.now() - t0 < 20, 'inBackground blocked');
  assertEquals(finished, false);
  assertEquals(waited.length, 1);
  await waited[0];
  assertEquals(finished, true);
  // A failing background job is logged, never thrown at the caller.
  inBackground('test', Promise.reject(new Error('smtp down')));
  await waited[1];
  delete (globalThis as any).EdgeRuntime;
});
