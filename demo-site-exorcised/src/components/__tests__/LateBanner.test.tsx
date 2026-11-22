import { act, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LateBanner } from '../LateBanner';

// Vitest stubs CSS imports, so read the real source file (tests run from demo-site/).
const css = readFileSync(
  resolve(process.cwd(), 'src/components/LateBanner.module.css'),
  'utf8'
).replace(/\/\*[\s\S]*?\*\//g, '');

/** CSS text of the plain `.banner` rule (the state before the image loads). */
const bannerRule = /\.banner\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function getImg(container: HTMLElement) {
  return container.querySelector('img') as HTMLImageElement;
}

describe('LateBanner (Problem 4: late image, no reserved space)', () => {
  it('has no src at first', () => {
    const { container } = render(<LateBanner />);
    expect(getImg(container)).not.toHaveAttribute('src');
  });

  it('sets the src after exactly 1500ms', async () => {
    const onLoaded = vi.fn();
    const { container } = render(<LateBanner onLoaded={onLoaded} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(getImg(container)).not.toHaveAttribute('src');
    expect(onLoaded).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getImg(container)).toHaveAttribute('src');
    expect(getImg(container).getAttribute('src')).toBeTruthy();
    expect(onLoaded).toHaveBeenCalledTimes(1);
  });

  it('sets no width or height attributes, before or after loading', async () => {
    const { container } = render(<LateBanner />);
    expect(getImg(container)).not.toHaveAttribute('width');
    expect(getImg(container)).not.toHaveAttribute('height');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getImg(container)).not.toHaveAttribute('width');
    expect(getImg(container)).not.toHaveAttribute('height');
  });

  it('reserves no space before load: no min-height, aspect-ratio, fixed height or placeholder', () => {
    expect(bannerRule).not.toBe('');
    expect(bannerRule).not.toMatch(/min-height/);
    expect(bannerRule).not.toMatch(/aspect-ratio/);
    expect(bannerRule).not.toMatch(/(^|[;\s])height:\s*\d/);
    expect(bannerRule).not.toMatch(/background/);
    const { container } = render(<LateBanner />);
    const img = getImg(container);
    expect(img.style.minHeight).toBe('');
    expect(img.style.aspectRatio).toBe('');
    expect(img.style.height).toBe('');
    // No sibling placeholder element either.
    expect(container.children).toHaveLength(1);
  });

  it('uses no network URL for the image', async () => {
    const { container } = render(<LateBanner />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getImg(container).getAttribute('src')).not.toMatch(/^https?:\/\//);
  });

  it('cancels the timer when unmounted', async () => {
    const onLoaded = vi.fn();
    const { unmount } = render(<LateBanner onLoaded={onLoaded} />);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(onLoaded).not.toHaveBeenCalled();
  });
});
