import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Some test files (the Collect_Step tests) run in the node environment, without a DOM.
const hasDom = typeof window !== 'undefined';

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
