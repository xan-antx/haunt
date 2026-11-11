import type { GiveUpReason, Ghost, RunState } from '../../core/types.ts';
import { createCutOffTextDetector } from '../../detectors/cutOffText.ts';
import { createDarkPatternDetector } from '../../detectors/darkPattern.ts';
import { createUntranslatedDetector } from '../../detectors/untranslated.ts';
import { createVisualBody } from '../visual/body.ts';
import { createVisualMind } from '../visual/mind.ts';
import type { Sight, VisualAction } from '../visual/types.ts';
import {
  BEBE_LANGUAGES,
  BEBE_REACTION_DELAY,
  BEBE_SETTLE_MAX_MS,
  BEBE_SETTLE_QUIET_MS,
  BEBE_TYPING_DELAY_MS,
  bebeProfile,
} from './profile.ts';

/**
 * Bebe's stop rule (Requirement 18.3; design "Bebe has no stop rule from Findings"). Findings never
 * end her Run: she completes the Mission when she can. Only the core's step limit and the Mind's
 * `no_match` end a Run that has not succeeded.
 */
export function bebeStopRule(_state: RunState): GiveUpReason | null {
  return null;
}

/**
 * Bebe (Requirements 17 and 18, Phase 2a): reads at 200% zoom in Punjabi, at a slow and careful
 * pace, and clicks with a mouse.
 *
 * Her Detectors are `cut_off_text`, `untranslated` and `dark_pattern`. She is registered in
 * `registry.ts`, so like the Listener's module this one must not import the registry (an import cycle).
 */
export const bebeGhost: Ghost<Sight, VisualAction> = {
  id: 'bebe',
  profile: bebeProfile,
  createBody: (page, _cdp, opts) =>
    createVisualBody(page, {
      settleQuietMs: BEBE_SETTLE_QUIET_MS,
      settleMaxMs: BEBE_SETTLE_MAX_MS,
      reactionDelay: BEBE_REACTION_DELAY,
      typingDelayMs: BEBE_TYPING_DELAY_MS,
      rng: opts.rng,
    }),
  createMind: (mission, opts) => createVisualMind(mission, { ...opts, languages: BEBE_LANGUAGES, pointer: 'click' }),
  detectors: () => [createCutOffTextDetector(), createUntranslatedDetector(), createDarkPatternDetector()],
  stopRule: bebeStopRule,
};
