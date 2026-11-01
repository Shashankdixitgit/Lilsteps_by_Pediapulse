'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps the thread anchored on its newest message. Scrolls to the end on
 * first render, and again when a message arrives if the doctor sent it or
 * was already reading near the bottom (so reading older messages is never
 * yanked away). Renders an empty end-of-thread marker.
 */
export function ScrollToLatest({ count, lastFromDoctor }: { count: number; lastFromDoctor: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef<number | null>(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    const onScroll = () => {
      const el = document.scrollingElement ?? document.documentElement;
      nearBottom.current = el.scrollHeight - (el.scrollTop + window.innerHeight) < 320;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const first = seen.current === null;
    const grew = !first && count > (seen.current ?? 0);
    seen.current = count;
    if (first || (grew && (lastFromDoctor || nearBottom.current))) {
      ref.current?.scrollIntoView({ block: 'end', behavior: first ? 'auto' : 'smooth' });
    }
  }, [count, lastFromDoctor]);

  return <div ref={ref} aria-hidden="true" />;
}
