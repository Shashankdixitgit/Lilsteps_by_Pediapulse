'use client';

import { useEffect, useRef } from 'react';

/** The hour grid's scroll box; opens scrolled to `scrollTo` px (now, or the first visit). */
export function GridScroller({
  scrollTo,
  className,
  children,
}: {
  scrollTo: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = Math.max(0, scrollTo);
  }, [scrollTo]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
