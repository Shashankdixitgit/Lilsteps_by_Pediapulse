// An in-memory stand-in for the Supabase admin client, for unit tests only.
// Covers the query-builder calls the edge functions make (select / insert /
// update / delete with eq, in, not-in, is, lt, lte, gte, or, order, limit,
// range, maybeSingle, single), plus auth.admin and storage stubs, the 0052
// one-refund-alert unique index, and the FK effects of deleting a parent.
//
// Razorpay is faked separately with stubRazorpay(): it replaces fetch.

// deno-lint-ignore-file no-explicit-any
export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

/** Reads `col` or a JSON path `payload->>key` from a row (as text, like PostgREST). */
function get(row: Row, key: string): any {
  const m = /^(\w+)->>(\w+)$/.exec(key);
  if (m) {
    const v = row[m[1]]?.[m[2]];
    return v === undefined || v === null ? null : String(v);
  }
  return row[key];
}

function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** PostgREST `or=(...)` syntax: a.eq.x, b.lt.y, c.is.null, and(...), or(...). */
function orPredicate(expr: string): (r: Row) => boolean {
  const term = (t: string): ((r: Row) => boolean) => {
    const group = /^(and|or)\((.*)\)$/.exec(t);
    if (group) {
      const parts = splitTop(group[2]).map(term);
      return group[1] === 'and' ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r));
    }
    const [col, op, ...rest] = t.split('.');
    const val = rest.join('.').replace(/^"(.*)"$/, '$1');
    switch (op) {
      case 'eq':
        return (r) => String(get(r, col)) === val;
      case 'lt':
        return (r) => get(r, col) !== null && get(r, col) !== undefined && String(get(r, col)) < val;
      case 'gte':
        return (r) => String(get(r, col)) >= val;
      case 'is':
        return (r) => (val === 'null' ? get(r, col) === null || get(r, col) === undefined : String(get(r, col)) === val);
      default:
        throw new Error(`fakeAdmin: or() op ${op} not supported`);
    }
  };
  const parts = splitTop(expr).map(term);
  return (r) => parts.some((p) => p(r));
}

let seq = 0;
function uuid(): string {
  seq++;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

/** 0052: one queued / sent refund alert per payment. */
function violatesUnique(table: string, row: Row, rows: Row[]): boolean {
  if (table !== 'notification_log') return false;
  const live = (r: Row) => r.template === 'refund_alert' && ['queued', 'sent'].includes(r.status);
  if (!live(row)) return false;
  return rows.some((r) => r !== row && live(r) && r.payload?.payment_id === row.payload?.payment_id);
}

export interface FakeAdmin {
  client: any;
  tables: Tables;
  deletedUsers: string[];
  removedFiles: string[];
}

export function fakeAdmin(
  tables: Tables,
  opts: { users?: Record<string, { email?: string }>; rpc?: (name: string, args: any) => any } = {},
): FakeAdmin {
  const state: FakeAdmin = { client: null, tables, deletedUsers: [], removedFiles: [] };
  const rowsOf = (t: string) => (tables[t] ??= []);

  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
    let patch: Row | null = null;
    let inserts: Row[] = [];
    let limit: number | null = null;
    let range: [number, number] | null = null;
    let headCount = false;

    const run = (mode: 'many' | 'one'): Promise<{ data: any; error: any; count?: number }> => {
      const rows = rowsOf(table);
      if (op === 'insert') {
        const made: Row[] = [];
        for (const r of inserts) {
          const row = { id: uuid(), created_at: new Date().toISOString(), ...structuredClone(r) };
          if (violatesUnique(table, row, rows)) {
            return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key' } });
          }
          rows.push(row);
          made.push(row);
        }
        return Promise.resolve({ data: mode === 'one' ? (made[0] ?? null) : made, error: null });
      }
      let hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        hit.forEach((r) => Object.assign(r, structuredClone(patch)));
      } else if (op === 'delete') {
        tables[table] = rows.filter((r) => !hit.includes(r));
        cascadeDelete(table, hit);
      }
      if (range) hit = hit.slice(range[0], range[1] + 1);
      if (limit !== null) hit = hit.slice(0, limit);
      if (headCount) return Promise.resolve({ data: null, error: null, count: hit.length });
      const data = hit.map((r) => structuredClone(r));
      return Promise.resolve({ data: mode === 'one' ? (data[0] ?? null) : data, error: null });
    };

    const api: any = {
      select: (_cols?: string, o?: { head?: boolean }) => {
        if (o?.head) headCount = true;
        return api;
      },
      insert: (r: Row | Row[]) => ((op = 'insert'), (inserts = Array.isArray(r) ? r : [r]), api),
      update: (p: Row) => ((op = 'update'), (patch = p), api),
      delete: () => ((op = 'delete'), api),
      eq: (k: string, v: unknown) => (filters.push((r) => get(r, k) != null && String(get(r, k)) === String(v)), api),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.map(String).includes(String(get(r, k)))), api),
      not: (k: string, o: string, v: string) => {
        if (o !== 'in') throw new Error(`fakeAdmin: not ${o}`);
        const vs = v.replace(/^\(|\)$/g, '').split(',');
        filters.push((r) => !vs.includes(String(get(r, k))));
        return api;
      },
      is: (k: string, v: null) => (filters.push((r) => (get(r, k) ?? null) === v), api),
      lt: (k: string, v: string) => (filters.push((r) => get(r, k) < v), api),
      lte: (k: string, v: string) => (filters.push((r) => get(r, k) <= v), api),
      gte: (k: string, v: string) => (filters.push((r) => get(r, k) >= v), api),
      or: (expr: string) => (filters.push(orPredicate(expr)), api),
      order: () => api,
      returns: () => api,
      limit: (n: number) => ((limit = n), api),
      range: (a: number, b: number) => ((range = [a, b]), api),
      maybeSingle: () => run('one'),
      single: () => run('one'),
      then: (res: any, rej: any) => run('many').then(res, rej),
    };
    return api;
  };

  /** The FKs that matter here: parents → appointments cascade; payments / notification_log set null. */
  function cascadeDelete(table: string, gone: Row[]) {
    const ids = new Set(gone.map((r) => r.id));
    if (table === 'parents') {
      const appts = rowsOf('appointments').filter((a) => ids.has(a.parent_id));
      tables.appointments = rowsOf('appointments').filter((a) => !ids.has(a.parent_id));
      tables.children = rowsOf('children').filter((c) => !ids.has(c.parent_id));
      for (const p of rowsOf('payments')) if (ids.has(p.parent_id)) p.parent_id = null;
      for (const n of rowsOf('notification_log')) if (ids.has(n.parent_id)) n.parent_id = null;
      cascadeDelete('appointments', appts);
    }
    if (table === 'appointments') {
      for (const p of rowsOf('payments')) if (ids.has(p.appointment_id)) p.appointment_id = null;
      for (const n of rowsOf('notification_log')) if (ids.has(n.appointment_id)) n.appointment_id = null;
    }
  }

  state.client = {
    from,
    rpc: (name: string, args: any) => Promise.resolve({ data: opts.rpc?.(name, args) ?? null, error: null }),
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({ data: { user: opts.users?.[id] ? { id, ...opts.users[id] } : null }, error: null }),
        deleteUser: (id: string) => {
          state.deletedUsers.push(id);
          return Promise.resolve({ data: null, error: null });
        },
      },
    },
    storage: {
      from: (_bucket: string) => ({
        list: () => Promise.resolve({ data: [], error: null }),
        remove: (paths: string[]) => {
          state.removedFiles.push(...paths);
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
  };
  return state;
}

/** Replaces fetch with a fake Razorpay. `refund` sets the refund answer. */
export function stubRazorpay(refund: { status: number; body?: unknown } = { status: 200, body: { id: 'rfnd_1', status: 'processed' } }) {
  Deno.env.set('RAZORPAY_KEY_ID', 'rzp_test_x');
  Deno.env.set('RAZORPAY_KEY_SECRET', 'secret');
  const calls: Array<{ url: string; body: any }> = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: String(url), body });
    if (String(url).includes('/refund')) {
      return Promise.resolve(new Response(JSON.stringify(refund.body ?? {}), { status: refund.status }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as typeof fetch;
  return calls;
}
