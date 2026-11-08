// Fixtures derived from the samples by one targeted edit each.
// Used for cases the samples do not cover. runs/samples/ is never changed.

import { bebeSample, listenerSample } from './samples';

type Json = Record<string, unknown>;
type JsonStep = Json & { n: number; page: string };
type JsonFinding = Json & { type: string; step: number };

function steps(json: Json): JsonStep[] {
  return json.steps as JsonStep[];
}
function findings(json: Json): JsonFinding[] {
  return json.findings as JsonFinding[];
}

/** Invalid: result uses the old value "success". */
export function resultSuccess(): Json {
  const json = bebeSample();
  json.result = 'success';
  return json;
}

/** Invalid: finding type uses the old value "keyboard_trap". */
export function typeKeyboardTrap(): Json {
  const json = listenerSample();
  findings(json)[1]!.type = 'keyboard_trap';
  return json;
}

/** Invalid: ghost outside the contract. */
export function ghostPoltergeist(): Json {
  const json = listenerSample();
  json.ghost = 'poltergeist';
  return json;
}

export function wrongFormatVersion(): Json {
  const json = listenerSample();
  json.formatVersion = 2;
  return json;
}

export function missingRunId(): Json {
  const json = listenerSample();
  delete json.runId;
  return json;
}

export function waitMsAsText(): Json {
  const json = listenerSample();
  steps(json)[3]!.waitMs = 'fast';
  return json;
}

export function badStartedAt(): Json {
  const json = listenerSample();
  json.startedAt = 'last Tuesday';
  return json;
}

export function duplicateStepNumber(): Json {
  const json = listenerSample();
  steps(json)[2]!.n = 2;
  return json;
}

export function missingMissionGoal(): Json {
  const json = listenerSample();
  delete (json.mission as Json).goal;
  return json;
}

/** Valid, with a warning: a finding points to step 42. */
export function findingMissingStep(): Json {
  const json = listenerSample();
  findings(json)[0]!.step = 42;
  return json;
}

/** Valid, with warnings: unsafe screenshot paths. */
export function unsafeScreenshots(): Json {
  const json = listenerSample();
  const s = steps(json);
  s[0]!.screenshot = '/etc/passwd';
  s[1]!.screenshot = '../other/shots/002.png';
  s[2]!.screenshot = 'https://example.com/003.png';
  s[3]!.screenshot = 'shots\\004.png';
  return json;
}

/** Valid Phantom run, derived from the Bebe sample. */
export function phantomRun(): Json {
  const json = bebeSample();
  json.ghost = 'phantom';
  json.runId = '2026-11-04-phantom-pay-bill';
  json.startedAt = '2026-11-04T09:00:00Z';
  return json;
}

/** "After" Listener run with the unlabeled_button finding removed. */
export function listenerAfterFix(): Json {
  const json = listenerSample();
  json.runId = '2026-11-05-listener-pay-bill';
  json.startedAt = '2026-11-05T10:00:00Z';
  json.findings = findings(json).filter((f) => f.type !== 'unlabeled_button');
  return json;
}

/** "After" Listener run that never reaches /bill. */
export function listenerNeverReachesBill(): Json {
  const json = listenerSample();
  json.runId = '2026-11-06-listener-pay-bill';
  json.startedAt = '2026-11-06T10:00:00Z';
  json.result = 'error';
  json.steps = steps(json).filter((s) => s.page === '/');
  json.findings = [];
  return json;
}

/** "After" Listener run that adds one finding the before run did not have. */
export function listenerNewFinding(): Json {
  const json = listenerSample();
  json.runId = '2026-11-08-listener-pay-bill';
  json.startedAt = '2026-11-08T10:00:00Z';
  json.findings = [
    ...findings(json),
    {
      type: 'unannounced_error',
      step: 6,
      title: 'The amount field error is never read out',
      evidence: 'An error appears next to the field, but the screen reader says nothing',
    },
  ];
  return json;
}

/** A run of a different mission. */
export function differentMission(): Json {
  const json = bebeSample();
  json.runId = '2026-11-07-bebe-autopay';
  (json.mission as Json).id = 'set-up-autopay';
  return json;
}
