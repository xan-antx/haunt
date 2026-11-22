import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dashboardBaseUrl, dashboardRunUrl } from '../src/dashboardLink.ts';
import { RUNS } from './helpers.ts';

describe('Feature: haunt-patrol, Property 14: Dashboard link construction', () => {
  it('joins the base without trailing slashes, /#/run/ and the encoded run id', () => {
    fc.assert(
      fc.property(fc.webUrl(), fc.nat({ max: 3 }), fc.string({ minLength: 1 }), (base, slashes, runId) => {
        const withSlashes = base.replace(/\/+$/, '') + '/'.repeat(slashes);
        expect(dashboardRunUrl(withSlashes, runId)).toBe(`${base.replace(/\/+$/, '')}/#/run/${encodeURIComponent(runId)}`);
      }),
      RUNS,
    );
  });

  it('defaults to http://localhost:3001 when the variable is unset or empty', () => {
    expect(dashboardBaseUrl({})).toBe('http://localhost:3001');
    expect(dashboardBaseUrl({ HAUNT_DASHBOARD_URL: '' })).toBe('http://localhost:3001');
  });

  it('uses the variable when it is set', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (value) => {
        expect(dashboardBaseUrl({ HAUNT_DASHBOARD_URL: value })).toBe(value);
      }),
      RUNS,
    );
  });
});
