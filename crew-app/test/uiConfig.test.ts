import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const configPath = path.resolve(import.meta.dirname, '..', 'ui', 'vite.config.ts');

describe('ui/vite.config.ts', () => {
  it('keeps the static fallback: emptyOutDir is exactly false and only dist/index.mjs is written', async () => {
    const config = (await import(pathToFileURL(configPath).href)).default as {
      build: { emptyOutDir: unknown; outDir: string; lib: { fileName: () => string; formats: string[] } };
    };
    expect(config.build.emptyOutDir).toBe(false);
    expect(config.build.outDir).toBe('dist');
    expect(config.build.lib.fileName()).toBe('index.mjs');
    expect(config.build.lib.formats).toEqual(['es']);
  });
});
