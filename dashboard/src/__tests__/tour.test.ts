import { describe, expect, it } from 'vitest';
import { MAX_REPLANS, buildTour, placeCallout, sentenceCount, settleDecision, targetInView } from '../model/tour';
import { bebeRun, sampleRuns } from './fixtures/samples';

const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

describe('buildTour with the samples (Req 22.1, 22.2, 22.11)', () => {
  const stops = buildTour(sampleRuns())!;

  it('has the eight stops in order, on the right screens', () => {
    expect(stops.map((s) => s.id)).toEqual(['results', 'shot', 'panel', 'notice', 'timeline', 'graveyard', 'exorcise', 'coverage']);
    expect(stops.map((s) => s.path)).toEqual([
      '/',
      `/run/${L}/step/9`,
      `/run/${L}/step/9`,
      `/run/${L}/step/9`,
      `/run/${L}/step/9`,
      '/graveyard',
      '/exorcise',
      '/coverage',
    ]);
    expect(stops.map((s) => s.targets[0])).toEqual([
      '[data-tour="results"]',
      '[data-cam-area="shot"]',
      '[data-cam-area="panel"]',
      '[data-cam-area="notice"]',
      '[data-cam-area="timeline"]',
      '[data-tour="graveyard-views"]',
      '[data-tour="exorcise-pickers"]',
      '[data-tour="coverage-table"]',
    ]);
  });

  it('keeps every body to one or two plain sentences', () => {
    for (const stop of stops) {
      expect(stop.title.trim(), stop.id).not.toBe('');
      const count = sentenceCount(stop.body);
      expect(count, `${stop.id}: ${stop.body}`).toBeGreaterThanOrEqual(1);
      expect(count, `${stop.id}: ${stop.body}`).toBeLessThanOrEqual(2);
    }
  });

  it('names the site, says "heard" for The Listener and mentions Ask this ghost at the notice', () => {
    expect(stops[0]!.body).toContain('on Lantern Bills.');
    expect(stops[2]!.title).toBe('What The Listener heard');
    expect(stops[2]!.body).toContain("The Listener's screen reader said");
    expect(stops[3]!.body).toContain('Ask this ghost');
    expect(stops[5]!.body).toContain('Choose Map');
  });

  // Revised by Req 24.4: with no Listener run, the stop opens Bebe's run at its Watch_Step.
  it('says "was thinking" for Bebe, whose Watch_Step is the Ghost Cam stop', () => {
    const bebe = buildTour([bebeRun()])!;
    expect(bebe[1]!.path).toBe(`/run/${B}/step/3`);
    expect(bebe[2]!.title).toBe('What Bebe was thinking');
    expect(bebe[2]!.body).toContain('what Bebe was thinking');
  });

  it('is unavailable with no runs', () => {
    expect(buildTour([])).toBeNull();
  });

  it('gives every stop a guiding ghost and one short line, and keeps the plain explanation', () => {
    for (const stop of [...stops, ...buildTour([bebeRun()])!]) {
      expect(['listener', 'phantom', 'bebe'], stop.id).toContain(stop.guide);
      expect(stop.voice.length, `${stop.id}: ${stop.voice}`).toBeGreaterThan(10);
      expect(stop.voice.length, `${stop.id}: ${stop.voice}`).toBeLessThanOrEqual(80);
      expect(sentenceCount(stop.voice), stop.id).toBeLessThanOrEqual(2);
      expect(stop.body.length, stop.id).toBeGreaterThan(stop.voice.length);
    }
  });

  it('lets the ghost whose run the tour opens guide the stops about that run', () => {
    expect(stops.filter((s) => ['panel', 'notice', 'timeline', 'results'].includes(s.id)).map((s) => s.guide)).toEqual([
      'listener',
      'listener',
      'listener',
      'listener',
    ]);
    expect(buildTour([bebeRun()])!.find((s) => s.id === 'panel')!.guide).toBe('bebe');
  });
});

describe('sentenceCount', () => {
  it('counts sentences ending in . ! or ?', () => {
    expect(sentenceCount('One.')).toBe(1);
    expect(sentenceCount("It's the page. The outline marks focus.")).toBe(2);
    expect(sentenceCount('Is it? Yes! Done.')).toBe(3);
    expect(sentenceCount('No full stop')).toBe(0);
  });
});

describe('settleDecision: the page has stopped, is the target in view? (Req 22.5)', () => {
  // The e2e failure at 1536 × 730, stop 6 on Graveyard: the page stopped at scrollY 797 with the
  // highlight's top at −553, so the Graveyard views fieldset (about 104 px tall) was above the screen.
  const viewport = { width: 1536, height: 730 };
  const offScreen = { top: -553 + 9, left: 138, width: 334, height: 104 };
  const inView = { top: 120, left: 138, width: 334, height: 104 };
  const base = { viewport, topInset: 0, replans: 0, canReplan: true };

  it('plans and scrolls again when the page stopped with the target above the screen', () => {
    expect(targetInView(offScreen, viewport, 0)).toBe(false);
    expect(settleDecision({ ...base, target: offScreen })).toBe('replan');
  });

  it('plans again when the target is below the screen or under a fixed header', () => {
    expect(settleDecision({ ...base, target: { ...inView, top: 700 } })).toBe('replan');
    expect(settleDecision({ ...base, target: { ...inView, top: 40 }, topInset: 82 })).toBe('replan');
  });

  it('is idle when the target is in view', () => {
    expect(targetInView(inView, viewport, 0)).toBe(true);
    expect(settleDecision({ ...base, target: inView })).toBe('idle');
  });

  it('is idle for a tall target whose top is in the upper half', () => {
    const tall = { top: 100, left: 0, width: 800, height: 1500 };
    expect(settleDecision({ ...base, target: tall })).toBe('idle');
    expect(settleDecision({ ...base, target: { ...tall, top: 500 } })).toBe('replan');
  });

  // Like the e2e failure at 1366 × 650, stop 5: the timeline was on screen (top about 483) but not
  // where the plan had put the callout for it, so the callout covered it. In view is not enough.
  it('plans again when the page stopped somewhere the plan did not expect, even with the target in view', () => {
    const timeline = { top: 483, left: 53, width: 1260, height: 148 };
    const small = { width: 1366, height: 650 };
    expect(targetInView(timeline, small, 0)).toBe(true);
    expect(settleDecision({ ...base, viewport: small, target: timeline, expectedTop: 297 })).toBe('replan');
    expect(settleDecision({ ...base, viewport: small, target: timeline, expectedTop: 483.5 })).toBe('idle');
  });

  it(`stops planning again after ${MAX_REPLANS} tries, without a target, or once the scroll is the reader's`, () => {
    expect(settleDecision({ ...base, target: offScreen, replans: MAX_REPLANS - 1 })).toBe('replan');
    expect(settleDecision({ ...base, target: offScreen, replans: MAX_REPLANS })).toBe('idle');
    expect(settleDecision({ ...base, target: null })).toBe('idle');
    expect(settleDecision({ ...base, target: offScreen, canReplan: false })).toBe('idle');
  });

  // The e2e failure at 1366 × 650, stop 4: the tour scrolled from 328 towards 423, the smooth scroll
  // stalled at 402, and when the 1.5 s settle timer ran out the stop took the page as the reader's
  // and put the callout on the edge, over the notice.
  it('plans again when its own scroll stalled short of the plan, even late in the stop', () => {
    const notice = { top: 557, left: 53, width: 1260, height: 81 };
    const small = { width: 1366, height: 650 };
    const stalled = { ...base, viewport: small, target: notice, expectedTop: 557, scrollY: 402, plannedScrollY: 423 };
    expect(settleDecision({ ...stalled, canReplan: false })).toBe('replan');
    expect(settleDecision({ ...stalled, canReplan: false, replans: MAX_REPLANS })).toBe('idle');
    // Once the page had got there, a scroll away is the reader's: late in the stop it stays put.
    expect(settleDecision({ ...stalled, canReplan: false, reachedPlan: true })).toBe('idle');
    expect(settleDecision({ ...stalled, scrollY: 423, expectedTop: 536, target: { ...notice, top: 536 } })).toBe('idle');
  });

  it('then moves only the callout if the page is not where the plan expected', () => {
    expect(settleDecision({ ...base, target: inView, expectedTop: 400, replans: MAX_REPLANS })).toBe('place');
    expect(settleDecision({ ...base, target: inView, expectedTop: 400, canReplan: false })).toBe('place');
    expect(settleDecision({ ...base, target: offScreen, expectedTop: offScreen.top, canReplan: false })).toBe('idle');
  });
});

describe('placeCallout examples (Req 22.5, 22.10)', () => {
  const vp = { width: 1536, height: 864 };
  const size = { width: 468, height: 200 };

  it('goes below a target near the top', () => {
    expect(placeCallout({ top: 100, left: 200, width: 600, height: 100 }, size, vp)).toEqual({ top: 212, left: 200, side: 'below' });
  });

  it('goes above a target near the bottom', () => {
    expect(placeCallout({ top: 700, left: 200, width: 600, height: 100 }, size, vp)).toEqual({ top: 488, left: 200, side: 'above' });
  });

  it('goes beside a tall target', () => {
    expect(placeCallout({ top: 100, left: 40, width: 700, height: 700 }, size, vp)).toEqual({ top: 100, left: 752, side: 'right' });
  });

  it('centres without a target', () => {
    expect(placeCallout(null, size, vp)).toEqual({ top: 332, left: 534, side: 'center' });
  });

  it('uses the far edge on narrow screens', () => {
    expect(placeCallout({ top: 50, left: 0, width: 300, height: 100 }, { width: 296, height: 200 }, { width: 320, height: 640 })).toEqual({
      top: 428,
      left: 12,
      side: 'edge',
    });
    expect(placeCallout({ top: 500, left: 0, width: 300, height: 100 }, { width: 296, height: 200 }, { width: 320, height: 640 })).toEqual({
      top: 12,
      left: 12,
      side: 'edge',
    });
  });
});
