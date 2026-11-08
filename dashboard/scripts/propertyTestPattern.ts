/**
 * Name filter for Property_Tests (Req 1.8, 1.9).
 *
 * A Property_Test is a top-level describe whose name starts with
 * "Feature: <spec name>, Property", where the spec name is kebab-case.
 * The pattern is passed to `vitest run -t`, so it must stay a plain
 * regex source string.
 */

/** Matches a full test name that starts with "Feature: <spec name>, Property". */
export const PROPERTY_TEST_PATTERN = '^Feature: [a-z0-9]+(-[a-z0-9]+)*, Property';

export function isPropertyTestName(fullName: string): boolean {
  return new RegExp(PROPERTY_TEST_PATTERN).test(fullName);
}
