#!/bin/bash
# Throwaway Postgres checks for the Care Plan migrations (0053, 0054).
#   PGBIN=/opt/homebrew/opt/postgresql@16/bin tests/sql/run.sh
#   (UPDATE_EXPECTED=1 rewrites the expected output after a reviewed change)
# Starts a private cluster in $TMPDIR, applies supabase/migrations/00*.sql on
# top of stubs.sql (Supabase's auth / storage / cron / roles, minimal), runs
# 0053_care_plan.sql and the two-session race for the last credit, then
# 0054_care_plan_sync.sql, compares with the .expected files, and stops the cluster.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../.." && pwd)
PGBIN=${PGBIN:-$(dirname "$(command -v pg_ctl)")}
DIR=$(mktemp -d "${TMPDIR:-/tmp}/lilsteps-pg.XXXXXX")
PORT=${PORT:-55499}
"$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/pg.log" -w start >/dev/null
trap '"$PGBIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null; rm -rf "$DIR"' EXIT
P="$PGBIN/psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PGBIN/createdb -h "$DIR" -p "$PORT" -U postgres t
$P -d t -f "$HERE/stubs.sql" >/dev/null 2>&1
for f in "$ROOT"/supabase/migrations/00*.sql; do
  sed -E 's/^create extension if not exists pg_cron.*$//' "$f" | $P -d t -1 -f - >/dev/null 2>"$DIR/err" \
    || { echo "FAILED $(basename "$f")"; cat "$DIR/err"; exit 1; }
done
echo "applied $(ls "$ROOT"/supabase/migrations/00*.sql | wc -l | tr -d ' ') migrations"

$P -d t -f "$HERE/0053_care_plan.sql" > "$DIR/out.txt" 2>&1

# Race: two bookings for the last credit at the same moment. Session 1 takes
# it and holds its transaction open for 2 s; session 2 must wait for the
# month row's lock and then be told 'no_credit' (never a 4th consult).
$P -d t -At > "$DIR/race-setup.txt" <<'SQL'
-- The running month: exactly two credits used, one left.
delete from care_plan_credit_uses where period_id = '9b000000-0000-0000-0000-000000000001';
insert into care_plan_credit_uses (period_id, parent_id) values
 ('9b000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1'),
 ('9b000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1');
insert into appointments (id, child_id, parent_id, doctor_id, date, time, status, hold_expires_at) values
 ('aaaaaaaa-0000-0000-0000-0000000000e1','cccccccc-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001', current_date + 3, '09:00', 'awaiting_payment', now() + interval '20 minutes'),
 ('aaaaaaaa-0000-0000-0000-0000000000e2','cccccccc-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001', current_date + 3, '09:30', 'awaiting_payment', now() + interval '20 minutes');
SQL
( $P -d t -At -c "begin; select 'r1 ' || public.confirm_consult_with_plan('aaaaaaaa-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000a1'); select pg_sleep(2); commit;" > "$DIR/r1.txt" ) &
sleep 0.5
start=$(date +%s)
$P -d t -At -c "select 'r2 ' || public.confirm_consult_with_plan('aaaaaaaa-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000a1');" > "$DIR/r2.txt"
waited=$(( $(date +%s) - start ))
wait
{
  echo "race: session 1 $(grep -o 'r1 .*' "$DIR/r1.txt")"
  echo "race: session 2 $(cat "$DIR/r2.txt") (waited for session 1: $([ "$waited" -ge 1 ] && echo yes || echo no))"
  echo "race: active uses in the month $($P -d t -At -c "select count(*) from care_plan_credit_uses where period_id = '9b000000-0000-0000-0000-000000000001' and status = 'active'")"
} >> "$DIR/out.txt"

# 0054: the Care Plan sync queue (same database, after the 0053 checks).
$P -d t -f "$HERE/0054_care_plan_sync.sql" > "$DIR/out54.txt" 2>&1
$P -d t -1 -f "$ROOT/supabase/migrations/0054_care_plan_sync.sql" >/dev/null 2>&1 \
  && echo "0054: applies twice => OK" >> "$DIR/out54.txt" || echo "0054: applies twice => FAILED" >> "$DIR/out54.txt"

if [ "${UPDATE_EXPECTED:-}" = 1 ]; then
  cp "$DIR/out.txt" "$HERE/0053_care_plan.expected"; cp "$DIR/out54.txt" "$HERE/0054_care_plan_sync.expected"
  echo "expected files updated"; exit 0
fi
fail=0
for n in 0053_care_plan:out 0054_care_plan_sync:out54; do
  exp=${n%%:*}; out=${n##*:}
  if diff -u "$HERE/$exp.expected" "$DIR/$out.txt"; then
    echo "PASS: $(wc -l < "$DIR/$out.txt" | tr -d ' ') checks match $exp.expected"
  else
    echo "FAIL: output differs from $exp.expected"; fail=1
  fi
done
exit $fail

# The Deno race tests against this same database (DENO=path, else deno on PATH).
DENO=${DENO:-$(command -v deno || true)}
if [ -n "$DENO" ]; then
  (cd "$ROOT" && LILSTEPS_TEST_PG="$DIR:$PORT" LILSTEPS_TEST_DB=t "$DENO" test -A --node-modules-dir=none \
    supabase/functions/_shared/carePlan_db_test.ts)
else
  echo "deno not found: skipped supabase/functions/_shared/carePlan_db_test.ts"
fi
