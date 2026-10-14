import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MeetLinkForm } from './meet-form';
import { GoogleLink } from './google-link';
import { RegistrationForm } from './registration-form';

// Option B (a Calendar event + Meet link per booking) needs the clinic's own
// Google OAuth client set up in Supabase Auth first. Until then the Connect
// button would only fail, so it stays hidden. Set
// NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED=true once the Google provider is on.
const GOOGLE_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_ENABLED === 'true';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let meetLink: string | null = null;
  let googleEmail: string | null = null;
  let registration: string | null = null;

  if (user) {
    const { data: auth } = await supabase
      .from('doctor_auth')
      .select('doctor_id')
      .eq('id', user.id)
      .maybeSingle<{ doctor_id: string }>();
    if (auth) {
      const [{ data: doc }, { data: tok }, { data: profile }] = await Promise.all([
        // default_meet_link is not readable through the table (0036); the
        // doctor's own room comes from get_my_meet_link.
        supabase.rpc('get_my_meet_link').returns<string | null>(),
        supabase
          .from('doctor_google_tokens')
          .select('google_email')
          .eq('doctor_id', auth.doctor_id)
          .maybeSingle<{ google_email: string | null }>(),
        // registration_number is readable (0040 column grant), unlike the Meet room.
        supabase
          .from('doctors')
          .select('registration_number')
          .eq('id', auth.doctor_id)
          .maybeSingle<{ registration_number: string | null }>(),
      ]);
      meetLink = (doc as string | null) ?? null;
      googleEmail = tok?.google_email ?? null;
      registration = profile?.registration_number ?? null;
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
        <h2 className="mb-2 font-display text-[22px] leading-tight text-[var(--ink)]">
          Your video room
        </h2>
        <p className="mb-5 text-[15px] leading-[1.55] text-[var(--ink-3)]">
          Parents join this Google Meet room for every video consult with you.
          {googleEmail
            ? ' Google Calendar is connected, so bookings get their own Meet link and this room is the backup.'
            : ''}
        </p>
        <MeetLinkForm initialLink={meetLink} />
      </section>

      <section className="mt-12 border-t border-[var(--hairline)] pt-8">
        <h2 className="mb-2 font-display text-[22px] leading-tight text-[var(--ink)]">
          Registration
        </h2>
        <p className="mb-5 text-[15px] leading-[1.55] text-[var(--ink-3)]">
          Shown on the prescriptions you issue.
        </p>
        <RegistrationForm initial={registration} />
      </section>

      <section className="mt-12 border-t border-[var(--hairline)] pt-8">
        <h2 className="mb-6 font-display text-[22px] leading-tight text-[var(--ink)]">
          A new Meet link for each booking
        </h2>
        {GOOGLE_CALENDAR_ENABLED || googleEmail ? (
          <GoogleLink initialEmail={googleEmail} />
        ) : (
          <p className="text-[15px] leading-[1.55] text-[var(--ink-3)]">
            Not switched on for this clinic yet. When it is, you can connect Google Calendar here
            and every booking will get its own Meet link. Until then, parents use your video room
            above.
          </p>
        )}
      </section>
    </main>
  );
}
