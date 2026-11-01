'use client';

import { useEffect, useState } from 'react';
import { CLINIC_TZ } from '@/lib/format';

function istMinutesNow(): number {
  const [h, m] = new Date()
    .toLocaleTimeString('en-GB', { timeZone: CLINIC_TZ, hour12: false })
    .split(':')
    .map(Number);
  return h * 60 + m;
}

/**
 * The red "now" line across today's column. Client-only (it renders nothing
 * until mounted) so the server's clock never disagrees with the browser's,
 * and it moves once a minute.
 */
export function NowLine({ startHour, endHour, hourPx }: { startHour: number; endHour: number; hourPx: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(istMinutesNow());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  if (now === null || now < startHour * 60 || now > endHour * 60) return null;
  const top = ((now - startHour * 60) / 60) * hourPx;
  return (
    <>
      {/* The line runs under the visit chips (z-10) so it never strikes
          through a child's name; only the dot sits above them. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 z-[5] h-[2px] bg-[var(--coral)]" style={{ top }} />
      <span
        aria-hidden
        className="pointer-events-none absolute -left-[5px] z-20 h-[10px] w-[10px] rounded-full bg-[var(--coral)]"
        style={{ top: top - 4 }}
      />
    </>
  );
}
