// Care Plan credits against a REAL Postgres with migrations 0001–0053:
// bookings racing for the last plan consult of the month.
//
//   LILSTEPS_TEST_PG=/path/to/socket-dir:5432 LILSTEPS_TEST_DB=t \
//     deno test -A --node-modules-dir=none supabase/functions/_shared/carePlan_db_test.ts
//
// Skipped when LILSTEPS_TEST_PG is not set. tests/sql/run.sh makes a
// throwaway database for this and runs it (KEEP=1 keeps it for reuse).
// Uses its own doctor / parent / plan rows (fresh ids each run).
import { assertEquals } from 'jsr:@std/assert@1';

// Loaded only when the test runs (a static npm import would make every
// `deno test supabase/functions/` need the driver). Run with
// --node-modules-dir=none: the app's node_modules doesn't carry it.
// deno-lint-ignore no-explicit-any
type Sql = any;
const DRIVER = 'npm:postgres@3.4.5';

const target = Deno.env.get('LILSTEPS_TEST_PG');

async function connect(): Promise<Sql> {
  const { default: postgres } = await import(DRIVER);
  const [host, port] = (target ?? '').split(/:(?=\d+$)/);
  return postgres({ host, port: Number(port || 5432), user: 'postgres', database: Deno.env.get('LILSTEPS_TEST_DB') ?? 't', max: 12, onnotice: () => {} });
}

/** A parent with a plan month that has `left` of 3 consults left, and `holds` held bookings. */
async function seed(sql: Sql, left: number, holds: number) {
  const id = () => crypto.randomUUID();
  const parent = id();
  const doctor = id();
  const child = id();
  const plan = id();
  const period = id();
  await sql`insert into auth.users (id, email) values (${parent}, ${`p-${parent}@x.in`})`;
  await sql`insert into public.parents (id, name) values (${parent}, 'Test') on conflict (id) do nothing`;
  await sql`insert into public.doctors (id, name, specialisation, hospital, is_available, registration_number)
            values (${doctor}, 'Dr. Race', 'Pediatrician', 'H', true, 'MMC-R')`;
  await sql`insert into public.children (id, parent_id, name, dob, sex) values (${child}, ${parent}, 'Kid', '2022-01-01', 'female')`;
  await sql`insert into public.care_plans (id, parent_id, razorpay_subscription_id, status, current_start, current_end, paid_count)
            values (${plan}, ${parent}, ${'sub_' + plan}, 'active', now() - interval '1 day', now() + interval '29 days', 1)`;
  await sql`insert into public.care_plan_periods (id, care_plan_id, period_start, period_end)
            values (${period}, ${plan}, now() - interval '1 day', now() + interval '29 days')`;
  for (let i = 0; i < 3 - left; i++) {
    await sql`insert into public.care_plan_credit_uses (period_id, parent_id) values (${period}, ${parent})`;
  }
  const appts: string[] = [];
  for (let i = 0; i < holds; i++) {
    const a = id();
    await sql`insert into public.appointments (id, child_id, parent_id, doctor_id, date, time, status, hold_expires_at)
              values (${a}, ${child}, ${parent}, ${doctor}, current_date + 5, ${`${String(9 + i).padStart(2, '0')}:00`},
                      'awaiting_payment', now() + interval '20 minutes')`;
    appts.push(a);
  }
  return { parent, period, appts };
}

Deno.test({
  name: 'db race: two bookings for the last plan consult — one gets it, the other is told no_credit',
  ignore: !target,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = await connect();
    try {
      const { parent, period, appts } = await seed(sql, 1, 2);
      // Session 1 takes the credit and keeps its transaction open for a moment;
      // session 2 starts meanwhile and must wait for the month row's lock.
      const first = sql.begin(async (tx: Sql) => {
        const [r] = await tx`select public.confirm_consult_with_plan(${appts[0]}, ${parent}) as r`;
        await tx`select pg_sleep(0.8)`;
        return r.r as string;
      });
      await new Promise((r) => setTimeout(r, 200));
      const started = Date.now();
      const [second] = await sql`select public.confirm_consult_with_plan(${appts[1]}, ${parent}) as r`;
      const waited = Date.now() - started;
      assertEquals(await first, 'confirmed');
      assertEquals(second.r, 'no_credit');
      assertEquals(waited >= 300, true, `session 2 waited for session 1 (${waited} ms)`);
      const [{ n }] = await sql`select count(*)::int as n from public.care_plan_credit_uses where period_id = ${period} and status = 'active'`;
      assertEquals(n, 3);
      const [{ s }] = await sql`select status as s from public.appointments where id = ${appts[1]}`;
      assertEquals(s, 'awaiting_payment', 'the loser keeps its hold, to pay ₹449');
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: 'db race: eight bookings at once with three consults left — exactly three are booked with the plan',
  ignore: !target,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = await connect();
    try {
      const { parent, period, appts } = await seed(sql, 3, 8);
      const results = await Promise.all(
        appts.map((a) => sql`select public.confirm_consult_with_plan(${a}, ${parent}) as r`.then(([x]: Array<{ r: string }>) => x.r)),
      );
      assertEquals(results.filter((r) => r === 'confirmed').length, 3);
      assertEquals(results.filter((r) => r === 'no_credit').length, 5);
      const [{ n }] = await sql`select count(*)::int as n from public.care_plan_credit_uses where period_id = ${period} and status = 'active'`;
      assertEquals(n, 3);
      const [{ u }] = await sql`select count(*)::int as u from public.appointments where id = any(${appts}) and status = 'upcoming' and paid_with_plan`;
      assertEquals(u, 3);
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: 'db: a consult given back to the plan frees a consult for the next booking',
  ignore: !target,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = await connect();
    try {
      const { parent, appts } = await seed(sql, 1, 2);
      assertEquals((await sql`select public.confirm_consult_with_plan(${appts[0]}, ${parent}) as r`)[0].r, 'confirmed');
      assertEquals((await sql`select public.confirm_consult_with_plan(${appts[1]}, ${parent}) as r`)[0].r, 'no_credit');
      await sql`update public.appointments set status = 'cancelled', cancel_reason = 'parent' where id = ${appts[0]}`;
      assertEquals((await sql`select public.return_plan_credit(${appts[0]}, 'parent') as r`)[0].r, 'returned');
      assertEquals((await sql`select public.confirm_consult_with_plan(${appts[1]}, ${parent}) as r`)[0].r, 'confirmed');
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: 'db (review #1): parent cancel after the plan month ended → expired; doctor → rebook_owed',
  ignore: !target,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const sql = await connect();
    try {
      const { parent, period, appts } = await seed(sql, 3, 2);
      for (const a of appts) {
        assertEquals((await sql`select public.confirm_consult_with_plan(${a}, ${parent}) as r`)[0].r, 'confirmed');
      }
      // The month ends (book at month end, cancel in the next one).
      await sql`update public.care_plan_periods set period_start = now() - interval '31 days', period_end = now() - interval '1 minute' where id = ${period}`;
      await sql`update public.appointments set status = 'cancelled', cancel_reason = 'parent' where id = any(${appts})`;
      assertEquals((await sql`select public.return_plan_credit(${appts[0]}, 'parent') as r`)[0].r, 'expired');
      assertEquals((await sql`select public.return_plan_credit(${appts[1]}, 'doctor') as r`)[0].r, 'rebook_owed');
    } finally {
      await sql.end();
    }
  },
});
