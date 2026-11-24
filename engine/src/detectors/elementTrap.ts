/*
 * Pure analysis of an element trap: keyboard focus that cannot leave one element (a text box).
 *
 * `findElementTraps` reads a history of key presses and focus reads and returns one candidate for
 * each element that held focus through at least one Tab press and one Shift+Tab press. Only a Tab or
 * Shift+Tab press that moves focus to another element clears an element. Escape pressed twice in a
 * row only describes how the trap ended; it never removes a candidate.
 *
 * `describeElementTrap` writes the title and the evidence of the Finding. Neither function reads a
 * page or a browser.
 */

/** One thing in the history: a key press, or the focus read after a Step. */
export interface TrapEvent {
  step: number;
  kind: 'key' | 'focus';
  /** `Tab`, `Shift+Tab`, `Escape`, ... for key events, `''` for focus reads. */
  key: string;
  /** Element key of the focused element after the event. */
  focusKey: string | null;
  /** Element key of its dialog, or null. */
  dialogKey: string | null;
}

export type TrapResolution = 'freed_by_double_escape' | 'not_freed_by_double_escape' | 'open';

export interface TrapCandidate {
  elementKey: string;
  /** First Step with a press that left focus on the element. */
  firstStayStep: number;
  /** Step of the press that completed the Tab + Shift+Tab pair. */
  qualifiedStep: number;
  /** Presses that left focus on the element, by key name. */
  stayKeys: Record<string, number>;
  /** What pressing Escape twice in a row did; `open` when it was not pressed twice. */
  resolution: TrapResolution;
  /** Step of the second Escape; equals `qualifiedStep` for `open`. */
  resolutionStep: number;
}

interface Streak {
  elementKey: string;
  firstStayStep: number | null;
  stayKeys: Record<string, number>;
  candidate: TrapCandidate | null;
}

/**
 * Finds the element traps in a history. At most one candidate is returned for each element key.
 */
export function findElementTraps(events: readonly TrapEvent[]): TrapCandidate[] {
  const candidates = new Map<string, TrapCandidate>();
  const cleared = new Set<string>();

  let previousFocus: string | null = null;
  let streak = null as Streak | null;
  let escapeRun = 0;
  /** The element that had focus when the current row of Escape presses began, and its candidate. */
  let escapeStart: { focusKey: string | null; candidate: TrapCandidate | null } | null = null;

  for (const event of events) {
    // Events inside a dialog never belong to a streak: the dialog part judges them.
    const streakKey = event.dialogKey === null ? event.focusKey : null;

    if (event.kind === 'key' && (event.key === 'Tab' || event.key === 'Shift+Tab')) {
      if (previousFocus !== null && event.focusKey !== previousFocus) cleared.add(previousFocus);
    }

    // The streak is an unbroken run of events with the same focus key.
    if (streakKey === null || streak?.elementKey !== streakKey) {
      streak = streakKey === null ? null : { elementKey: streakKey, firstStayStep: null, stayKeys: {}, candidate: null };
    }

    const isStay =
      event.kind === 'key' &&
      streak !== null &&
      previousFocus === streak.elementKey &&
      event.focusKey === streak.elementKey &&
      event.dialogKey === null;

    if (isStay && streak) {
      streak.firstStayStep ??= event.step;
      streak.stayKeys[event.key] = (streak.stayKeys[event.key] ?? 0) + 1;
      if (streak.candidate) {
        streak.candidate.stayKeys[event.key] = (streak.candidate.stayKeys[event.key] ?? 0) + 1;
      } else if ((streak.stayKeys['Tab'] ?? 0) > 0 && (streak.stayKeys['Shift+Tab'] ?? 0) > 0) {
        const existing = candidates.get(streak.elementKey);
        if (existing) {
          // A later streak on the same element: its earlier presses were not counted yet.
          for (const [k, n] of Object.entries(streak.stayKeys)) existing.stayKeys[k] = (existing.stayKeys[k] ?? 0) + n;
          streak.candidate = existing;
        } else {
          streak.candidate = {
            elementKey: streak.elementKey,
            firstStayStep: streak.firstStayStep,
            qualifiedStep: event.step,
            stayKeys: { ...streak.stayKeys },
            resolution: 'open',
            resolutionStep: event.step,
          };
          candidates.set(streak.elementKey, streak.candidate);
        }
      }
    }

    // Rows of Escape presses.
    if (event.kind === 'key') {
      if (event.key === 'Escape') {
        escapeRun += 1;
        if (escapeRun === 1) {
          const known = previousFocus === null ? null : (candidates.get(previousFocus) ?? null);
          escapeStart = { focusKey: previousFocus, candidate: known };
        } else if (escapeRun === 2 && escapeStart?.candidate) {
          const candidate = escapeStart.candidate;
          if (candidate.resolution === 'open') {
            candidate.resolution = event.focusKey === escapeStart.focusKey ? 'not_freed_by_double_escape' : 'freed_by_double_escape';
            candidate.resolutionStep = event.step;
          }
        }
      } else {
        escapeRun = 0;
        escapeStart = null;
      }
    }

    previousFocus = event.focusKey;
  }

  return [...candidates.values()].filter((c) => !cleared.has(c.elementKey));
}

/** What the page and the accessibility tree say about the element. */
export interface TrapElementInfo {
  /** False when the element is gone from the page. */
  present: boolean;
  /** Role textbox, searchbox or combobox, not a native input, select or textarea, and visible. */
  textbox: boolean;
  /** Chromium's role for the element, else its role attribute. */
  role: string;
  /**
   * The Computed_Name last read from Chromium's accessibility tree while the element had focus.
   * `''` when it has none, `null` when it could not be read.
   */
  name: string | null;
  /** True when visible page text, the element's title or description says that Escape (or Esc) works. */
  escapeDocumented: boolean;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Tab first, then Shift+Tab, then the other keys in name order. */
function orderedKeys(stayKeys: Record<string, number>): string[] {
  const rest = Object.keys(stayKeys)
    .filter((k) => k !== 'Tab' && k !== 'Shift+Tab')
    .sort();
  return [...['Tab', 'Shift+Tab'].filter((k) => k in stayKeys), ...rest];
}

/**
 * The title and the evidence of an element trap Finding. The wording avoids the words dialog, modal
 * and pop-up: the dashboard reads those words as a pop-up trap.
 */
export function describeElementTrap(
  candidate: TrapCandidate,
  info: TrapElementInfo,
  announcements: readonly string[],
): { title: string; evidence: string } {
  const role = info.role === '' ? 'textbox' : info.role;
  const first =
    info.name === null
      ? `Keyboard focus could not leave a text box (role ${role}); its accessible name could not be read.`
      : info.name.trim() === ''
        ? `Keyboard focus could not leave a text box with no name (role ${role}).`
        : `Keyboard focus could not leave the text box "${info.name}" (role ${role}).`;

  const stays = orderedKeys(candidate.stayKeys).map((k) => {
    const n = candidate.stayKeys[k] ?? 0;
    return `${k} (${n} ${plural(n, 'press', 'presses')})`;
  });
  const second = `${joinList(stays)} left focus on it.`;

  let third: string;
  if (candidate.resolution === 'freed_by_double_escape') {
    third = 'Tab and Shift+Tab never moved focus away. Escape pressed twice did free focus: it moved focus to another control.';
    third += info.escapeDocumented
      ? ' The page does mention that Escape works, but Tab and Shift+Tab still cannot leave the text box.'
      : ' This exit is undocumented: no text on the page and no announcement says that Escape works.';
  } else if (candidate.resolution === 'not_freed_by_double_escape') {
    third = 'Escape pressed twice did not move focus either.';
  } else {
    third = 'No key moved focus before the run ended.';
  }

  const heard = announcements.find((a) => a.trim() !== '');
  const fourth = heard === undefined ? 'Nothing was announced while focus was stuck.' : `The screen reader announced "${heard}".`;

  return {
    title: 'Keyboard focus is trapped in a text box',
    evidence: [first, second, third, fourth].join(' '),
  };
}
