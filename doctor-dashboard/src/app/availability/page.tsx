import { createSupabaseServerClient } from '@/lib/supabase/server';
import { GenerateForm } from './generate-form';
import { SlotsDay, type DaySlots } from './slots-day';

type SlotRow = {
  id: string;
  date: string;
  time: string;
  is_available: boolean;
};

export default async function AvailabilityPage() {
  const supabase = await createSupabaseServerClient();
  // Clinic-local (IST). The server is UTC, so a 5am-IST visit on May 31
  // would otherwise compute 'today' as May 30 and show stale slots.
  const todayIso = new Date()
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const { data, error } = await supabase
    .from('time_slots')
    .select('id, date, time, is_available')
    .gte('date', todayIso)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .returns<SlotRow[]>();

  // Group by date
  const byDate = new Map<string, DaySlots>();
  (data ?? []).forEach((s) => {
    const existing = byDate.get(s.date);
    if (existing) existing.items.push(s);
    else byDate.set(s.date, { date: s.date, items: [s] });
  });
  const days = Array.from(byDate.values());

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-16">
      <header className="mb-12 fade-up">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
          Calendar
        </div>
        <h1 className="mt-4 font-display text-[56px] leading-[0.95] tracking-[-0.03em] text-[var(--ink)]">
          Your <span className="font-display-italic">availability</span>
        </h1>
        <p className="mt-4 max-w-xl font-display-italic text-[18px] leading-[1.55] text-[var(--ink-2)]">
          Open and close slots from here. Parents only see slots marked open.
        </p>
      </header>

      {error && (
        <div className="border-l-2 border-[var(--alert)] px-5 py-4 font-mono text-[13px] text-[var(--alert)]">
          {error.message}
        </div>
      )}

      <section className="mb-14">
        {days.length === 0 ? (
          <div className="border-t border-[var(--hairline)] py-20 text-center">
            <p className="font-display-italic text-[26px] text-[var(--ink-3)]">
              No upcoming slots.
            </p>
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-4)]">
              Generate a window below to get started.
            </p>
          </div>
        ) : (
          <ol className="space-y-0">
            {days.map((day) => (
              <SlotsDay key={day.date} day={day} />
            ))}
            <li className="border-t border-[var(--hairline)]" />
          </ol>
        )}
      </section>

      <GenerateForm />
    </main>
  );
}
