import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SignOutButton } from './sign-out-button';

export async function DashboardNav() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <nav className="sticky top-0 z-20 border-b border-[var(--hairline)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-10 px-8 py-5">
        <div className="flex items-baseline gap-10">
          <Link href="/" className="group flex items-baseline gap-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
              PP /
            </span>
            <span className="font-display text-[22px] leading-none tracking-[-0.025em] text-[var(--ink)]">
              Pedia Pulse
            </span>
            <span className="font-display-italic text-[14px] leading-none text-[var(--ink-3)]">
              clinical
            </span>
          </Link>
        </div>
        <div className="flex items-baseline gap-7">
          <NavLink href="/">Queue</NavLink>
          <NavLink href="/conversations">Messages</NavLink>
          <NavLink href="/prescriptions">Prescriptions</NavLink>
          <NavLink href="/availability">Availability</NavLink>
          <NavLink href="/settings">Settings</NavLink>
          <span className="text-[var(--hairline-strong)]">·</span>
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
