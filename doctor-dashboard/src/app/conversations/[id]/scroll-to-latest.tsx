'use client';

import { useEffect, useRef } from 'react';

/**
 * Keeps the thread anchored on its newest message. Scrolls the thread pane
 * (the nearest [data-thread-scroll] ancestor) to the end on first render,
 * and again when a message arrives if the doctor sent it or was already
 * reading near the bottom (so reading older messages is never yanked away).
 * Renders an empty end-of-thread marker.
 */
export function ScrollToLatest({ count, lastFromDoctor }: { count: number; lastFromDoctor: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef<number | null>(null);
  const nearBottom = useRef(true);

  useEffect(() => {
    const pane = ref.current?.closest<HTMLElement>('[data-thread-scroll]');
    if (!pane) return;
    const onScroll = () => {
      nearBottom.current = pane.scrollHeight - (pane.scrollTop + pane.clientHeight) < 240;
    };
    pane.addEventListener('scroll', onScroll, { passive: true });
    return () => pane.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const first = seen.current === null;
    const grew = !first && count > (seen.current ?? 0);
    seen.current = count;
    if (!(first || (grew && (lastFromDoctor || nearBottom.current)))) return;
    const pane = ref.current?.closest<HTMLElement>('[data-thread-scroll]');
    if (pane) pane.scrollTo({ top: pane.scrollHeight, behavior: first ? 'auto' : 'smooth' });
  }, [count, lastFromDoctor]);

  return <div ref={ref} aria-hidden="true" />;
}
