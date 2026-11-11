// React hooks over the selected Run_Source. Screens load data only through these.

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from 'react';
import { splitRuns } from '../model/origin';
import { selectRunSource, type RunSource } from './source';
import type { InvalidRun, Run, RunIndex } from './types';

const RunSourceContext = createContext<RunSource | null>(null);

/** Lets tests or a future live mode supply a different source. Defaults to selectRunSource(). */
export function RunSourceProvider({ source, children }: { source: RunSource; children: ReactNode }) {
  return createElement(RunSourceContext.Provider, { value: source }, children);
}

export function useRunSource(): RunSource {
  return useContext(RunSourceContext) ?? selectRunSource();
}

export type IndexState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; index: RunIndex };

export function useRunIndex(): IndexState {
  const source = useRunSource();
  const [state, setState] = useState<IndexState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    source.listRuns().then(
      (index) => live && setState({ status: 'ready', index }),
      (err: unknown) => live && setState({ status: 'error', message: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      live = false;
    };
  }, [source]);
  return state;
}

export type AllRunsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      /** The runs every screen lists: all real runs, and samples only for ghosts with no real run (Req 24.1). */
      runs: Run[];
      /** Samples replaced by a real run of the same ghost. Only a link that names one opens it (Req 24.3). */
      hidden: Run[];
      invalid: InvalidRun[];
    };

/** Loads every run in the index. Valid runs and Invalid_Runs keep index order. */
export function useAllRuns(): AllRunsState {
  const source = useRunSource();
  const [state, setState] = useState<AllRunsState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    source
      .listRuns()
      .then(async (index) => {
        const loaded = await Promise.all(index.entries.map((entry) => source.loadRun(entry)));
        const valid: Run[] = [];
        const invalid: InvalidRun[] = [];
        for (const item of loaded) {
          if (item.ok) valid.push(item.run);
          else invalid.push(item);
        }
        const { shown, hidden } = splitRuns(valid);
        if (live) setState({ status: 'ready', runs: shown, hidden, invalid });
      })
      .catch((err: unknown) => {
        if (live) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      live = false;
    };
  }, [source]);
  return state;
}

export type RunState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'not_found' }
  | { status: 'invalid'; invalid: InvalidRun }
  | { status: 'ready'; run: Run };

/** Loads one run by Run_Key. */
export function useRun(key: string | undefined): RunState {
  const source = useRunSource();
  const [state, setState] = useState<RunState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    source
      .listRuns()
      .then(async (index) => {
        const entry = index.entries.find((e) => e.key === key);
        if (!entry) {
          if (live) setState({ status: 'not_found' });
          return;
        }
        const loaded = await source.loadRun(entry);
        if (!live) return;
        setState(loaded.ok ? { status: 'ready', run: loaded.run } : { status: 'invalid', invalid: loaded });
      })
      .catch((err: unknown) => {
        if (live) setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      live = false;
    };
  }, [source, key]);
  return state;
}
