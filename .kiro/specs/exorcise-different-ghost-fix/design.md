# Exorcise Different-Ghost Fix Bugfix Design

## Overview

The Exorcise screen (`dashboard/src/screens/ExorciseScreen.tsx`) compares a before run and an after run of one mission. Today it also compares runs by different ghosts. `defaultAfter` falls back to another ghost's run, the after picker lists every run of the mission, and `Comparison` renders the status table under a "Different ghosts." warning. A ghost can only confirm a fix for problems it can detect, so a Listener-vs-Bebe comparison labels findings "Exorcised" or "New haunting" when nobody checked them.

The fix has two layers:

1. **Model refuses.** `compareRuns` in `dashboard/src/model/exorcise.ts` returns `{ error: 'different_ghosts' }` for a same-mission, different-ghost pair, so no caller can get rows for such a pair. The `differentGhosts` flag is removed.
2. **Screen only offers valid pairs.** A new pure helper, `afterCandidates(before, runs)`, returns the other runs with the same ghost and the same `mission.id`, newest first. The after picker, `defaultAfter`, and `defaultPair` all use it. When it is empty, the screen shows "No after run yet for [ghost name]" instead of a comparison. A different-ghost URL shows the before run, both pickers, and a plain message that the runs cannot be compared.

The matching rules (multiset by type and page, "Not reached" when the after run never visited the page) do not change, and Property 5 still holds for every same-ghost pair.

## Glossary

- **Bug_Condition (C)**: A before/after pair with the same `mission.id` and different `ghost` values, either offered by the screen (picker option or default) or named by the URL, that the system turns into a comparison with status rows.
- **Property (P)**: For a pair in C, no status table and no "Exorcised", "Still haunting", "New haunting", or "Not reached" labels are shown. The model returns `{ error: 'different_ghosts' }`. The screen offers only same-ghost, same-mission after runs, newest first, or says "No after run yet for [ghost name]".
- **Preservation**: Behavior for same-ghost, same-mission pairs, different-mission pairs, unknown keys, the zero-runs empty state, run summaries, URL updates, and status styling, all of which stay as they are.
- **compareRuns**: Function in `dashboard/src/model/exorcise.ts` that matches findings of two runs and returns `ExorciseResult`.
- **afterCandidates**: New function in `dashboard/src/model/exorcise.ts`. Returns `runs` filtered to `r.key !== before.key && r.ghost === before.ghost && r.mission.id === before.mission.id`, sorted with `byStartedAtDesc`.
- **defaultAfter / defaultPair**: Functions in `ExorciseScreen.tsx` that choose the after run for a before run, and the pair shown at `#/exorcise`.
- **Comparison**: Component in `ExorciseScreen.tsx` that renders the summaries and the "What changed" table, or an error message.
- **GHOSTS**: Map in `dashboard/src/model/ghosts.ts` from ghost id to display name ("The Listener", "The Phantom", "Bebe").
- **Sample data**: `2026-11-03-listener-pay-bill` (startedAt 14:22:15Z) and `2026-11-03-bebe-pay-bill` (14:35:42Z), both mission `pay-bill`.

## Bug Details

### Bug Condition

The bug appears whenever two runs of one mission by different ghosts reach `Comparison`. That happens in three ways: `defaultAfter` falls back to `candidates[0]` when the before ghost has no partner (used by `defaultPair`, the before picker's `onChange`, and the before options' `disabled` check); `afterOptions` filters only by mission; and a URL `#/exorcise/:beforeKey/:afterKey` is rendered as given. `compareRuns` itself only rejects different missions, so it returns rows with `differentGhosts: true`, and `Comparison` renders them under a warning.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { before: Run, after: Run, source: 'default' | 'picker' | 'url' }
  OUTPUT: boolean

  RETURN input.before.mission.id = input.after.mission.id
         AND input.before.ghost != input.after.ghost
         AND input.before.key != input.after.key
END FUNCTION
```

For list-level behavior (picker options and defaults):

```
FUNCTION isBugConditionForOptions(before, runs)
  INPUT: before of type Run, runs of type Run[]
  OUTPUT: boolean

  RETURN EXISTS r IN runs WHERE r.key != before.key
                           AND r.mission.id = before.mission.id
                           AND r.ghost != before.ghost
END FUNCTION
```

When `isBugConditionForOptions` holds, the unfixed screen lists the other-ghost runs in the after picker, and if the before ghost has no partner, it also picks one of them as the default after run.

### Examples

- Sample data only, open `#/exorcise`. Expected: before = `2026-11-03-bebe-pay-bill` (newest run), "No after run yet for Bebe", no table. Actual: `defaultPair` pairs Listener and Bebe and shows "Different ghosts." with rows Exorcised, Exorcised, New haunting.
- Open `#/exorcise/2026-11-03-listener-pay-bill/2026-11-03-bebe-pay-bill`. Expected: before summary, both pickers, a message that the runs are by different ghosts and cannot be compared, no table. Actual: the status table with two "Exorcised" rows and one "New haunting" row.
- Before = `2026-11-03-listener-pay-bill` with Listener runs on 11-05 and 11-06 and the Bebe sample present. Expected after options: `2026-11-06-listener-pay-bill`, `2026-11-05-listener-pay-bill`, in that order. Actual: those plus `2026-11-03-bebe-pay-bill`.
- Sample data only, before picker. Expected: both runs selectable; choosing the Listener run shows "No after run yet for The Listener". Actual: both enabled only because each has the other ghost as a "partner", and choosing one gives a cross-ghost comparison.
- Edge case: `#/exorcise/<listener pay-bill>/<bebe autopay>` (different mission and different ghost). Expected: unchanged, "These runs are different missions, so there is nothing to compare." The mission check runs first.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- For same-ghost, same-mission pairs, rows match as a multiset by (type, page of the finding's step), with the same statuses, row order and row keys as today (3.1).
- A before finding with no match on a page the same-ghost after run never visited is "Not reached", with the note "[ghost] never got as far as [page] in the after run, so we can't tell if this is fixed." (3.2).
- Different `mission.id` values still show "These runs are different missions, so there is nothing to compare." with `role="alert"` and the failure style. This check runs before the ghost check (3.3).
- An unknown run key still shows `UnknownRunScreen` (3.4).
- Zero runs still shows the empty-state message instead of pickers (3.5).
- Same-ghost comparisons still show the Before and After summaries (ghost badge, result badge, goal, finding count, Ghost Cam link, provenance panel) and "What changed", or "Neither run found any problems." (3.6).
- Changing a picker to a valid pair still navigates to `#/exorcise/:beforeKey/:afterKey` with `replace: true` (3.7).
- Status cells keep text plus icon, with the failure red only on "New haunting" (3.8).
- Property 5 (rows partition the findings) holds for every same-ghost pair (3.9).
- The existing default pair for the Exorcise test fixtures stays the same. Runs newest first are 11-07 Bebe autopay (no partner), 11-06 Listener, 11-05 Listener, and so on. The first run with a same-ghost partner is 11-06, whose newest partner is 11-05, so before = `2026-11-05-listener-pay-bill` and after = `2026-11-06-listener-pay-bill`. The "picks a default pair on #/exorcise" test keeps passing unchanged, apart from the after picker's new label (see Fix Implementation).

**Scope:**
All pairs that are NOT same-mission, different-ghost pairs are unaffected. This includes:
- Same-ghost, same-mission pairs, whether chosen by default, by picker, or by URL
- Different-mission pairs (any ghosts)
- Unknown keys and the zero-runs state
- Every other dashboard screen; `compareRuns` is only called from `ExorciseScreen.tsx`

## Hypothesized Root Cause

1. **Fallback to another ghost in `defaultAfter`**: `candidates.find((r) => r.ghost === before.ghost) ?? candidates[0]` prefers the same ghost but falls back to any ghost. Because `defaultPair` and the before picker both call it, the fallback creates cross-ghost defaults and marks partner-less runs as having a partner (1.2, 1.3, 1.6).

2. **After options filtered only by mission**: `afterOptions` in `ExorciseScreen` checks `r.mission.id === before.mission.id` but not `r.ghost` (1.1).

3. **Model allows different ghosts**: `compareRuns` only rejects different missions and returns `differentGhosts: true` as a flag. `Comparison` treats the flag as a warning and still renders the rows (1.4, 1.5).

4. **No state for "before run without an after run"**: The URL forms are `#/exorcise` and `#/exorcise/:beforeKey/:afterKey`. `choose()` does nothing when `defaultAfter` returns `null`, and the screen falls through to the empty state when `after` is missing. A before run with no same-ghost partner has no way to be shown, which is why the code needed a fallback partner in the first place.

## Correctness Properties

Property 1: Bug Condition - Exorcise never compares runs by different ghosts

_For any_ list of runs and any before run in it, the fixed `afterCandidates(before, runs)` SHALL contain exactly the other runs with the same ghost and the same `mission.id` as the before run, sorted by `startedAt` newest first; `defaultAfter` SHALL return the first of them or `null`; `defaultPair` SHALL return only a same-ghost, same-mission pair or `null`; and _for any_ pair where isBugCondition holds, `compareRuns(before, after)` SHALL return `{ error: 'different_ghosts' }` and no rows, so the screen shows no status table or status labels and instead shows "No after run yet for [ghost name]" or the different-ghosts message.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

Property 2: Preservation - Same-ghost comparisons and other states are unchanged

_For any_ pair where the bug condition does NOT hold, the fixed `compareRuns` SHALL produce the same result as the original function, minus the removed `differentGhosts` field: `{ error: 'different_missions' }` for different missions, and for same-ghost, same-mission pairs the same rows (status, type, page, before, after, key), so every before finding and every after finding appears exactly once (Property 5) and the "Not reached" rule is kept. The screen SHALL keep the unknown-run screen, the zero-runs empty state, run summaries, replace navigation, and status styling.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct:

**File**: `dashboard/src/model/exorcise.ts`

**Functions**: `compareRuns`, new `afterCandidates`

**Specific Changes**:
1. **Refuse different ghosts in the model**: Change `ExorciseResult` to `{ rows: ExorciseRow[] } | { error: 'different_missions' | 'different_ghosts' }`. In `compareRuns`, keep the mission check first, then add `if (before.ghost !== after.ghost) return { error: 'different_ghosts' };`. Return `{ rows }`. The matching loop is untouched. Update the header comment to say "same mission and same ghost".
2. **Add `afterCandidates(before: Run, runs: Run[]): Run[]`**: filter by different key, same ghost, same `mission.id`, then sort with a copy and `byStartedAtDesc` from `../model/format`. It is pure, so the property test can call it directly.

**File**: `dashboard/src/screens/ExorciseScreen.tsx`

**Functions**: `defaultAfter`, `defaultPair`, `Comparison`, `ExorciseScreen`

**Specific Changes**:
1. **`defaultAfter`**: `return afterCandidates(before, runs)[0] ?? null;`. Update the doc comment ("the newest other run by the same ghost of the same mission"). `defaultPair` keeps its loop and now only returns same-ghost pairs.
2. **Before run without an after run**: Read an optional `before` search parameter on `#/exorcise` with `useSearchParams` (already used by the Graveyard and Haunted Map screens). Resolution order:
   - `beforeKey` and `afterKey` in the path: look both up; unknown key → `UnknownRunScreen` (unchanged).
   - `?before=<key>`: look it up (unknown → `UnknownRunScreen`); `after = defaultAfter(before, runs)`, which may be `null`.
   - Neither: `defaultPair(runs)`; if `null` and `runs.length > 0`, `before = runs[0]` (newest) and `after = null`.
   - `runs.length === 0`: the existing empty-state message (3.5). Its text can stay as is.
3. **`choose(b, a)`**: `nextAfter = a ?? defaultAfter(b, runs)`. If `nextAfter` exists, navigate to `exorcisePath(b.key, nextAfter.key)` with `replace: true` (unchanged). Otherwise navigate to `` `${exorcisePath()}?before=${encodeURIComponent(b.key)}` `` with `replace: true`, so 2.6 works and the state survives a reload. `routes.ts` and `parseRoute` need no change, because the path is still `/exorcise`.
4. **Before picker**: remove `disabled={!defaultAfter(r, runs)}`, so every run is selectable (2.6). In `onChange`, keep the current after run only if it has the same ghost and mission as the new before run and a different key. Otherwise pass `null`.
5. **After picker**: `const afterOptions = afterCandidates(before, runs);`.
   - If `afterOptions` is empty, render the after picker area as a `<p className={styles.notice}>` reading "No after run yet for {GHOSTS[before.ghost].name}." followed by a short hint, for example "Run {name} on this mission again after your fix, then come back." No empty `<select>` is rendered.
   - Otherwise render the `<select>`. Its value is `after.key` when `after` is in `afterOptions`, else `''` with a placeholder option "Choose a run by {ghost name}".
   - Rename the label from "After run (same mission)" to "After run (same ghost and mission)", so the visible label says why the list is short. Tests that use `getByLabelText('After run (same mission)')` are updated to the new label.
6. **Main area**:
   - `after` is `null`: show `RunSummary` for the before run (heading "Before") and no table. The "No after run yet" message sits in the after picker area.
   - `after` is set: `Comparison` maps `{ error: 'different_missions' }` to the existing alert (unchanged). It maps `{ error: 'different_ghosts' }` to the before `RunSummary` plus `<p className={styles.warning}><strong>Different ghosts.</strong> {before ghost name} and {after ghost name} look for different problems, so these runs can't be compared. Choose an after run by {before ghost name}.</p>`, with no table and no `role="alert"`. If `afterOptions` is empty, the after picker area already shows "No after run yet for [before ghost name]" (2.5).
   - Remove the old `result.differentGhosts` warning branch.

**File**: `dashboard/src/screens/ExorciseScreen.module.css`

1. **Add `.notice`** for the "No after run yet" text: `padding: var(--space-3) var(--space-4); border: 2px dashed var(--text-muted); border-radius: var(--radius); background: var(--surface); color: var(--text);`. It uses only existing tokens. `--text` on `--surface` is 12.21:1, and the border is decorative because the message is text. No red (2.7, design rules). No new color pair, so the contrast test needs no change.
2. **Keep `.warning`** (amber border on `--surface`) for the different-ghosts message. The status is in the bold text "Different ghosts.", so it is not shown by color alone.

**Tests that encode the buggy behavior** are rewritten, not deleted (product rule: never weaken a test to make it pass):
- `Exorcise.test.tsx` "shows a new haunting and warns when the ghosts differ" becomes "refuses to compare runs by different ghosts". At `/exorcise/${L}/2026-11-03-bebe-pay-bill` it asserts the "Different ghosts." message, no table, and none of the four status labels. "New haunting" coverage moves to a same-ghost fixture: a new derived Listener run that adds a finding (for example `listenerNewFinding()` in `fixtures/derived.ts`), asserting a "New haunting" row.
- `Exorcise.test.tsx` "offers only runs of the same mission as the after run" asserts the options are exactly `['2026-11-06-listener-pay-bill', '2026-11-05-listener-pay-bill']` in that order.
- `models.test.ts` "marks new findings and flags different ghosts" becomes two tests. "refuses to compare different ghosts" expects `compareRuns(before, bebeRun())` to equal `{ error: 'different_ghosts' }`. "marks new findings as new haunting" uses a same-ghost after run with an extra finding. The `expect(result.differentGhosts).toBe(false)` line is removed, because the field no longer exists.
- `models.properties.test.ts` Property 5 forces `a.ghost = b.ghost` along with the mission.

## Testing Strategy

### Validation Approach

First, run tests on the unfixed code to surface counterexamples that show the bug and confirm the root causes. Then apply the fix and verify both properties. The new property tests are tagged `Feature: exorcise-different-ghost-fix, Property N` so they stay apart from the haunt-dashboard properties.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples on the UNFIXED code. Confirm or refute the root causes. If refuted, re-hypothesize.

**Test Plan**: Write the new assertions against the current `compareRuns`, `defaultAfter`, `defaultPair`, and the rendered screen, and watch them fail.

**Test Cases**:
1. **Cross-ghost URL**: Render `/exorcise/${L}/${B}`. Assert no table and no "Exorcised" text (will fail: the table renders three rows).
2. **Default with only samples**: Render `/exorcise` with `sampleFiles()` only. Assert the before picker value is `2026-11-03-bebe-pay-bill` and "No after run yet for Bebe" is shown (will fail: the Listener/Bebe pair is shown).
3. **After options**: Render `/exorcise/${L}/2026-11-05-listener-pay-bill`. Assert the options exclude `2026-11-03-bebe-pay-bill` (will fail).
4. **Model refusal**: `compareRuns(listener, bebe)` equals `{ error: 'different_ghosts' }` (will fail: it returns rows).
5. **Edge case, different mission and ghost**: `/exorcise/${L}/2026-11-07-bebe-autopay` still shows the different-missions alert (should pass on unfixed code; guards the check order).

**Expected Counterexamples**:
- `defaultAfter(listenerSample, samples)` returns the Bebe run.
- `compareRuns` returns `rows` with `differentGhosts: true` for a Listener/Bebe pair.
- Causes: the `candidates[0]` fallback, the mission-only filter, and the missing ghost check in `compareRuns`.

### Fix Checking

**Goal**: For every pair and list where the bug condition holds, the fixed code produces the expected behavior.

**Pseudocode:**
```
FOR ALL (before, after) WHERE isBugCondition(before, after) DO
  result := compareRuns_fixed(before, after)
  ASSERT result = { error: 'different_ghosts' }
END FOR

FOR ALL runs, before IN runs DO
  options := afterCandidates(before, runs)
  ASSERT every r IN options: r.ghost = before.ghost
                             AND r.mission.id = before.mission.id
                             AND r.key != before.key
  ASSERT options contains every such r in runs
  ASSERT startedAt is non-increasing along options
  ASSERT defaultAfter(before, runs) = options[0] ?? null
END FOR

FOR ALL runs DO
  pair := defaultPair(runs)
  ASSERT pair = null OR (pair.before.ghost = pair.after.ghost
                         AND pair.before.mission.id = pair.after.mission.id)
END FOR
```

### Preservation Checking

**Goal**: For every pair where the bug condition does not hold, the fixed code matches the original.

**Pseudocode:**
```
FOR ALL (before, after) WHERE NOT isBugCondition(before, after) DO
  ASSERT stripDifferentGhosts(compareRuns_original(before, after)) = compareRuns_fixed(before, after)
END FOR
```

**Testing Approach**: Property-based testing fits preservation because fast-check generates many contract-valid runs (`contractRunArb` in `src/__tests__/arbitraries.ts`) and finds matching edge cases, such as duplicate findings and missing steps, that the example tests miss.

**Test Plan**: Before changing `compareRuns`, copy its current matching loop into the property test file as `compareRunsOriginal` (a test oracle, labelled as such). Run the preservation property against the unfixed code to confirm it passes. Keep it after the fix.

**Test Cases**:
1. **Same-ghost matching**: For same-ghost, same-mission pairs, the fixed rows deep-equal the oracle rows.
2. **Not reached**: The existing `/exorcise/${L}/2026-11-06-listener-pay-bill` test keeps passing: two "Not reached" rows and the "never got as far as /bill" note twice.
3. **Different missions**: For pairs with different `mission.id`, the result is `{ error: 'different_missions' }` whatever the ghosts.
4. **Default pair with fixtures**: "picks a default pair on #/exorcise" still gives before 11-05 and after 11-06.

### Unit Tests

- `compareRuns`: different ghosts → `{ error: 'different_ghosts' }`; different missions → `{ error: 'different_missions' }` even when the ghosts also differ; same-ghost new finding → "new_haunting".
- `afterCandidates` and `defaultAfter` on the samples: the Listener sample has no candidates; with the 11-05 and 11-06 Listener runs added, the candidates are `[11-06, 11-05]`.
- Screen states (`Exorcise.test.tsx`):
  - Samples only at `/exorcise`: before is the Bebe run, the text reads "No after run yet for Bebe", and there is no table and no after `<select>`.
  - `/exorcise?before=2026-11-03-listener-pay-bill`: "No after run yet for The Listener".
  - `/exorcise?before=nobody`: the unknown-run screen.
  - Cross-ghost URL: the before summary and the "Different ghosts." message are shown, the after picker lists only Listener runs, and there is no table.
  - Choosing a partner-less run in the before picker: the URL becomes `#/exorcise?before=<key>` via replace navigation, and the message appears.
  - Zero runs: the empty-state message is unchanged.

### Property-Based Tests

New block in `dashboard/src/__tests__/models.properties.test.ts`:

```ts
describe('Feature: exorcise-different-ghost-fix, Property 1: Exorcise only pairs runs by the same ghost on the same mission', () => {
  // Small pools so collisions (same ghost, same mission, ties in startedAt) are common.
  const runsArb = fc
    .array(
      fc.record({
        run: runArb('x'),
        ghost: fc.constantFrom('listener', 'phantom', 'bebe' as const),
        missionId: fc.constantFrom('pay-bill', 'autopay'),
        startedAt: fc.date({ min: new Date('2026-01-01'), max: new Date('2026-12-31') }),
      }),
      { minLength: 1, maxLength: 8 },
    )
    .map((items) =>
      items.map(({ run, ghost, missionId, startedAt }, i) => ({
        ...run,
        key: `run-${i}`,
        ghost,
        mission: { ...run.mission, id: missionId },
        startedAt: startedAt.toISOString(),
      })),
    );

  it('after options are same ghost and mission, complete, and newest first', () => {
    fc.assert(
      fc.property(runsArb, fc.nat(), (runs, pick) => {
        const before = runs[pick % runs.length]!;
        const options = afterCandidates(before, runs);
        const expected = runs.filter(
          (r) => r.key !== before.key && r.ghost === before.ghost && r.mission.id === before.mission.id,
        );
        expect(new Set(options.map((r) => r.key))).toEqual(new Set(expected.map((r) => r.key)));
        expect(options).toHaveLength(expected.length);
        for (let i = 1; i < options.length; i++) {
          expect(Date.parse(options[i - 1]!.startedAt)).toBeGreaterThanOrEqual(Date.parse(options[i]!.startedAt));
        }
        expect(defaultAfter(before, runs)).toBe(options[0] ?? null);
        const pair = defaultPair(runs);
        if (pair) {
          expect(pair.after.ghost).toBe(pair.before.ghost);
          expect(pair.after.mission.id).toBe(pair.before.mission.id);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('compareRuns never produces rows for different-ghost pairs', () => {
    fc.assert(
      fc.property(runArb('before'), runArb('after'), (before, after) => {
        fc.pre(before.ghost !== after.ghost);
        after.mission = { ...before.mission };
        expect(compareRuns(before, after)).toEqual({ error: 'different_ghosts' });
      }),
      { numRuns: 300 },
    );
  });
});
```

The exact field names (`key`, `startedAt` as an ISO string) follow `Run` in `src/data/types.ts`. Adjust them if the implementation finds a difference. If `fc.pre` discards too many cases, set `after.ghost` to a ghost other than `before.ghost` with `fc.constantFrom` instead.

- **Feature: exorcise-different-ghost-fix, Property 2: same-ghost comparisons are unchanged**: For same-mission pairs with `after.ghost = before.ghost`, `compareRuns` deep-equals `{ rows: compareRunsOriginal(before, after).rows }`. For pairs with different missions, it equals `{ error: 'different_missions' }`.
- **Feature: haunt-dashboard, Property 5** (updated, not weakened): the `sameMission` arbitrary also sets `a.ghost = b.ghost`. All of its partition assertions stay.

### Integration Tests

- `src/__tests__/a11y.test.tsx`: "Exorcise across ghosts" at `/exorcise/${L}/${B}` now renders the different-ghosts state and must still have zero axe violations and one `h1`. "Exorcise" at `/exorcise/${L}/after` remains a same-ghost comparison. Add "Exorcise with no after run" at `/exorcise?before=${L}`.
- `e2e/haunt.spec.ts`: `#/exorcise` with sample data now shows "No after run yet for Bebe". The keyboard, reduced-motion, reflow (320 px and 640 px), and real-browser axe tests (including color contrast for `.notice`) run against this state unchanged. Add one assertion that `#/exorcise` shows the text "No after run yet for Bebe" and no table. The keyboard test still needs more than 5 focus stops, which the nav links, the before picker, the Ghost Cam link, and the provenance panel provide.
- Full flow in `Exorcise.test.tsx`: start on a cross-ghost URL, choose a Listener run in the after picker, and assert the URL becomes `#/exorcise/${L}/<listener key>` and the table appears.
