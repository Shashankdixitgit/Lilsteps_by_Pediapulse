'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Section each nav item owns; Queue also owns the consult pages it opens. */
function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/' || pathname.startsWith('/consultations');
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  // usePathname() is relative to basePath (/doctor), so hrefs compare as-is.
  const active = isActive(usePathname() ?? '/', href);
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'inline-flex items-center rounded-full bg-[var(--accent-pale)] px-3 py-1 text-[14px] font-semibold text-[var(--ink)]'
          : 'link-underline inline-flex items-center px-3 py-1 text-[14px] font-medium text-[var(--ink-2)] hover:text-[var(--ink)]'
      }
    >
      {children}
    </Link>
  );
}
