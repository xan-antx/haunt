import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PROPERTY_TEST_PATTERN, isPropertyTestName } from '../propertyTestPattern';

/**
 * Property 12: Property_Test name filter matches exactly the Property_Tests.
 * **Validates: Requirements 1.8, 1.9**
 */

const RUNS = { numRuns: 200 };

const LOWER_DIGIT = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');

/** One kebab-case segment: 1 to 8 lowercase letters or digits. */
const segment = fc
  .array(fc.constantFrom(...LOWER_DIGIT), { minLength: 1, maxLength: 8 })
  .map((chars) => chars.join(''));

/** Kebab-case spec names, including the two real specs. */
const kebabName = fc.oneof(
  fc.constantFrom('haunt-dashboard', 'exorcise-different-ghost-fix'),
  fc.array(segment, { minLength: 1, maxLength: 5 }).map((parts) => parts.join('-')),
);

const suffix = fc.oneof(
  fc.constantFrom('', ' 1', ' 12: Property_Test name filter', ' 2: something > inner test'),
  fc.string({ maxLength: 40 }),
);

const valid = fc.tuple(kebabName, suffix).map(([name, rest]) => `Feature: ${name}, Property${rest}`);

/** Near misses that must never be treated as Property_Tests. */
const nearMiss = fc.oneof(
  // Lowercase "feature:".
  fc.tuple(kebabName, suffix).map(([name, rest]) => `feature: ${name}, Property${rest}`),
  // Missing comma after the spec name.
  fc.tuple(kebabName, suffix).map(([name, rest]) => `Feature: ${name} Property${rest}`),
  // "Property" appears later in the name, not right after the comma.
  fc
    .tuple(kebabName, segment, suffix)
    .map(([name, word, rest]) => `Feature: ${name}, ${word} Property${rest}`),
  // Leading spaces.
  fc
    .tuple(fc.integer({ min: 1, max: 4 }), valid)
    .map(([n, name]) => `${' '.repeat(n)}${name}`),
  // A property name behind an outer describe name.
  fc.tuple(kebabName, valid).map(([outer, name]) => `${outer} ${name}`),
);

/** Independent oracle: starts with "Feature: <kebab-case name>, Property". */
function oracle(s: string): boolean {
  const head = 'Feature: ';
  if (!s.startsWith(head)) return false;
  const rest = s.slice(head.length);
  const comma = rest.indexOf(',');
  if (comma < 0) return false;
  const name = rest.slice(0, comma);
  const segments = name.split('-');
  const isKebab = segments.every(
    (seg) => seg.length > 0 && [...seg].every((ch) => LOWER_DIGIT.includes(ch)),
  );
  return isKebab && rest.slice(comma).startsWith(', Property');
}

describe('Feature: haunt-dashboard, Property 12: Property_Test name filter matches exactly the Property_Tests', () => {
  it('accepts "Feature: <kebab spec>, Property..." for any kebab-case spec name and suffix', () => {
    fc.assert(
      fc.property(valid, (name) => {
        expect(isPropertyTestName(name)).toBe(true);
      }),
      RUNS,
    );
  });

  it('rejects near misses: lowercase feature, missing comma, Property later, leading spaces, outer describe', () => {
    fc.assert(
      fc.property(nearMiss, (name) => {
        expect(isPropertyTestName(name)).toBe(false);
      }),
      RUNS,
    );
  });

  it('agrees with an independent prefix check on valid names, near misses and arbitrary strings', () => {
    fc.assert(
      fc.property(fc.oneof(valid, nearMiss, fc.string({ maxLength: 60 })), (name) => {
        expect(isPropertyTestName(name)).toBe(oracle(name));
        expect(new RegExp(PROPERTY_TEST_PATTERN).test(name)).toBe(oracle(name));
      }),
      RUNS,
    );
  });

  it('matches the real Property_Test describe names', () => {
    expect(isPropertyTestName('Feature: haunt-dashboard, Property 12: Property_Test name filter')).toBe(true);
    expect(isPropertyTestName('Feature: exorcise-different-ghost-fix, Property 1: fix')).toBe(true);
    expect(isPropertyTestName('Feature: haunt-dashboard, Model invariants')).toBe(false);
  });
});
