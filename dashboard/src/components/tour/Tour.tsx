// The 60-second tour (Req 22). A modal callout walks through the stops from model/tour.ts,
// opening each stop's screen, outlining its target and keeping focus on its own buttons.
// The rest of the page is inert while it is open. Escape, Skip or Finish close it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Run } from '../../data/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  CALLOUT_MARGIN,
  EDGE_SPACE,
  HIGHLIGHT_PAD,
  NARROW_VIEWPORT,
  buildTour,
  planTour,
  type Box,
  type CalloutSide,
  type Size,
  type TourStop,
} from '../../model/tour';
import styles from './Tour.module.css';

/** How long a stop waits for its target before showing the callout without a highlight (Req 22.5). */
export const TARGET_TIMEOUT_MS = 3000;
const POLL_MS = 50;
/** The outline is 3 px wide (see .ring), and the plan keeps room for the whole highlight. */
const RING_PAD = HIGHLIGHT_PAD - 3;
/** If a scroll has not reached its destination by then (the reader took over), the stop is planned as it is. */
const SETTLE_MS = 1500;
/** How long after a stop begins the tour keeps checking that its target has not moved. */
const WATCH_MS = 3000;

export const TOUR_UNAVAILABLE = 'No ghost has walked here yet, so there is nothing to tour.';

/** Id of Home's "Take the 60-second tour" button, so focus can return to it after a route change. */
export const TOUR_START_ID = 'tour-start';

interface TourApi {
  open: boolean;
  /** Starts the tour for these runs. Focus returns to `invoker` when it closes. */
  start: (runs: Run[], invoker: HTMLElement | null) => void;
}

const TourContext = createContext<TourApi>({ open: false, start: () => {} });

export function useTour(): TourApi {
  return useContext(TourContext);
}

export function TourProvider({ children }: { children: ReactNode }) {
  const [stops, setStops] = useState<TourStop[] | null>(null);
  const [index, setIndex] = useState(0);
  const invoker = useRef<HTMLElement | null>(null);
  const open = stops !== null;

  const start = useCallback((runs: Run[], from: HTMLElement | null) => {
    const built = buildTour(runs);
    if (!built) return;
    invoker.current = from;
    setIndex(0);
    setStops(built);
  }, []);

  const close = useCallback(() => setStops(null), []);

  // Focus goes back where the tour started, or to the screen's h1 (Req 22.8). The layer's
  // layout-effect cleanup has already cleared `inert` by the time this runs.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const el = invoker.current;
    invoker.current = null;
    // If the tour left Home and came back, the button is a new element with the same id.
    const button = el && el.isConnected ? el : document.getElementById(TOUR_START_ID);
    if (button) button.focus();
    else document.querySelector<HTMLElement>('#main-content h1')?.focus();
  }, [open]);

  return (
    <TourContext.Provider value={{ open, start }}>
      {children}
      {stops && (
        <TourLayer
          stops={stops}
          index={index}
          onBack={() => setIndex((i) => Math.max(0, i - 1))}
          onNext={() => (index + 1 < stops.length ? setIndex(index + 1) : close())}
          onClose={close}
        />
      )}
    </TourContext.Provider>
  );
}

function TourLayer({
  stops,
  index,
  onBack,
  onNext,
  onClose,
}: {
  stops: TourStop[];
  index: number;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const [host] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('data-tour-host', '');
    return el;
  });
  // Blank room at the end of the page while the tour is open, so a part near the end of a short
  // page can still be scrolled up to make room for the callout. It lasts across stops, so the page
  // does not jump when one stop hands over to the next.
  const [spacer] = useState(() => {
    const el = document.createElement('div');
    el.setAttribute('data-tour-spacer', '');
    el.setAttribute('aria-hidden', 'true');
    el.style.height = '0px';
    host.appendChild(el);
    return el;
  });

  // Everything else on the page becomes inert while the tour is open (Req 22.6).
  useLayoutEffect(() => {
    document.body.appendChild(host);
    const changed: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === host || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      changed.push(el);
    }
    return () => {
      for (const el of changed) el.removeAttribute('inert');
      host.remove();
    };
  }, [host]);

  // Escape closes the tour wherever focus is (Req 22.8).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const stop = stops[index]!;
  return createPortal(
    // Keyed by stop, so each stop is a new dialog that screen readers announce on focus.
    <TourCallout
      key={stop.id}
      stop={stop}
      spacer={spacer}
      index={index}
      total={stops.length}
      onBack={onBack}
      onNext={onNext}
      onClose={onClose}
    />,
    host,
  );
}

function toBox(rect: DOMRect): Box {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

function viewportSize() {
  return {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: document.documentElement.clientHeight || window.innerHeight,
  };
}

/** A box in document coordinates, so it stays put while the page scrolls. */
function docBox(el: Element): Box {
  const rect = el.getBoundingClientRect();
  return { top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height };
}

/** How far down from the top of the viewport a fixed or sticky header reaches (0 when it scrolls away). */
function fixedTopInset(): number {
  let inset = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  for (const el of Array.from(document.querySelectorAll('header, [role="banner"], nav'))) {
    const position = getComputedStyle(el).position;
    if (position !== 'fixed' && position !== 'sticky') continue;
    const rect = el.getBoundingClientRect();
    if (rect.top <= 1 && rect.bottom > inset) inset = rect.bottom;
  }
  return inset;
}

/** Every line of visible text on the page outside `skip`, in document coordinates. */
function collectText(skip: Element): Box[] {
  const root = document.getElementById('root') ?? document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const boxes: Box[] = [];
  // Not every environment can measure text (jsdom cannot); the callout then just skips this check.
  if (typeof range.getClientRects !== 'function') return boxes;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!parent || !node.nodeValue?.trim() || skip.contains(parent)) continue;
    if (typeof parent.checkVisibility === 'function' && !parent.checkVisibility({ visibilityProperty: true })) continue;
    range.selectNodeContents(node);
    for (const rect of Array.from(range.getClientRects())) {
      // Skips the 1 px visually-hidden text.
      if (rect.width < 4 || rect.height < 4) continue;
      boxes.push({ top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height });
    }
  }
  return boxes;
}

function nextFrame(callback: () => void): () => void {
  if (typeof window.requestAnimationFrame === 'function') {
    const id = window.requestAnimationFrame(callback);
    return () => window.cancelAnimationFrame(id);
  }
  const id = window.setTimeout(callback, 16);
  return () => window.clearTimeout(id);
}

/** The callout can also be this wide (when the room beside the target is not needed), to be shorter. */
const WIDE_CALLOUT_REM = 40;

/** The sizes the callout can take at the current viewport: its usual width first, then a wider one. */
function calloutSizes(el: HTMLElement, viewportWidth: number): Size[] {
  const previous = el.style.width;
  const read = (width: string): Size => {
    el.style.width = width;
    return { width: el.offsetWidth, height: el.offsetHeight };
  };
  const usual = read('');
  const sizes = [usual];
  if (viewportWidth >= NARROW_VIEWPORT) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const wide = Math.min(WIDE_CALLOUT_REM * rem, viewportWidth - 2 * CALLOUT_MARGIN);
    if (wide > usual.width + 40) sizes.push(read(`${wide}px`));
  }
  el.style.width = previous;
  return sizes;
}

function TourCallout({
  stop,
  spacer,
  index,
  total,
  onBack,
  onNext,
  onClose,
}: {
  stop: TourStop;
  spacer: HTMLElement;
  index: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const here = location.pathname + location.search;
  const titleId = useId();
  const bodyId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<Element | null>(null);
  const [resolved, setResolved] = useState(false);
  // `width` is set only when the callout takes a width other than its usual one.
  const [place, setPlace] = useState<{ top: number; left: number; side: CalloutSide; width: number | null } | null>(null);
  const [ring, setRing] = useState<Box | null>(null);
  const [narrow, setNarrow] = useState(() => viewportSize().width < NARROW_VIEWPORT);
  const first = index === 0;
  const last = index === total - 1;

  // Open the stop's screen, and come back to it if the browser's Back button leaves it (Req 22.4).
  useEffect(() => {
    if (here !== stop.path) navigate(stop.path);
  }, [here, stop.path, navigate]);

  // Find the target once the stop's screen has loaded (Req 22.5).
  useEffect(() => {
    if (here !== stop.path) return;
    let cancelled = false;
    let timer = 0;
    const startedAt = Date.now();
    const look = () => {
      if (cancelled) return;
      const main = document.getElementById('main-content');
      const found = main ? (stop.targets.map((sel) => main.querySelector(sel)).find((el) => el !== null) ?? null) : null;
      if (found || Date.now() - startedAt >= TARGET_TIMEOUT_MS) {
        setTarget(found);
        setResolved(true);
        return;
      }
      timer = window.setTimeout(look, POLL_MS);
    };
    timer = window.setTimeout(look, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [here, stop.path, stop.targets]);

  // Plan the stop: scroll so the target is fully on screen with room around it, put the callout
  // where it covers neither the target nor (where avoidable) other text, and keep both placed.
  useLayoutEffect(() => {
    if (!resolved) return;
    let destination: number | null = null;
    let settleTimer = 0;
    let plannedTop = 0;

    const follow = () => {
      setRing(target ? toBox(target.getBoundingClientRect()) : null);
    };

    // Scrolls to the plan. The highlight follows the target while the page scrolls; the callout
    // already stands where the plan puts it for the end of the scroll.
    const plan = (allowScroll: boolean) => {
      const viewport = viewportSize();
      const el = dialog.current;
      const topInset = fixedTopInset();
      if (allowScroll && target) {
        // Room at the end of the page to scroll this target up to the top of the screen.
        const root = document.getElementById('root');
        const pageHeight = root ? root.getBoundingClientRect().bottom + window.scrollY : document.documentElement.scrollHeight;
        const wanted = docBox(target).top - HIGHLIGHT_PAD - topInset - EDGE_SPACE + viewport.height;
        spacer.style.height = `${Math.max(0, Math.ceil(wanted - pageHeight))}px`;
      }
      const sizes = el ? calloutSizes(el, viewport.width) : [{ width: 0, height: 0 }];
      const current = window.scrollY;
      const result = planTour({
        target: target ? docBox(target) : null,
        sizes,
        viewport,
        // While a scroll is on its way, the plan starts from where it is going.
        scrollY: destination ?? current,
        maxScrollY: Math.max(0, document.documentElement.scrollHeight - viewport.height),
        topInset,
        text: target ? collectText(target) : [],
        allowScroll,
      });
      setNarrow(viewport.width < NARROW_VIEWPORT);
      setPlace({
        top: result.top,
        left: result.left,
        side: result.side,
        width: result.size === sizes[0] ? null : result.size.width,
      });
      if (allowScroll) {
        if (Math.abs(result.scrollY - current) <= 1) {
          destination = null;
          window.clearTimeout(settleTimer);
        } else if (destination === null || Math.abs(result.scrollY - destination) > 1) {
          destination = result.scrollY;
          window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(() => {
            destination = null;
            plan(false);
          }, SETTLE_MS);
          window.scrollTo({ top: result.scrollY, left: window.scrollX, behavior: reduced ? 'instant' : 'smooth' });
        }
      }
      if (target) plannedTop = docBox(target).top;
      follow();
      // Lets anything watching the tour (the e2e checks) know when the page has stopped moving.
      if (el) el.dataset.tourScroll = destination === null ? 'idle' : 'moving';
    };

    plan(true);

    let cancel = () => {};
    const schedule = (allowScroll: boolean, always: boolean) => {
      cancel();
      cancel = nextFrame(() => {
        if (destination !== null && !always) {
          // Still on its way: only the highlight moves. Once there, plan the callout for good.
          if (Math.abs(window.scrollY - destination) > 1) return follow();
          destination = null;
          window.clearTimeout(settleTimer);
          return plan(false);
        }
        plan(allowScroll);
      });
    };
    // A scroll the tour did not start (wheel, keys) keeps the page where the reader put it and
    // moves the callout instead. A change of layout plans the stop again.
    const onScroll = () => schedule(false, false);
    const onLayout = () => schedule(true, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onLayout);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(onLayout) : null;
    if (target) observer?.observe(target);
    if (dialog.current) observer?.observe(dialog.current);
    // Content above or beside the target can move it without resizing it (a late font or image),
    // and a screen can still be filling in when its stop begins. For the first seconds, plan again
    // whenever the target is somewhere other than where the plan expects it.
    const page = document.getElementById('root');
    if (page) observer?.observe(page);
    void document.fonts?.ready.then(onLayout);
    const watchStart = Date.now();
    const watcher = window.setInterval(() => {
      if (Date.now() - watchStart > WATCH_MS) return window.clearInterval(watcher);
      if (!target || destination !== null) return;
      const top = docBox(target).top;
      if (Math.abs(top - plannedTop) > 1) onLayout();
    }, POLL_MS * 4);
    return () => {
      window.clearInterval(watcher);
      cancel();
      window.clearTimeout(settleTimer);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onLayout);
      observer?.disconnect();
    };
  }, [resolved, target, reduced, spacer]);

  // Focus moves to Next once the stop's screen is ready, after its own h1 focus (Req 22.7).
  useEffect(() => {
    if (resolved) next.current?.focus();
  }, [resolved]);

  // Tab and Shift+Tab wrap between the callout's buttons (Req 22.7).
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !dialog.current) return;
    const buttons = Array.from(dialog.current.querySelectorAll<HTMLButtonElement>('button'));
    const firstButton = buttons[0];
    const lastButton = buttons[buttons.length - 1];
    if (!firstButton || !lastButton) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === firstButton || !dialog.current.contains(active))) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && (active === lastButton || !dialog.current.contains(active))) {
      event.preventDefault();
      firstButton.focus();
    }
  };

  const style: CSSProperties | undefined =
    place && !narrow ? { top: place.top, left: place.left, width: place.width ?? undefined } : place ? { top: place.top } : undefined;

  return (
    <>
      {ring && (
        <div
          className={styles.ring}
          aria-hidden="true"
          data-tour-highlight=""
          style={{
            top: ring.top - RING_PAD,
            left: ring.left - RING_PAD,
            width: ring.width + 2 * RING_PAD,
            height: ring.height + 2 * RING_PAD,
          }}
        />
      )}
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={[styles.callout, narrow ? styles.narrow : '', place ? '' : styles.pending].filter(Boolean).join(' ')}
        style={style}
        onKeyDown={onKeyDown}
        data-tour-callout={stop.id}
        data-side={place?.side}
      >
        <p className={styles.progress}>
          Tour · {index + 1} of {total}
        </p>
        <h2 id={titleId} className={styles.title}>
          {stop.title}
        </h2>
        <p id={bodyId} className={styles.body}>
          {stop.body}
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className="button"
            aria-disabled={first ? 'true' : undefined}
            onClick={() => {
              if (!first) onBack();
            }}
          >
            Back
          </button>
          <button ref={next} type="button" className={`button ${styles.next}`} onClick={onNext}>
            {last ? 'Finish' : 'Next'}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Skip
          </button>
        </div>
      </div>
    </>
  );
}
