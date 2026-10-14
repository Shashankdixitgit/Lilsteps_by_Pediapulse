import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SignOutButton } from './sign-out-button';
import { UnreadBadge } from './unread-badge';

export async function DashboardNav() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Who is signed in, so a shared clinic computer shows whose queue this is.
  const { data: me } = await supabase
    .from('doctor_auth')
    .select('doctors(name)')
    .eq('id', user.id)
    .maybeSingle<{ doctors: { name: string } | null }>();
  const doctorName = me?.doctors?.name?.trim() || null;

  return (
    <nav className="sticky top-0 z-20 border-b border-[var(--hairline)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-baseline justify-between gap-x-10 gap-y-3 px-4 py-5 sm:px-8">
        <div className="flex items-baseline gap-10">
          <Link href="/" className="group flex items-baseline gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              LS /
            </span>
            <span className="font-display text-[22px] leading-none tracking-[-0.025em] text-[var(--ink)]">
              LilSteps
            </span>
            <span className="font-display-italic text-[14px] leading-none text-[var(--ink-3)]">
              clinical
            </span>
          </Link>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-7 gap-y-2">
          <NavLink href="/">Queue</NavLink>
          <NavLink href="/conversations">
            Messages
            <UnreadBadge />
          </NavLink>
          <NavLink href="/prescriptions">Prescriptions</NavLink>
          <NavLink href="/availability">Availability</NavLink>
          <NavLink href="/settings">Settings</NavLink>
          <span className="text-[var(--hairline-strong)]">·</span>
          {doctorName ? (
            <span
              className="text-[13px] text-[var(--ink-2)]"
              title={user.email ? `Signed in as ${doctorName} (${user.email})` : `Signed in as ${doctorName}`}
            >
              <span className="sr-only">Signed in as </span>
              {doctorName}
            </span>
          ) : null}
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="link-underline text-[13px] uppercase tracking-[0.14em] text-[var(--ink-2)] hover:text-[var(--ink)]"
    >
      {children}
    </Link>
  );
}
