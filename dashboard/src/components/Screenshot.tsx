// A step's screenshot with the spectral FocusGlow, or a grey Placeholder when the image is
// missing or fails to load. The glow is scaled from screenshot pixels to the displayed size.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useRunSource } from '../data/hooks';
import type { FocusBox, Run, Step } from '../data/types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import styles from './Screenshot.module.css';

/** Reference size for drawing a focus box over the Placeholder. */
export const PLACEHOLDER_SIZE = { w: 1280, h: 800 } as const;

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function FocusGlow({ box, scale }: { box: FocusBox; scale: number }) {
  const reduced = useReducedMotion();
  return (
    <div
      className={`${styles.glow} ${reduced ? '' : 'motion-glow-pulse'}`}
      aria-hidden="true"
      data-testid="focus-glow"
      style={{
        left: `${box.x * scale}px`,
        top: `${box.y * scale}px`,
        width: `${box.w * scale}px`,
        height: `${box.h * scale}px`,
      }}
    />
  );
}

export function Screenshot({ run, step }: { run: Run; step: Step }) {
  const source = useRunSource();
  const url = step.screenshot ? source.screenshotUrl(run, step.screenshot) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ url: string; w: number; h: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frameRef);

  const showImage = url !== null && failedUrl !== url;
  const reference = showImage
    ? natural && natural.url === url
      ? { w: natural.w, h: natural.h }
      : null
    : PLACEHOLDER_SIZE;
  const scale = reference && width > 0 ? width / reference.w : 0;

  return (
    <div className={styles.scroller}>
      <div ref={frameRef} className={showImage ? styles.frame : `${styles.frame} ${styles.placeholderFrame}`}>
        {showImage ? (
          <img
            key={url}
            src={url}
            alt={`Screenshot of ${step.page} at step ${step.n}`}
            className={styles.image}
            onLoad={(event) => {
              const img = event.currentTarget;
              setNatural({ url, w: img.naturalWidth || PLACEHOLDER_SIZE.w, h: img.naturalHeight || PLACEHOLDER_SIZE.h });
            }}
            onError={() => setFailedUrl(url)}
          />
        ) : (
          <div className={styles.placeholder} role="img" aria-label={`No screenshot for step ${step.n}`}>
            <span aria-hidden="true">No screenshot for step {step.n}</span>
          </div>
        )}
        {step.focusBox && scale > 0 && <FocusGlow box={step.focusBox} scale={scale} />}
      </div>
    </div>
  );
}
