import { describe, expect, it } from 'vitest';
import type { Heard, HeardNode } from '../src/ghosts/listener/ax.ts';
import {
  describeNode,
  focusedNode,
  readingNode,
  roleWords,
  speak,
  stateWords,
} from '../src/ghosts/listener/speech.ts';

/**
 * Unit tests for the words The Listener hears after an action.
 * **Validates: Requirements 8.9**
 */

function node(ref: string, role: string, name = '', extra: Partial<HeardNode> = {}): HeardNode {
  return { ref, role, name, description: '', value: '', states: {}, depth: 1, ...extra };
}

function heard(nodes: HeardNode[], extra: Partial<Heard> = {}): Heard {
  return {
    title: 'T',
    path: '/',
    nodes,
    focus: null,
    dialog: null,
    region: null,
    readingPosition: null,
    announcements: [],
    ...extra,
  };
}

const payButton = node('ax-1', 'button', 'Pay this bill');
const unnamedButton = node('ax-2', 'button');
const cardNumber = node('ax-3', 'textbox', 'Card Number', { states: { required: true } });
const protect = node('ax-4', 'checkbox', 'Payment protection for ₹99 Get a refund if your payment fails due to a technical issue.', {
  states: { checked: true },
});
const learnMore = node('ax-5', 'button', 'Learn more', { states: { expanded: false } });

describe('roleWords', () => {
  it('maps the roles in the design to their words', () => {
    expect(roleWords(node('a', 'button'))).toBe('button');
    expect(roleWords(node('a', 'link'))).toBe('link');
    expect(roleWords(node('a', 'textbox'))).toBe('edit text');
    expect(roleWords(node('a', 'checkbox'))).toBe('checkbox');
    expect(roleWords(node('a', 'dialog'))).toBe('dialog');
    expect(roleWords(node('a', 'RootWebArea'))).toBe('document');
  });

  it('says the heading level', () => {
    expect(roleWords(node('a', 'heading', 'Title', { level: 1 }))).toBe('heading level 1');
    expect(roleWords(node('a', 'heading', 'Sub', { level: 3 }))).toBe('heading level 3');
    expect(roleWords(node('a', 'heading', 'No level'))).toBe('heading');
  });

  it('speaks landmarks and other roles as their role name', () => {
    for (const role of ['banner', 'main', 'contentinfo', 'navigation', 'region', 'form', 'search', 'complementary', 'combobox', 'listitem']) {
      expect(roleWords(node('a', role))).toBe(role);
    }
  });
});

describe('stateWords', () => {
  it('says checked and not checked', () => {
    expect(stateWords(node('a', 'checkbox', 'x', { states: { checked: true } }))).toEqual(['checked']);
    expect(stateWords(node('a', 'checkbox', 'x', { states: { checked: false } }))).toEqual(['not checked']);
    expect(stateWords(node('a', 'checkbox', 'x', { states: { checked: 'mixed' } }))).toEqual(['partially checked']);
  });

  it('says expanded and collapsed', () => {
    expect(stateWords(node('a', 'button', 'x', { states: { expanded: true } }))).toEqual(['expanded']);
    expect(stateWords(node('a', 'button', 'x', { states: { expanded: false } }))).toEqual(['collapsed']);
  });

  it('says required, invalid entry, unavailable and busy, in a fixed order', () => {
    const all = node('a', 'textbox', 'x', {
      states: { busy: true, disabled: true, invalid: true, required: true, expanded: true, checked: false, focused: true, modal: true },
    });
    expect(stateWords(all)).toEqual(['not checked', 'expanded', 'required', 'invalid entry', 'unavailable', 'busy']);
  });

  it('says nothing for states it has no words for', () => {
    expect(stateWords(node('a', 'button', 'x', { states: { focused: true, modal: true } }))).toEqual([]);
  });
});

describe('describeNode', () => {
  it('speaks name, role words and states', () => {
    expect(describeNode(payButton)).toBe('Pay this bill, button');
    expect(describeNode(cardNumber)).toBe('Card Number, edit text, required');
    expect(describeNode(learnMore)).toBe('Learn more, button, collapsed');
  });

  it('speaks a heading with its level', () => {
    expect(describeNode(node('a', 'heading', 'Your Electricity Bill', { level: 1 }))).toBe('Your Electricity Bill, heading level 1');
  });

  it('leaves out an empty name', () => {
    expect(describeNode(unnamedButton)).toBe('button');
    expect(describeNode(node('a', 'checkbox', '', { states: { checked: true } }))).toBe('checkbox, checked');
    expect(describeNode(node('a', 'button', '   '))).toBe('button');
  });
});

describe('speak', () => {
  it('speaks the focused node: "Pay this bill, button"', () => {
    const after = heard([payButton, unnamedButton], { focus: 'ax-1' });
    expect(speak({ before: heard([payButton, unnamedButton]), after })).toBe('Pay this bill, button');
  });

  it('speaks an unnamed button as just "button"', () => {
    const after = heard([payButton, unnamedButton], { focus: 'ax-2' });
    expect(speak({ before: heard([payButton, unnamedButton], { focus: 'ax-1' }), after })).toBe('button');
  });

  it('announces a named region first: "Payment Information, region. Card Number, edit text, required"', () => {
    const before = heard([payButton, cardNumber], { focus: 'ax-1' });
    const after = heard([payButton, cardNumber], {
      focus: 'ax-3',
      region: { ref: 'ax-9', role: 'region', name: 'Payment Information' },
    });
    expect(speak({ before, after })).toBe('Payment Information, region. Card Number, edit text, required');
  });

  it('announces dialog entry, then the focused checkbox with its state', () => {
    const before = heard([payButton, protect], { focus: 'ax-1' });
    const after = heard([payButton, protect], {
      focus: 'ax-4',
      dialog: { ref: 'ax-8', name: 'Protect your payment' },
    });
    expect(speak({ before, after })).toBe(
      'Protect your payment, dialog. Payment protection for ₹99 Get a refund if your payment fails due to a technical issue., checkbox, checked',
    );
  });

  it('says only "dialog" for an unnamed dialog', () => {
    const after = heard([protect], { focus: 'ax-4', dialog: { ref: 'ax-8', name: '' } });
    expect(speak({ before: null, after })).toBe('dialog. Payment protection for ₹99 Get a refund if your payment fails due to a technical issue., checkbox, checked');
  });

  it('says nothing about a landmark without a name', () => {
    const after = heard([payButton], { focus: 'ax-1', region: { ref: 'ax-7', role: 'main', name: '' } });
    expect(speak({ before: heard([payButton]), after })).toBe('Pay this bill, button');
  });

  it('does not repeat the dialog or region while focus stays inside it', () => {
    const dialog = { ref: 'ax-8', name: 'Protect your payment' };
    const region = { ref: 'ax-9', role: 'region', name: 'Payment Information' };
    const before = heard([protect, learnMore], { focus: 'ax-4', dialog, region });
    const after = heard([protect, learnMore], { focus: 'ax-5', dialog, region });
    expect(speak({ before, after })).toBe('Learn more, button, collapsed');
  });

  it('announces the dialog again when focus comes back into it', () => {
    const dialog = { ref: 'ax-8', name: 'Protect your payment' };
    const outside = heard([payButton, protect], { focus: 'ax-1' });
    const inside = heard([payButton, protect], { focus: 'ax-4', dialog });
    expect(speak({ before: outside, after: inside })).toMatch(/^Protect your payment, dialog\. /);
    expect(speak({ before: inside, after: outside })).toBe('Pay this bill, button');
  });

  it('does not announce a dialog or region twice when it is the spoken node', () => {
    const dialogNode = node('ax-8', 'dialog', 'Protect your payment');
    const after = heard([dialogNode], { focus: 'ax-8', dialog: { ref: 'ax-8', name: 'Protect your payment' } });
    expect(speak({ before: null, after })).toBe('Protect your payment, dialog');
  });

  it('says the typed text and not the node', () => {
    const page = heard([cardNumber], { focus: 'ax-3' });
    expect(speak({ before: page, after: page, typed: '4111111111111111' })).toBe('4111111111111111');
  });

  it('says only the new state after a key that changes state in place', () => {
    const before = heard([protect], { focus: 'ax-4' });
    const unticked = node('ax-4', 'checkbox', protect.name, { states: { checked: false } });
    const after = heard([unticked], { focus: 'ax-4' });
    expect(speak({ before, after, stateChange: true })).toBe('not checked');
  });

  it('speaks the reading-position node on a jump, not the focused node', () => {
    const h1 = node('ax-10', 'heading', 'Your Electricity Bill', { level: 1 });
    const page = heard([payButton, h1], { focus: 'ax-1', readingPosition: 'ax-10' });
    expect(speak({ before: heard([payButton, h1], { focus: 'ax-1' }), after: page, spokenNode: readingNode(page) })).toBe(
      'Your Electricity Bill, heading level 1',
    );
  });

  it('speaks a landmark reached by a jump without announcing it a second time', () => {
    const section = node('ax-9', 'region', 'Payment Information');
    const page = heard([section, cardNumber], { focus: 'ax-1', readingPosition: 'ax-9' });
    expect(speak({ before: heard([section, cardNumber], { focus: 'ax-1' }), after: page, spokenNode: section })).toBe(
      'Payment Information, region',
    );
  });

  it('appends a role=alert announcement after the node', () => {
    const after = heard([payButton], { focus: 'ax-1', announcements: ['Card number is required'] });
    expect(speak({ before: heard([payButton]), after })).toBe('Pay this bill, button. Card number is required');
  });

  it('speaks every announcement in order, after typed text and entry', () => {
    const page = heard([cardNumber], {
      focus: 'ax-3',
      region: { ref: 'ax-9', role: 'region', name: 'Payment Information' },
      announcements: ['First', 'Second', 'Third'],
    });
    expect(speak({ before: null, after: page })).toBe('Payment Information, region. Card Number, edit text, required. First. Second. Third');
    const typing = heard([cardNumber], { focus: 'ax-3', announcements: ['One', 'Two'] });
    expect(speak({ before: typing, after: typing, typed: '41' })).toBe('41. One. Two');
  });

  it('speaks announcements even when nothing has focus', () => {
    expect(speak({ before: null, after: heard([], { announcements: ['Saved'] }) })).toBe('Saved');
    expect(speak({ before: null, after: heard([]) })).toBe('');
  });

  it('speaks the document as the first thing heard', () => {
    const root = node('ax-0', 'RootWebArea', 'Lantern Bills - Pay Your Electricity Bill', { depth: 0 });
    const after = heard([root], { focus: 'ax-0' });
    expect(speak({ before: null, after })).toBe('Lantern Bills - Pay Your Electricity Bill, document');
  });
});

describe('focusedNode and readingNode', () => {
  it('find nodes by ref', () => {
    const page = heard([payButton, unnamedButton], { focus: 'ax-2', readingPosition: 'ax-1' });
    expect(focusedNode(page)).toBe(unnamedButton);
    expect(readingNode(page)).toBe(payButton);
    expect(focusedNode(heard([payButton]))).toBeUndefined();
    expect(readingNode(heard([payButton], { readingPosition: 'ax-404' }))).toBeUndefined();
  });
});
