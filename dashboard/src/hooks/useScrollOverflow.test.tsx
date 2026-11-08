import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { scrollKeys, useScrollOverflow, type ScrollAxis } from './useScrollOverflow';

/** Gives an element fixed layout sizes, which jsdom does not compute. */
function stubSizes(
  element: HTMLElement,
  sizes: { scrollHeight?: number; clientHeight?: number; scrollWidth?: number; clientWidth?: number },
) {
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
}

/** Stubs sizes on every HTMLElement before render, so the first layout effect sees them. */
function stubPrototypeSizes(sizes: Record<string, number>) {
  const spies = Object.entries(sizes).map(([key, value]) =>
    vi.spyOn(HTMLElement.prototype, key as 'scrollHeight', 'get').mockReturnValue(value),
  );
  return () => spies.forEach((spy) => spy.mockRestore());
}

function Scroller({ axis }: { axis: ScrollAxis }) {
  const ref = useRef<HTMLDivElement>(null);
  const overflowing = useScrollOverflow(ref, axis);
  return (
    <div
      ref={ref}
      role="region"
      aria-label="Scroller"
      tabIndex={overflowing ? 0 : undefined}
      onKeyDown={scrollKeys(axis)}
    >
      content
    </div>
  );
}

function triggerResizeObservers() {
  act(() => {
    (globalThis.ResizeObserver as unknown as { trigger(): void }).trigger();
  });
}

describe('useScrollOverflow', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('is focusable only when the vertical content overflows by more than 1 px', () => {
    restore = stubPrototypeSizes({ scrollHeight: 300, clientHeight: 100 });
    render(<Scroller axis="y" />);
    expect(screen.getByRole('region')).toHaveAttribute('tabindex', '0');
  });

  it('treats a 1 px difference as not overflowing', () => {
    restore = stubPrototypeSizes({ scrollHeight: 101, clientHeight: 100 });
    render(<Scroller axis="y" />);
    expect(screen.getByRole('region')).not.toHaveAttribute('tabindex');
  });

  it('re-measures the width when the ResizeObserver fires', () => {
    render(<Scroller axis="x" />);
    const region = screen.getByRole('region');
    expect(region).not.toHaveAttribute('tabindex');

    stubSizes(region, { scrollWidth: 900, clientWidth: 400 });
    triggerResizeObservers();
    expect(region).toHaveAttribute('tabindex', '0');

    stubSizes(region, { scrollWidth: 400, clientWidth: 400 });
    triggerResizeObservers();
    expect(region).not.toHaveAttribute('tabindex');
  });

  it('works without ResizeObserver', () => {
    const original = globalThis.ResizeObserver;
    // @ts-expect-error simulate a browser without ResizeObserver
    delete globalThis.ResizeObserver;
    try {
      restore = stubPrototypeSizes({ scrollHeight: 300, clientHeight: 100 });
      render(<Scroller axis="y" />);
      expect(screen.getByRole('region')).toHaveAttribute('tabindex', '0');
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
});

describe('scrollKeys', () => {
  function setup(axis: ScrollAxis) {
    render(<Scroller axis={axis} />);
    const region = screen.getByRole('region');
    stubSizes(region, { scrollHeight: 500, clientHeight: 100, scrollWidth: 900, clientWidth: 400 });
    let top = 100;
    let left = 100;
    Object.defineProperty(region, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => (top = v) });
    Object.defineProperty(region, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => (left = v) });
    return { region, top: () => top, left: () => left };
  }

  it("'y' scrolls 40 px on ArrowUp and ArrowDown and prevents page scroll", () => {
    const { region, top } = setup('y');
    expect(fireEvent.keyDown(region, { key: 'ArrowDown' })).toBe(false);
    expect(top()).toBe(140);
    expect(fireEvent.keyDown(region, { key: 'ArrowUp' })).toBe(false);
    expect(top()).toBe(100);
    // Other keys are left alone.
    expect(fireEvent.keyDown(region, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(region, { key: 'Home' })).toBe(true);
    expect(top()).toBe(100);
  });

  it("'x' scrolls 40 px on ArrowLeft and ArrowRight and jumps on Home and End", () => {
    const { region, left } = setup('x');
    expect(fireEvent.keyDown(region, { key: 'ArrowRight' })).toBe(false);
    expect(left()).toBe(140);
    expect(fireEvent.keyDown(region, { key: 'ArrowLeft' })).toBe(false);
    expect(left()).toBe(100);
    expect(fireEvent.keyDown(region, { key: 'End' })).toBe(false);
    expect(left()).toBe(500);
    expect(fireEvent.keyDown(region, { key: 'Home' })).toBe(false);
    expect(left()).toBe(0);
    expect(fireEvent.keyDown(region, { key: 'ArrowDown' })).toBe(true);
  });
});
