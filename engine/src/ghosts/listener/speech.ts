/*
 * What The Listener "hears" after an action: the change caused by the action, turned into one string
 * the way a screen reader would say it (Requirement 8.9).
 *
 * Everything here is a pure function of `Heard` values (see `ax.ts`). Nothing reads the page.
 *
 * The text of one action is made of these parts, joined with ". ":
 *   1. Entry:        focus is in a dialog or named landmark it was not in before.
 *                    `<name>, dialog` or `<name>, region`.
 *   2. Node:         the spoken node. `<name>, <role words>[, <states>]`.
 *   3. Typing:       the typed text (replaces part 2).
 *   4. State change: a key left focus in place but changed its state, for example Space on a
 *                    checkbox: the new state words, such as `not checked` (replaces part 2).
 *   5. Announcements: every Live_Announcement, in order.
 *
 * Examples:
 *   Pay this bill, button
 *   button
 *   Payment Information, region. Card Number, edit text, required
 *   Protect your payment, dialog. Payment protection for ₹99 Get a refund if your payment fails due to a technical issue., checkbox, checked
 */

import type { Heard, HeardNode } from './ax.ts';

/** Role words for roles that differ from the role name. Other roles are spoken as their role name. */
const ROLE_WORDS: Readonly<Record<string, string>> = {
  button: 'button',
  link: 'link',
  textbox: 'edit text',
  checkbox: 'checkbox',
  dialog: 'dialog',
  RootWebArea: 'document',
};

/**
 * The words a screen reader says for a node's role.
 *
 * `button` → "button", `link` → "link", `textbox` → "edit text", `checkbox` → "checkbox",
 * `dialog` → "dialog", `RootWebArea` → "document", `heading` → "heading level N" (just "heading"
 * when the level is unknown). Landmarks and every other role are spoken as their role name.
 */
export function roleWords(node: HeardNode): string {
  if (node.role === 'heading') {
    return node.level !== undefined ? `heading level ${node.level}` : 'heading';
  }
  return ROLE_WORDS[node.role] ?? node.role;
}

/**
 * The state words for a node, in this fixed order: "checked" / "not checked" (a mixed checkbox is
 * "partially checked"), "expanded" / "collapsed", "required", "invalid entry", "unavailable"
 * (disabled), "busy". A node with none of these states gives an empty list.
 */
export function stateWords(node: HeardNode): string[] {
  const { states } = node;
  const words: string[] = [];
  if (states.checked === true) words.push('checked');
  else if (states.checked === false) words.push('not checked');
  else if (states.checked === 'mixed') words.push('partially checked');
  if (states.expanded === true) words.push('expanded');
  else if (states.expanded === false) words.push('collapsed');
  if (states.required === true) words.push('required');
  if (states.invalid === true) words.push('invalid entry');
  if (states.disabled === true) words.push('unavailable');
  if (states.busy === true) words.push('busy');
  return words;
}

/**
 * What a screen reader says for one node: `<name>, <role words>[, <states>]`.
 * A node with an empty name is just `<role words>[, <states>]`, for example `button`.
 * Returns an empty string only when the node has no name, no role and no states.
 */
export function describeNode(node: HeardNode): string {
  const name = node.name.trim();
  const parts = [name, roleWords(node), ...stateWords(node)].filter((part) => part !== '');
  return parts.join(', ');
}

/** The node with the given ref, or `undefined`. */
export function nodeByRef(heard: Heard, ref: string | null): HeardNode | undefined {
  if (ref === null) return undefined;
  return heard.nodes.find((node) => node.ref === ref);
}

/** The focused node of a `Heard`, or `undefined` when nothing has focus. */
export function focusedNode(heard: Heard): HeardNode | undefined {
  return nodeByRef(heard, heard.focus);
}

/** The node at the reading position of a `Heard` (moved by heading and landmark jumps), or `undefined`. */
export function readingNode(heard: Heard): HeardNode | undefined {
  return nodeByRef(heard, heard.readingPosition);
}

/** What to say for one action. */
export interface SpeakInput {
  /** The Perception before the action, or `null` before the first one (everything is new then). */
  before: Heard | null;
  /** The Perception after the action and its Settle. Its `announcements` are spoken last. */
  after: Heard;
  /**
   * The node to speak. Defaults to the focused node of `after`. Heading and landmark jumps pass the
   * node at the reading position (`readingNode(after)`), because focus does not move.
   */
  spokenNode?: HeardNode;
  /** Text the ghost typed. It is spoken instead of the node, because focus did not move. */
  typed?: string;
  /**
   * `true` when a key left focus in place but changed its state (Space on a checkbox). The new state
   * words of the spoken node are spoken instead of the whole node, for example `not checked`.
   */
  stateChange?: boolean;
}

/**
 * Turns the change caused by an action into one string, parts joined with ". ".
 *
 * - Entry: when `after.dialog` differs from `before.dialog` the text starts with `<name>, dialog`;
 *   when `after.region` differs from `before.region` and the region has a name, it adds
 *   `<name>, region`. An unnamed landmark (a plain `<main>`, say) is not announced, and a dialog or
 *   region that is the spoken node itself is not announced twice. Staying in the same dialog or
 *   region says nothing.
 * - Then the node (`describeNode`), unless text was typed (the typed text) or the action changed a
 *   state in place (only the state words).
 * - Then every Live_Announcement of `after`, in order.
 *
 * Empty parts are left out. The result is an empty string when nothing was heard.
 */
export function speak(input: SpeakInput): string {
  const { before, after, typed, stateChange } = input;
  const node = input.spokenNode ?? focusedNode(after);
  const parts: string[] = [];

  // 1. Entry into a dialog or a named landmark region.
  if (after.dialog !== null && after.dialog.ref !== before?.dialog?.ref && after.dialog.ref !== node?.ref) {
    const name = after.dialog.name.trim();
    parts.push(name === '' ? 'dialog' : `${name}, dialog`);
  }
  if (after.region !== null && after.region.ref !== before?.region?.ref && after.region.ref !== node?.ref) {
    const name = after.region.name.trim();
    if (name !== '') parts.push(`${name}, region`);
  }

  // 2 to 4. The typed text, the new state, or the node.
  if (typed !== undefined) {
    parts.push(typed);
  } else if (node !== undefined) {
    parts.push(stateChange === true ? stateWords(node).join(', ') : describeNode(node));
  }

  // 5. Live_Announcements, in order.
  parts.push(...after.announcements);

  return parts.filter((part) => part.trim() !== '').join('. ');
}
