// A step's screenshot with the spectral FocusGlow, or a grey Placeholder when the image is
// missing or fails to load. The glow is scaled from screenshot pixels to the displayed size.
//
// Stepping keeps the previous image on screen until the next one has loaded and decoded, so a
// half-painted image is never shown (UI-09). The run's other screenshots are fetched in the
// background, nearest steps first. A portrait image (The Phantom's phone) is fitted by height in
// a simple phone frame, so the whole screen shows with no scrolling box (UI-14).

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useRunSource } from '../data/hooks';
import type { FocusBox, Run, Step } from '../data/types';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { BLANK_CAPTION, isBlankPixels, isPortrait, SLOW_LOAD_CAPTION } from '../model/blank';
import { preloadOrder } from '../model/preload';
import { pageName } from '../model/sites';
import styles from './Screenshot.module.css';

/** Reference size for drawing a focus box over the Placeholder. */
export const PLACEHOLDER_SIZE = { w: 1280, h: 800 } as const;

/** How many screenshots are fetched at once in the background. */
const PRELOAD_PARALLEL = 3;

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

/** Fetches and decodes the run's screenshots, nearest steps first, and keeps them alive. */
function usePreloadScreenshots(run: Run, currentN: number) {
  const source = useRunSource();
  const kept = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    let cancelled = false;
    const urls = preloadOrder(run, currentN)
      .map((path) => source.screenshotUrl(run, path))
      .filter((u): u is string => u !== null && !kept.current.has(u));
    let next = 0;
    const worker = async () => {
      while (!cancelled && next < urls.length) {
        const url = urls[next++]!;
        if (kept.current.has(url)) continue;
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        kept.current.set(url, img);
        try {
          if (typeof img.decode === 'function') await img.decode();
        } catch {
          // A file that fails here fails again, and is reported, when its step is shown.
        }
      }
    };
    for (let i = 0; i < PRELOAD_PARALLEL; i++) void worker();
    return () => {
      cancelled = true;
    };
  }, [run, currentN, source]);
}

/** Samples the image on a small canvas. Returns null where there is no canvas to ask. */
function looksBlank(img: HTMLImageElement): boolean | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(img, 0, 0, 24, 24);
    return isBlankPixels(context.getImageData(0, 0, 24, 24).data);
  } catch {
    return null;
  }
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

interface Shown {
  url: string;
  w: number;
  h: number;
  blank: boolean;
}

export function Screenshot({ run, step }: { run: Run; step: Step }) {
  const source = useRunSource();
  const url = step.screenshot ? source.screenshotUrl(run, step.screenshot) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // The last image that finished loading and decoding. It stays on screen until the next one has.
  const [shown, setShown] = useState<Shown | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(frameRef);
  usePreloadScreenshots(run, step.n);

  const showImage = url !== null && failedUrl !== url;
  const ready = showImage && shown !== null && shown.url === url;
  // While the next image loads, the previous one is still drawn, and sets the box.
  const stale = showImage && shown !== null && shown.url !== url && failedUrl !== shown.url ? shown : null;
  const display = ready ? shown : stale;
  const portrait = showImage && display !== null && isPortrait(display.w, display.h);
  const reference = showImage ? (ready ? { w: shown.w, h: shown.h } : null) : PLACEHOLDER_SIZE;
  const scale = reference && width > 0 ? width / reference.w : 0;
  // The opening step of a slow 3G walk is still loading (its wait is in the run). Any other blank
  // screen gets a plain caption that names no cause, because the run files don't say why.
  const slowLoad = ready && shown.blank && run.ghost === 'phantom' && step.n === run.steps[0]?.n;
  const otherBlank = ready && shown.blank && !slowLoad;

  const finish = (img: HTMLImageElement, forUrl: string) => {
    const done = () =>
      setShown({
        url: forUrl,
        w: img.naturalWidth || PLACEHOLDER_SIZE.w,
        h: img.naturalHeight || PLACEHOLDER_SIZE.h,
        blank: looksBlank(img) === true,
      });
    if (typeof img.decode === 'function') img.decode().then(done, done);
    else done();
  };

  const boxClass = [
    styles.box,
    showImage ? '' : styles.placeholderBox,
    showImage && display === null ? styles.pending : '',
    portrait ? styles.phone : '',
  ]
    .filter(Boolean)
    .join(' ');
  const boxStyle = portrait && display ? ({ '--ratio': display.w / display.h } as CSSProperties) : undefined;

  return (
    <div className={styles.scroller}>
      <div className={styles.frame}>
        {/* The box is what the glow is measured against: the whole image, or the grey 16:10 box
            and its caption. In fit mode a Placeholder box is narrower, so its caption still fits
            in the same height as a screenshot. */}
        <div ref={frameRef} className={boxClass} style={boxStyle} data-testid="screenshot-box" data-portrait={portrait}>
          {showImage ? (
            <>
              {stale && <img key={stale.url} src={stale.url} alt="" aria-hidden="true" className={styles.image} />}
              <img
                key={url}
                src={url}
                alt={`Screenshot of ${pageName(run.site.name, step.page)} at step ${step.n}`}
                className={ready ? styles.image : styles.loading}
                onLoad={(event) => finish(event.currentTarget, url)}
                onError={() => setFailedUrl(url)}
              />
            </>
          ) : (
            <div role="img" aria-label={`No screenshot for step ${step.n}`}>
              {/* The grey 16:10 box is the focus-box reference area. The label sits in its own
                  caption strip under it, so the label and the glow can never overlap. */}
              <div className={styles.placeholder} />
              <div className={styles.caption} aria-hidden="true">
                No screenshot for step {step.n}
              </div>
            </div>
          )}
          {slowLoad && (
            <p className={styles.slowCaption} data-testid="slow-load-caption">
              {SLOW_LOAD_CAPTION}
            </p>
          )}
          {otherBlank && (
            <p className={styles.slowCaption} data-testid="blank-caption">
              {BLANK_CAPTION}
            </p>
          )}
          {step.focusBox && scale > 0 && <FocusGlow box={step.focusBox} scale={scale} />}
        </div>
      </div>
    </div>
  );
}
