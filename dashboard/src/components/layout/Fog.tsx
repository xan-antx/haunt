// Fog: two layered, blurred SVG gradients. Decorative only; hidden from assistive technology.
// On the Haunted Map it covers rooms the selected ghost never entered. Behind the header it
// separates navigation from content. It drifts only when the user's motion setting allows it.

import { useId } from 'react';
import styles from './Fog.module.css';

export function Fog({ className, dense = false }: { className?: string; dense?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className={[styles.fog, dense ? styles.dense : '', className ?? ''].filter(Boolean).join(' ')} aria-hidden="true">
      {[0, 1].map((layer) => (
        <svg
          key={layer}
          className={`${styles.layer} ${layer === 1 ? styles.second : ''} motion-fog-layer ${layer === 1 ? 'motion-fog-slow' : ''}`}
          viewBox="0 0 400 100"
          preserveAspectRatio="none"
          focusable="false"
        >
          <defs>
            <radialGradient id={`${id}-g${layer}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" className={styles.stopInner} />
              <stop offset="100%" className={styles.stopOuter} />
            </radialGradient>
            <filter id={`${id}-b${layer}`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          <g filter={`url(#${id}-b${layer})`} fill={`url(#${id}-g${layer})`}>
            <ellipse cx={layer ? 60 : 30} cy="60" rx="70" ry="28" />
            <ellipse cx={layer ? 170 : 140} cy="45" rx="80" ry="26" />
            <ellipse cx={layer ? 260 : 230} cy="65" rx="70" ry="30" />
            <ellipse cx={layer ? 370 : 340} cy="50" rx="80" ry="26" />
          </g>
        </svg>
      ))}
    </div>
  );
}
