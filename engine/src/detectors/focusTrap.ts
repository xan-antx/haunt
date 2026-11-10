import type { DetectedProblem, Detector, DetectorContext } from '../core/types.ts';

// The Listener's stop rule is defined next to the Listener (src/ghosts/listener/stopRule.ts, where
// task 12 picks it up for the Ghost). It is re-exported here because it belongs to this feature too.
export { listenerStopRule } from '../ghosts/listener/stopRule.ts';

/*
 * The `focus_trap` Detector (Requirements 10.3 and 10.4).
 *
 * It records one Finding when, while focus stays inside ONE visible dialog:
 *   (a) some Tab press landed on a control already reached in that dialog,
 *   (b) some Shift+Tab press did the same,
 *   (c) Escape was pressed and the dialog stayed open, with focus still inside it, and
 *   (d) at least one visible, enabled control inside the dialog was never focused.
 *
 * How it decides:
 *   - The history comes from the Step traces (`StepTrace.keys`: for each key press, the element key of
 *     the focused element and of its dialog). The Detector also reads, after every Step, where focus
 *     is now (`window.__haunt.keys.focus()`, a pure read). That adds the control that had focus when
 *     the dialog opened, or when a Settle moved focus, which no key press logged.
 *   - The "episode" is the run of events at the end of the history during which the dialog key stayed
 *     the same and was not null. If focus has left the dialog (or there is none), there is no episode.
 *   - Inside the episode, a press "landed on a reached control" when its focus key was already focused
 *     earlier in the episode, by a press or by the focus reads.
 *   - Conditions (c) and (d) are read from the page as it is now, with one read-only script: is the
 *     dialog still in the DOM and visible, is focus inside it, and which visible, enabled controls
 *     inside it were never focused, each with the reason found in the DOM.
 *
 * The Finding is returned from `observe()`, at the Step where the last of (a), (b) and (c) first held
 * (normally the Step with the Escape press). It must come from `observe()` and not from `finish()`,
 * because the Listener's stop rule reads the Finding count in the same loop iteration. The Finding's
 * key is the dialog's element key, so the same trap is recorded once.
 *
 * Names and roles in the evidence are a best-effort reading of the DOM's naming sources (aria-labelledby,
 * aria-label, labels, text, value, alt, title, placeholder). They are only used to describe controls;
 * no decision depends on them.
 *
 * Everything here only reads. Create a new Detector for each Run with `createFocusTrapDetector()`: it
 * remembers where focus was after each Step and which traps it has already reported.
 */

/** Where focus was after a Step, read by the Detector. */
interface Snapshot {
  /** Identifies the document (its navigation start). Element keys are only unique within one. */
  doc: string;
  focus: { focusKey: string | null; dialogKey: string | null } | null;
}

/** One thing that happened in the history: a key press, or the focus read after a Step. */
interface Event {
  step: number;
  kind: 'key' | 'focus';
  /** `Tab`, `Shift+Tab`, `Escape`, ... for key events. */
  key: string;
  focusKey: string | null;
  dialogKey: string | null;
  /** Document and dialog key together: two events are in the same episode when these are equal. */
  dialogId: string | null;
}

/** A control as the page-side script describes it. */
interface Described {
  key: string;
  /** `null` when the element is gone from the page. */
  name: string | null;
  role: string;
}

interface Unreached extends Described {
  /** For example `tabindex="-1"`. */
  reason: string;
}

interface PageReport {
  /** The dialog is in the DOM and visible. */
  open: boolean;
  /** Focus is on the dialog or something inside it. */
  focusInside: boolean;
  dialogName: string | null;
  /** The controls asked for, in the same order as the keys that were passed in. */
  described: Described[];
  /** Visible, enabled controls in the dialog that were never focused, in document order. */
  unreached: Unreached[];
}

interface PageArg {
  dialogKey: string;
  /** Element keys focused during the episode. */
  reached: string[];
  /** Element keys to describe. */
  describe: string[];
}

/** Page-side: where is focus now? Pure read. */
const READ_FOCUS_SCRIPT = String.raw`(function () {
  var keys = window.__haunt && window.__haunt.keys ? window.__haunt.keys : null;
  return {
    doc: String(Math.round(performance.timeOrigin * 1000)),
    focus: keys ? keys.focus() : null,
  };
})`;

/**
 * Page-side: the state of the dialog and its controls. Plain JavaScript in a string so that no
 * transpiler helper can leak into the page. Pure reads only; the one call that is not a plain read is
 * `__haunt.keys.key`, which numbers an element in the engine's own WeakMap and never touches the page.
 */
const READ_DIALOG_SCRIPT = String.raw`(function (arg) {
  var keys = window.__haunt && window.__haunt.keys ? window.__haunt.keys : null;
  var empty = { open: false, focusInside: false, dialogName: null, described: [], unreached: [] };
  if (!keys) return empty;
  var dialog = keys.element(arg.dialogKey);
  if (!dialog) return empty;

  var reached = {};
  for (var r = 0; r < arg.reached.length; r += 1) reached[arg.reached[r]] = true;

  function collapse(s, max) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '\u2026' : t;
  }

  function visible(el) {
    if (!el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      if (!el.checkVisibility({ checkVisibilityCSS: true })) return false;
    } else {
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    }
    var rects = el.getClientRects();
    for (var i = 0; i < rects.length; i += 1) if (rects[i].width > 0 && rects[i].height > 0) return true;
    return false;
  }

  function activeElement() {
    var a = document.activeElement;
    for (var i = 0; a && a.shadowRoot && a.shadowRoot.activeElement && i < 20; i += 1) a = a.shadowRoot.activeElement;
    return a;
  }

  function within(node, ancestor) {
    for (var n = node, i = 0; n && i < 500; i += 1) {
      if (n === ancestor) return true;
      var root = n.getRootNode ? n.getRootNode() : null;
      n = n.parentElement || (root && root.host) || null;
    }
    return false;
  }

  function allElements(root, acc) {
    var list = root.querySelectorAll('*');
    for (var i = 0; i < list.length; i += 1) {
      acc.push(list[i]);
      if (list[i].shadowRoot) allElements(list[i].shadowRoot, acc);
    }
    return acc;
  }

  function textOf(id, el) {
    var root = el.getRootNode && el.getRootNode();
    var target = root && root.getElementById ? root.getElementById(id) : document.getElementById(id);
    return target ? collapse(target.textContent, 80) : '';
  }

  function labelledBy(el) {
    var by = el.getAttribute('aria-labelledby');
    if (!by) return '';
    var parts = [];
    var ids = by.split(/\s+/).filter(Boolean);
    for (var i = 0; i < ids.length; i += 1) {
      var t = textOf(ids[i], el);
      if (t) parts.push(t);
    }
    return collapse(parts.join(' '), 80);
  }

  function roleOf(el) {
    var explicit = (el.getAttribute('role') || '').toLowerCase().split(/\s+/)[0];
    if (explicit) return explicit;
    var tag = el.localName;
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'a' || tag === 'area') return 'link';
    if (tag === 'select') return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') return type;
      if (type === 'button' || type === 'submit' || type === 'reset' || type === 'image') return 'button';
      if (type === 'range') return 'slider';
      if (type === 'number') return 'spinbutton';
      if (type === 'search') return 'searchbox';
      return 'textbox';
    }
    return 'control';
  }

  function nameOf(el) {
    var by = labelledBy(el);
    if (by) return by;
    var label = el.getAttribute('aria-label');
    if (label && collapse(label, 80)) return collapse(label, 80);
    var tag = el.localName;
    if ((tag === 'input' || tag === 'select' || tag === 'textarea') && el.labels && el.labels.length) {
      var texts = [];
      for (var i = 0; i < el.labels.length; i += 1) {
        var t = collapse(el.labels[i].textContent, 80);
        if (t) texts.push(t);
      }
      if (texts.length) return collapse(texts.join(' '), 80);
    }
    if (tag === 'input') {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'button' || type === 'submit' || type === 'reset') {
        var v = collapse(el.value, 80);
        if (v) return v;
      }
      if (type === 'image' && collapse(el.getAttribute('alt'), 80)) return collapse(el.getAttribute('alt'), 80);
    } else if (tag !== 'select' && tag !== 'textarea') {
      var own = collapse(el.textContent, 80);
      if (own) return own;
    }
    var title = collapse(el.getAttribute('title'), 80);
    if (title) return title;
    var placeholder = collapse(el.getAttribute('placeholder'), 80);
    if (placeholder) return placeholder;
    return '';
  }

  function describe(key) {
    var el = keys.element(key);
    if (!el) return { key: key, name: null, role: 'control' };
    return { key: key, name: nameOf(el), role: roleOf(el) };
  }

  // Widget roles whose controls are controls in their own right. Items of composite widgets (tabs,
  // options, menu items, tree items, radios of a role=radiogroup) are left out: they are meant to be
  // reached with the arrow keys.
  var WIDGET_ROLES = { button: 1, link: 1, checkbox: 1, 'switch': 1, slider: 1, spinbutton: 1, textbox: 1, combobox: 1, searchbox: 1 };
  var COMPOSITE = '[role="toolbar"], [role="menu"], [role="menubar"], [role="tablist"], [role="listbox"], ' +
    '[role="radiogroup"], [role="tree"], [role="treegrid"], [role="grid"]';

  function tabindexOf(el) {
    var raw = el.getAttribute('tabindex');
    if (raw === null) return null;
    var n = parseInt(raw, 10);
    return isNaN(n) ? null : n;
  }

  function isControl(el) {
    var tag = el.localName;
    var index = tabindexOf(el);
    var native =
      tag === 'button' || tag === 'select' || tag === 'textarea' || tag === 'summary' ||
      (tag === 'input' && (el.getAttribute('type') || '').toLowerCase() !== 'hidden') ||
      ((tag === 'a' || tag === 'area') && el.hasAttribute('href')) ||
      (el.getAttribute('contenteditable') !== null && el.getAttribute('contenteditable') !== 'false');
    var widget = WIDGET_ROLES[(el.getAttribute('role') || '').toLowerCase().split(/\s+/)[0]] === 1;
    if (!native && !widget && !(index !== null && index >= 0)) return false;
    // Roving tabindex: an item of a composite widget with tabindex -1 is reached with the arrow keys.
    if (index !== null && index < 0 && el.closest(COMPOSITE)) return false;
    return true;
  }

  function disabled(el) {
    try { if (el.matches(':disabled')) return true; } catch (e) { /* not a form control */ }
    return el.getAttribute('aria-disabled') === 'true';
  }

  function isRadio(el) {
    return el.localName === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'radio';
  }

  function groupOf(el) {
    return (el.form ? keys.key(el.form) : 'none') + '|' + el.name;
  }

  var all = allElements(dialog, []);

  // A group of radio buttons is reached with Tab once, and then with the arrow keys.
  var radioReached = {};
  for (var a = 0; a < all.length; a += 1) {
    if (isRadio(all[a]) && all[a].name && reached[keys.key(all[a])]) radioReached[groupOf(all[a])] = true;
  }

  var unreached = [];
  var radioListed = {};
  for (var c = 0; c < all.length; c += 1) {
    var el = all[c];
    if (!isControl(el) || disabled(el) || !visible(el)) continue;
    var key = keys.key(el);
    if (reached[key]) continue;
    if (isRadio(el) && el.name) {
      var group = groupOf(el);
      if (radioReached[group] || radioListed[group]) continue;
      radioListed[group] = true;
    }
    var index = tabindexOf(el);
    var reason;
    if (el.closest('[inert]')) reason = 'inert';
    else if (index !== null && index < 0) reason = 'tabindex="' + collapse(el.getAttribute('tabindex'), 10) + '"';
    else if (index === null && !(el.localName === 'button' || el.localName === 'select' || el.localName === 'textarea' ||
      el.localName === 'summary' || el.localName === 'input' || el.localName === 'a' || el.localName === 'area' ||
      el.getAttribute('contenteditable') !== null)) reason = 'not focusable (no tabindex)';
    else reason = 'tabbable, but Tab never landed on it';
    unreached.push({ key: key, name: nameOf(el), role: roleOf(el), reason: reason });
  }

  var dialogName = labelledBy(dialog);
  if (!dialogName && dialog.getAttribute('aria-label')) dialogName = collapse(dialog.getAttribute('aria-label'), 80);
  if (!dialogName) {
    var heading = dialog.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) dialogName = collapse(heading.textContent, 80);
  }

  var active = activeElement();
  return {
    open: visible(dialog),
    focusInside: !!active && within(active, dialog),
    dialogName: dialogName || null,
    described: arg.describe.map(describe),
    unreached: unreached,
  };
})`;

/** `"Name" (role)`, or `(unnamed role)` when there is no name, or a note when the element is gone. */
function control(c: Described): string {
  if (c.name === null) return 'a control that has since been removed';
  return c.name === '' ? `(unnamed ${c.role})` : `"${c.name}" (${c.role})`;
}

/** `"Name" (role, reason)`, for example `"Close dialog" (button, tabindex="-1")`. */
function controlWithReason(c: Unreached): string {
  return c.name === '' || c.name === null ? `(unnamed ${c.role}, ${c.reason})` : `"${c.name}" (${c.role}, ${c.reason})`;
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** What The Listener did with Tab or Shift+Tab inside the episode. */
interface KeyRun {
  presses: number;
  /** Distinct controls the key landed on, in the order it first landed on them. */
  order: string[];
  /** The first press that landed on a control already reached. */
  repeat: { step: number; key: string } | null;
}

/**
 * Creates the `focus_trap` Detector. Make a new one for each Run: it remembers where focus was after
 * each Step and which traps it has already reported.
 */
export function createFocusTrapDetector(): Detector {
  /** Where focus was after each Step, by Step number. */
  const snapshots = new Map<number, Snapshot>();
  /** Traps already reported, by Finding key. */
  const reported = new Set<string>();

  /** Key presses and focus reads of Steps 1 to `upTo`, in the order they happened. */
  function timeline(ctx: DetectorContext, upTo: number): Event[] {
    const events: Event[] = [];
    for (const recorded of ctx.steps) {
      const step = recorded.step.n;
      if (step > upTo) break;
      const doc = snapshots.get(step)?.doc ?? '';
      for (const k of recorded.trace.keys) {
        events.push({
          step,
          kind: 'key',
          key: k.key,
          focusKey: k.focusKey,
          dialogKey: k.dialogKey,
          dialogId: k.dialogKey === null ? null : `${doc}:${k.dialogKey}`,
        });
      }
      const focus = snapshots.get(step)?.focus ?? null;
      if (focus) {
        events.push({
          step,
          kind: 'focus',
          key: '',
          focusKey: focus.focusKey,
          dialogKey: focus.dialogKey,
          dialogId: focus.dialogKey === null ? null : `${doc}:${focus.dialogKey}`,
        });
      }
    }
    return events;
  }

  return {
    type: 'focus_trap',

    async observe(ctx) {
      const stepN = ctx.current.step.n;
      snapshots.set(stepN, await ctx.inspect<Snapshot>(READ_FOCUS_SCRIPT));

      // The episode: the events at the end of the history that stayed in one dialog.
      const events = timeline(ctx, stepN);
      const last = events[events.length - 1];
      if (!last || last.dialogId === null || last.dialogKey === null) return [];
      let start = events.length - 1;
      while (start > 0 && events[start - 1]!.dialogId === last.dialogId) start -= 1;
      const episode = events.slice(start);

      const findingKey = `focus-trap:${last.dialogId}`;
      if (reported.has(findingKey)) return [];

      // What Tab and Shift+Tab reached, and the first press of each that landed on a reached control.
      const reached = new Set<string>();
      const tab: KeyRun = { presses: 0, order: [], repeat: null };
      const shift: KeyRun = { presses: 0, order: [], repeat: null };
      let escapeStep: number | null = null;
      for (const event of episode) {
        if (event.kind === 'key') {
          const run = event.key === 'Tab' ? tab : event.key === 'Shift+Tab' ? shift : null;
          if (run && event.focusKey !== null) {
            run.presses += 1;
            if (reached.has(event.focusKey)) run.repeat ??= { step: event.step, key: event.focusKey };
            if (!run.order.includes(event.focusKey)) run.order.push(event.focusKey);
          }
          if (event.key === 'Escape') escapeStep ??= event.step;
        }
        if (event.focusKey !== null) reached.add(event.focusKey);
      }
      if (!tab.repeat || !shift.repeat || escapeStep === null) return [];

      // (c) and (d): the dialog as it is now.
      const describe = [...new Set([...tab.order, ...shift.order, tab.repeat.key, shift.repeat.key])];
      const arg: PageArg = { dialogKey: last.dialogKey, reached: [...reached], describe };
      const report = await ctx.inspect<PageReport>(READ_DIALOG_SCRIPT, arg);
      if (!report.open || !report.focusInside || report.unreached.length === 0) return [];

      const byKey = new Map(report.described.map((d) => [d.key, d]));
      const named = (key: string): string => control(byKey.get(key) ?? { key, name: null, role: 'control' });
      const keyEvidence = (label: string, run: KeyRun & { repeat: { step: number; key: string } }): string =>
        `${label} (${run.presses} ${plural(run.presses, 'press', 'presses')}) reached ${run.order.length} ` +
        `${plural(run.order.length, 'control', 'controls')}, in order: ${run.order.map(named).join(', ')}. ` +
        `A ${label} press landed on ${named(run.repeat.key)}, which it had already reached (Step ${run.repeat.step}).`;

      const dialog = report.dialogName ? `the dialog "${report.dialogName}"` : 'the dialog';
      const never = report.unreached.map(controlWithReason);
      const evidence = [
        `Keyboard focus stayed inside ${dialog}.`,
        keyEvidence('Tab', { ...tab, repeat: tab.repeat }),
        keyEvidence('Shift+Tab', { ...shift, repeat: shift.repeat }),
        `${report.unreached.length} visible, enabled ${plural(report.unreached.length, 'control was', 'controls were')} never reached: ${joinList(never)}.`,
        `Escape was pressed at Step ${escapeStep} and the dialog stayed open, with focus still inside it.`,
      ].join(' ');

      reported.add(findingKey);
      const problem: DetectedProblem = {
        key: findingKey,
        stepN: Math.min(Math.max(tab.repeat.step, shift.repeat.step, escapeStep), stepN),
        title: 'Keyboard focus is trapped in a dialog',
        evidence,
        screenshot: 'step',
      };
      return [problem];
    },
  };
}
