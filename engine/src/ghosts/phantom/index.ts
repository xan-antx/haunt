import type { BodyOptions, Ghost, MindOptions } from '../../core/types.ts';
import { createMisclickDetector } from '../../detectors/misclick.ts';
import { createSlowWaitDetector } from '../../detectors/slowWait.ts';
import type { Mission } from '../../missions/loadMission.ts';
import { createVisualBody } from '../visual/body.ts';
import { createVisualMind } from '../visual/mind.ts';
import type { Sight, VisualAction } from '../visual/types.ts';
import { phantomProfile, phantomTiming } from './profile.ts';
import { phantomStopRule } from './stopRule.ts';

export { PHANTOM_USER_AGENT, phantomProfile, phantomTiming } from './profile.ts';
export { MISCLICK_STREAK_LIMIT, misclickStreak, phantomStopRule } from './stopRule.ts';

/** The languages whose patterns The Phantom's Mind tries. */
export const PHANTOM_LANGUAGES = ['en'] as const;

/**
 * The Phantom (Requirement 13, Phase 2a): an old phone on slow 3G that looks at the screen and taps.
 *
 * Its Body is the shared visual Body with The Phantom's pace; its Mind is the shared visual Mind with
 * `en` patterns that "taps". The CLI applies the profile's network and CPU throttling through
 * `applyThrottling` before the page is opened. Its Detectors are `misclick` and `slow_wait`; its stop
 * rule ends the Run with `slow_wait` or `misclicks` (Requirement 16).
 *
 * Not registered yet: task 21 adds it to `registry.ts`. Like The Listener's module, this file must not
 * import `registry.ts`.
 */
export const phantomGhost: Ghost<Sight, VisualAction> = {
  id: 'phantom',
  profile: phantomProfile,
  createBody: (page, _cdp, opts: BodyOptions) => createVisualBody(page, { ...phantomTiming, rng: opts.rng }),
  createMind: (mission: Mission, opts: MindOptions) =>
    createVisualMind(mission, { ...opts, languages: PHANTOM_LANGUAGES, pointer: 'tap' }),
  detectors: () => [createMisclickDetector(), createSlowWaitDetector()],
  stopRule: phantomStopRule,
};
