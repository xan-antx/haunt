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

describe('LateBanner (Problem 4 fixed: late image, space reserved)', () => {
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

  it('sets the 1200x300 width and height attributes, before and after loading', async () => {
    const { container } = render(<LateBanner />);
    expect(getImg(container)).toHaveAttribute('width', '1200');
    expect(getImg(container)).toHaveAttribute('height', '300');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getImg(container)).toHaveAttribute('width', '1200');
    expect(getImg(container)).toHaveAttribute('height', '300');
  });

  it('reserves its space before load with a 4:1 aspect ratio and a 120px minimum height', () => {
    expect(bannerRule).not.toBe('');
    expect(bannerRule).toMatch(/aspect-ratio:\s*4\s*\/\s*1/);
    expect(bannerRule).toMatch(/min-height:\s*120px/);
    expect(bannerRule).toMatch(/width:\s*100%/);
  });

  it('has the same box before and after load: one element, same class, no size change on load', async () => {
    const { container } = render(<LateBanner />);
    const img = getImg(container);
    const classBefore = img.className;
    expect(container.children).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(getImg(container)).toBe(img);
    expect(img.className).toBe(classBefore);
    expect(css).not.toMatch(/\.loaded/);
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
