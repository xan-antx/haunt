import { useEffect, useLayoutEffect, useState, type KeyboardEvent, type RefObject } from 'react';

export type ScrollAxis = 'x' | 'y';

/** How far one arrow key press scrolls, in CSS pixels. */
export const SCROLL_STEP_PX = 40;

/** True when the element's content is larger than its box on the given axis (1 px tolerance for rounding). */
export function isOverflowing(element: HTMLElement, axis: ScrollAxis): boolean {
  return axis === 'y'
    ? element.scrollHeight > element.clientHeight + 1
    : element.scrollWidth > element.clientWidth + 1;
}

/**
 * Reports whether a scroll container currently overflows on `axis`.
 * Measures after every render and whenever a ResizeObserver reports a size change
 * (viewport or zoom changes resize the element). Without ResizeObserver it still
 * measures on every render.
 * Use it to make the container focusable (`tabIndex={0}`) only while it can scroll.
 */
export function useScrollOverflow(ref: RefObject<HTMLElement | null>, axis: ScrollAxis): boolean {
  const [overflowing, setOverflowing] = useState(false);

  // No dependency list: content can change on any render. React skips the
  // re-render when the value is unchanged.
  useLayoutEffect(() => {
    const element = ref.current;
    setOverflowing(element ? isOverflowing(element, axis) : false);
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setOverflowing(isOverflowing(element, axis));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, axis]);

  return overflowing;
}

function scrollElement(element: HTMLElement, axis: ScrollAxis, delta: number): void {
  if (typeof element.scrollBy === 'function') {
    element.scrollBy(axis === 'y' ? { top: delta } : { left: delta });
  } else if (axis === 'y') {
    element.scrollTop += delta;
  } else {
    element.scrollLeft += delta;
  }
}

/**
 * Keyboard handler for a focusable scroll container. Scrolls only the container
 * and calls preventDefault() so the page does not scroll as well.
 * - 'y': ArrowUp and ArrowDown scroll by 40 px.
 * - 'x': ArrowLeft and ArrowRight scroll by 40 px; Home and End jump to the start and end.
 */
export function scrollKeys(axis: ScrollAxis): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const element = event.currentTarget;
    if (axis === 'y') {
      if (event.key === 'ArrowUp') scrollElement(element, 'y', -SCROLL_STEP_PX);
      else if (event.key === 'ArrowDown') scrollElement(element, 'y', SCROLL_STEP_PX);
      else return;
    } else {
      if (event.key === 'ArrowLeft') scrollElement(element, 'x', -SCROLL_STEP_PX);
      else if (event.key === 'ArrowRight') scrollElement(element, 'x', SCROLL_STEP_PX);
      else if (event.key === 'Home') element.scrollLeft = 0;
      else if (event.key === 'End') element.scrollLeft = element.scrollWidth - element.clientWidth;
      else return;
    }
    event.preventDefault();
  };
}
