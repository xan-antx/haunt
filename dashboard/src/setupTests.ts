import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Some test files (the Collect_Step tests) run in the node environment, without a DOM.
const hasDom = typeof window !== 'undefined';

/**
 * jsdom has no ResizeObserver. This stub records observers so a test can fire
 * them with `(ResizeObserver as unknown as { trigger(): void }).trigger()`.
 */
class ResizeObserverStub {
  static instances = new Set<ResizeObserverStub>();
  private targets = new Set<Element>();
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element): void {
    this.targets.add(target);
    ResizeObserverStub.instances.add(this);
  }
  unobserve(target: Element): void {
    this.targets.delete(target);
  }
  disconnect(): void {
    this.targets.clear();
    ResizeObserverStub.instances.delete(this);
  }
  /** Calls every active observer's callback with an entry per observed element. */
  static trigger(): void {
    for (const observer of [...ResizeObserverStub.instances]) {
      const entries = [...observer.targets].map(
        (target) =>
          ({ target, contentRect: target.getBoundingClientRect() }) as unknown as ResizeObserverEntry,
      );
      if (entries.length > 0) observer.callback(entries, observer as unknown as ResizeObserver);
    }
  }
}

if (hasDom && typeof globalThis.ResizeObserver === 'undefined') {
  const stub = ResizeObserverStub as unknown as typeof ResizeObserver;
  globalThis.ResizeObserver = stub;
  window.ResizeObserver = stub;
}

beforeEach(() => {
  if (!hasDom) return;
  window.location.hash = '';
  // Mirror index.html, which jsdom does not load.
  document.documentElement.lang = 'en';
  document.title = 'Haunt';
});

afterEach(() => {
  if (!hasDom) return;
  cleanup();
  document.title = '';
});
