// All URLs are built and parsed here, so links in screens, the README and tests agree.
// Builders return router paths such as "/run/abc/step/9". Use `href()` for a full "#/..." link.

import type { GhostId } from './data/types';

export const QUESTION_IDS = ['why-give-up', 'where-stuck', 'what-heard', 'what-helped'] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export function isQuestionId(value: string | undefined): value is QuestionId {
  return value !== undefined && (QUESTION_IDS as readonly string[]).includes(value);
}

/** Route patterns for react-router. */
export const PATTERNS = {
  home: '/',
  map: '/haunt/:siteKey/map',
  graveyard: '/graveyard',
  run: '/run/:runKey',
  step: '/run/:runKey/step/:n',
  seance: '/seance',
  seanceAnswer: '/seance/:runKey/:questionId',
  exorcise: '/exorcise',
  exorcisePair: '/exorcise/:beforeKey/:afterKey',
  coverage: '/coverage',
  restless: '/restless/:runKey',
} as const;

const enc = encodeURIComponent;

/** Slug of a site name: lowercase, runs of non-alphanumerics become "-". */
export function siteKey(siteName: string): string {
  const slug = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'site' : slug;
}

function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** The Graveyard's two views: the Tombstone_List (default) and the Map_View. */
export type GraveyardView = 'list' | 'map';

/** The Ask_Panel's URL state: open with no question, or open showing one answer. */
export type AskParam = QuestionId | 'open';

export const homePath = (): string => '/';
/** Old_Link only: the former Haunted Map screen. New links use graveyardPath({ view: 'map' }). */
export const mapPath = (site: string, ghost?: GhostId): string => withQuery(`/haunt/${enc(site)}/map`, { ghost });
export const graveyardPath = (filter: { site?: string; ghost?: string; view?: GraveyardView } = {}): string =>
  withQuery('/graveyard', {
    site: filter.site,
    ghost: filter.ghost,
    view: filter.view === 'map' ? 'map' : undefined,
  });
export const runPath = (runKey: string): string => `/run/${enc(runKey)}`;
export const stepPath = (runKey: string, n: number): string => `/run/${enc(runKey)}/step/${n}`;
/** A Ghost Cam step, with the Ask_Panel open when `ask` is not null. */
export const askPath = (runKey: string, n: number, ask: AskParam | null): string =>
  withQuery(stepPath(runKey, n), { ask: ask ?? undefined });
/** Old_Link only: the former Séance screen. */
export const seancePath = (runKey?: string, questionId?: QuestionId): string =>
  runKey && questionId ? `/seance/${enc(runKey)}/${questionId}` : '/seance';

/** Reads the `ask` query value. Any value opens the panel; only a question id chooses a question. */
export function parseAsk(value: string | null): { open: boolean; question: QuestionId | null } {
  if (value === null) return { open: false, question: null };
  return { open: true, question: isQuestionId(value) ? value : null };
}
export const exorcisePath = (beforeKey?: string, afterKey?: string): string =>
  beforeKey && afterKey ? `/exorcise/${enc(beforeKey)}/${enc(afterKey)}` : '/exorcise';
export const coveragePath = (): string => '/coverage';
export const restlessPath = (runKey: string): string => `/restless/${enc(runKey)}`;

/** A full hash link, for example "#/run/abc/step/9". */
export const href = (path: string): string => `#${path}`;

export type Route =
  | { screen: 'home' }
  | { screen: 'map'; siteKey: string; ghost?: string }
  | { screen: 'graveyard'; site?: string; ghost?: string; view?: 'map' }
  | { screen: 'run'; key: string }
  | { screen: 'step'; key: string; n: number }
  | { screen: 'seance'; key?: string; questionId?: string }
  | { screen: 'exorcise'; beforeKey?: string; afterKey?: string }
  | { screen: 'coverage' }
  | { screen: 'restless'; key: string }
  | { screen: 'not_found' };

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Parses a router path (with or without a leading "#"), including its query. */
export function parseRoute(input: string): Route {
  const raw = input.startsWith('#') ? input.slice(1) : input;
  const [pathPart = '', queryPart = ''] = raw.split('?', 2);
  const query = new URLSearchParams(queryPart);
  const parts = pathPart.split('/').filter((p) => p !== '');
  const segs = parts.map(decode);
  if (segs.some((s) => s === null)) return { screen: 'not_found' };
  const s = segs as string[];
  const opt = (name: string) => query.get(name) || undefined;

  if (s.length === 0) return { screen: 'home' };
  switch (s[0]) {
    case 'haunt':
      if (s.length === 3 && s[2] === 'map') return { screen: 'map', siteKey: s[1]!, ghost: opt('ghost') };
      break;
    case 'graveyard':
      if (s.length === 1) {
        return {
          screen: 'graveyard',
          site: opt('site'),
          ghost: opt('ghost'),
          view: query.get('view') === 'map' ? 'map' : undefined,
        };
      }
      break;
    case 'run':
      if (s.length === 2) return { screen: 'run', key: s[1]! };
      if (s.length === 4 && s[2] === 'step') {
        const n = /^\d+$/.test(s[3]!) ? Number(s[3]) : Number.NaN;
        return { screen: 'step', key: s[1]!, n };
      }
      break;
    case 'seance':
      if (s.length === 1) return { screen: 'seance' };
      if (s.length === 3) return { screen: 'seance', key: s[1]!, questionId: s[2]! };
      break;
    case 'exorcise':
      if (s.length === 1) return { screen: 'exorcise' };
      if (s.length === 3) return { screen: 'exorcise', beforeKey: s[1]!, afterKey: s[2]! };
      break;
    case 'coverage':
      if (s.length === 1) return { screen: 'coverage' };
      break;
    case 'restless':
      if (s.length === 2) return { screen: 'restless', key: s[1]! };
      break;
  }
  return { screen: 'not_found' };
}

/** Parses the step number from a route param. NaN when it is not a whole number. */
export function parseStepParam(value: string | undefined): number {
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : Number.NaN;
}
