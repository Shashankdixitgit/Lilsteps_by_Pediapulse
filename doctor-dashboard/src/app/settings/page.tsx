import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MeetLinkForm } from './meet-form';
import { GoogleLink } from './google-link';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let meetLink: string | null = null;
  let googleEmail: string | null = null;

  if (user) {
    const { data: auth } = await supabase
      .from('doctor_auth')
      .select('doctor_id')
      .eq('id', user.id)
      .maybeSingle<{ doctor_id: string }>();
    if (auth) {
      const [{ data: doc }, { data: tok }] = await Promise.all([
        supabase
          .from('doctors')
          .select('default_meet_link')
          .eq('id', auth.doctor_id)
          .maybeSingle<{ default_meet_link: string | null }>(),
        supabase
          .from('doctor_google_tokens')
          .select('google_email')
          .eq('doctor_id', auth.doctor_id)
          .maybeSingle<{ google_email: string | null }>(),
      ]);
      meetLink = doc?.default_meet_link ?? null;
      googleEmail = tok?.google_email ?? null;
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-12">
      <header className="mb-10 fade-up">
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          Practice
        </div>
        <h1 className="mt-2 font-display text-[40px] leading-tight text-[var(--ink)]">
          Settings
        </h1>
        <p className="mt-2 text-[15px] text-[var(--ink-3)]">
          Configuration for your consultations.
        </p>
      </header>

      <section className="border-t border-[var(--hairline)] pt-8">
        <h2 className="mb-6 font-display text-[22px] leading-tight text-[var(--ink)]">
          Auto Meet via Google Calendar
        </h2>
        <GoogleLink initialEmail={googleEmail} />
      </section>

      <section className="mt-12 border-t border-[var(--hairline)] pt-8">
        <h2 className="mb-2 font-display text-[22px] leading-tight text-[var(--ink)]">
          Fallback video room
        </h2>
        <p className="mb-5 text-[15px] leading-[1.55] text-[var(--ink-3)]">
          Used when Google Calendar isn&apos;t connected, or when the per-appointment
          Calendar event fails.
        </p>
        <MeetLinkForm initialLink={meetLink} />
      </section>
    </main>
  );
}
