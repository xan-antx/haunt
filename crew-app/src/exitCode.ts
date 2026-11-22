export type PatrolOutcome =
  | { kind: 'prerequisite_missing' }
  | { kind: 'site_not_started' }
  | { kind: 'ran'; savedRuns: number }
  | { kind: 'crashed' };

/**
 * The patrol's own exit codes. Code 3 here means "the site started and no ghost saved a run".
 * It is not the engine's exit code 3 (a ghost's run saved with result `error`).
 */
export const EXIT = { ok: 0, prerequisite: 1, siteNotStarted: 2, noRuns: 3, crashed: 4 } as const;

export function mapExitCode(outcome: PatrolOutcome): number {
  switch (outcome.kind) {
    case 'prerequisite_missing':
      return EXIT.prerequisite;
    case 'site_not_started':
      return EXIT.siteNotStarted;
    case 'crashed':
      return EXIT.crashed;
    case 'ran':
      return outcome.savedRuns > 0 ? EXIT.ok : EXIT.noRuns;
  }
}
