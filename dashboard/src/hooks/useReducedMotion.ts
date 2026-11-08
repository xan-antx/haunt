import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: no-preference)';

function allowsMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/**
 * True unless the user has said motion is fine. Like motion.css, this treats
 * "no matching preference" as reduced, so nothing moves by default.
 * Gates JavaScript-driven motion such as the waveform and the focus glow pulse.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => !allowsMotion());
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(QUERY);
    const update = () => setReduced(!query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return reduced;
}
