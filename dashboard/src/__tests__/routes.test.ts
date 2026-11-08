import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  exorcisePath,
  graveyardPath,
  href,
  mapPath,
  parseRoute,
  seancePath,
  siteKey,
  stepPath,
} from '../routes';

describe('routes', () => {
  it('builds the README deep link', () => {
    expect(href(stepPath('2026-11-03-listener-pay-bill', 9))).toBe('#/run/2026-11-03-listener-pay-bill/step/9');
  });

  it('slugs site names', () => {
    expect(siteKey('Lantern Bills demo')).toBe('lantern-bills-demo');
    expect(siteKey('  Ünïcode & Co.  ')).toBe('n-code-co');
    expect(siteKey('!!!')).toBe('site');
  });

  it('parses every screen', () => {
    expect(parseRoute('#/')).toEqual({ screen: 'home' });
    expect(parseRoute(mapPath('lantern-bills-demo', 'bebe'))).toEqual({
      screen: 'map',
      siteKey: 'lantern-bills-demo',
      ghost: 'bebe',
    });
    expect(parseRoute(graveyardPath({ site: 'lantern-bills-demo', ghost: 'listener' }))).toEqual({
      screen: 'graveyard',
      site: 'lantern-bills-demo',
      ghost: 'listener',
    });
    expect(parseRoute('/run/abc')).toEqual({ screen: 'run', key: 'abc' });
    expect(parseRoute(seancePath('abc', 'what-heard'))).toEqual({ screen: 'seance', key: 'abc', questionId: 'what-heard' });
    expect(parseRoute(seancePath())).toEqual({ screen: 'seance' });
    expect(parseRoute(exorcisePath('a', 'b'))).toEqual({ screen: 'exorcise', beforeKey: 'a', afterKey: 'b' });
    expect(parseRoute('/coverage')).toEqual({ screen: 'coverage' });
    expect(parseRoute('/restless/x')).toEqual({ screen: 'restless', key: 'x' });
    expect(parseRoute('/nowhere')).toEqual({ screen: 'not_found' });
    expect(parseRoute('/run/abc/step/zero')).toEqual({ screen: 'step', key: 'abc', n: Number.NaN });
  });
});

describe('Feature: haunt-dashboard, Property 6: route round trip for step URLs', () => {
  it('parseRoute(stepPath(key, n)) returns the same key and n', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.integer({ min: 1, max: 1_000_000 }), (key, n) => {
        expect(parseRoute(stepPath(key, n))).toEqual({ screen: 'step', key, n });
        expect(parseRoute(href(stepPath(key, n)))).toEqual({ screen: 'step', key, n });
      }),
      { numRuns: 500 },
    );
  });
});
