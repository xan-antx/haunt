import type { Ghost } from '../../core/types.ts';
import { createFocusTrapDetector } from '../../detectors/focusTrap.ts';
import { createUnannouncedErrorDetector } from '../../detectors/unannouncedError.ts';
import { createUnlabeledButtonDetector } from '../../detectors/unlabeledButton.ts';
import type { Heard } from './ax.ts';
import { createListenerBody } from './body.ts';
import type { ListenerAction } from './body.ts';
import { createListenerMind } from './mind.ts';
import { listenerProfile } from './profile.ts';
import { listenerStopRule } from './stopRule.ts';

/**
 * The Listener (Requirement 2.1, Phase 1): keyboard only, through a screen reader's view.
 *
 * `detectors()` returns fresh instances on every call, in a fixed order, because the Detectors keep
 * state for one Run. This module must not import `registry.ts`: the registry imports this file and
 * registers the Ghost, so an import the other way round would be a cycle.
 */
export const listenerGhost: Ghost<Heard, ListenerAction> = {
  id: 'listener',
  profile: listenerProfile,
  createBody: createListenerBody,
  createMind: createListenerMind,
  detectors: () => [createUnlabeledButtonDetector(), createFocusTrapDetector(), createUnannouncedErrorDetector()],
  stopRule: listenerStopRule,
};
