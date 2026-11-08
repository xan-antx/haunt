// Test helpers: an in-memory RunSource and a renderer for the full app at a given URL.

import { render } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { appRoutes } from '../App';
import { RunSourceProvider } from '../data/hooks';
import type { RunSource } from '../data/source';
import type { InvalidRun, LoadedRun, RunIndex, RunIndexEntry, RunMeta } from '../data/types';
import { validateRun } from '../data/validate';
import { resolveScreenshotUrl } from '../data/screenshots';
import { BEBE_META, LISTENER_META, bebeSample, listenerSample } from './fixtures/samples';

export interface MemoryRunFile {
  json: unknown;
  meta: RunMeta;
}

export function sampleFiles(): MemoryRunFile[] {
  return [
    { json: listenerSample(), meta: LISTENER_META },
    { json: bebeSample(), meta: BEBE_META },
  ];
}

export function memorySource(files: MemoryRunFile[], invalid: InvalidRun[] = []): RunSource {
  const entries: RunIndexEntry[] = [
    ...files.map((f) => ({ key: f.meta.key, folder: f.meta.folder, origin: f.meta.origin, errors: [] })),
    ...invalid.map((i) => ({ key: i.key, folder: i.folder, origin: 'runs' as const, errors: i.errors })),
  ];
  const index: RunIndex = { formatVersion: 1, generatedAt: '2026-11-08T00:00:00Z', entries };
  return {
    listRuns: async () => index,
    loadRun: async (entry): Promise<LoadedRun> => {
      if (entry.errors.length > 0) return { ok: false, key: entry.key, folder: entry.folder, errors: entry.errors };
      const file = files.find((f) => f.meta.key === entry.key)!;
      return validateRun(file.json, file.meta);
    },
    screenshotUrl: (run, path) => resolveScreenshotUrl('/', run.folder, path),
  };
}

export function failingSource(): RunSource {
  return {
    listRuns: async () => {
      throw new Error('Could not read runs/index.json (HTTP 404)');
    },
    loadRun: async () => ({ ok: false, key: '', folder: '', errors: [] }),
    screenshotUrl: () => null,
  };
}

export function renderApp(path: string, source: RunSource = memorySource(sampleFiles())) {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const result = render(
    <RunSourceProvider source={source}>
      <RouterProvider router={router} />
    </RunSourceProvider>,
  );
  return { ...result, router };
}
