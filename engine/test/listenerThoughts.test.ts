import { describe, expect, it } from 'vitest';
import type { Intention } from '../src/missions/loadMission.ts';
import type { HeardNode } from '../src/ghosts/listener/ax.ts';
import {
  MAX_LISTED,
  dialogSearchThought,
  heardAs,
  joinList,
  lastResortEnterThought,
  lastResortGoThought,
  matchActivateThought,
  matchTypeThought,
  namedList,
  noMatchThought,
  orientationThought,
  pageSearchThought,
  roundCompleteThought,
  shorten,
  stepLimitThought,
  trappedThought,
  type ListenerMemory,
  type RememberedControl,
} from '../src/ghosts/listener/thoughts.ts';
import { heard, LB_CHECK_NAME, type NodeSpec } from './helpers/heard.ts';

/**
 * The Listener's thoughts: every decision thought and the three Give_Up_Thoughts, built from hand-made
 * values. The Give_Up_Thoughts get nothing but a `ListenerMemory`.
 * **Validates: Requirements 6.8, 9.8, 11.4**
 */

// -- Builders for test values ---------------------------------------------------------------------------------

function node(spec: NodeSpec, focused = false): HeardNode {
  const scene = heard([spec], { focus: focused ? spec.ref : null });
  const first = scene.nodes[0];
  if (first === undefined) throw new Error('no node');
  return first;
}

const PAY = node({ ref: 'ax-4', role: 'button', name: 'Pay this bill' });
const CARD = node({ ref: 'ax-10', role: 'textbox', name: 'Card Number', states: { required: true } });
const UNNAMED = node({ ref: 'ax-14', role: 'button' });
const CHECK = node({ ref: 'ax-22', role: 'checkbox', name: LB_CHECK_NAME, states: { checked: true } });
const ROOT = node({ ref: 'ax-1', role: 'RootWebArea', name: 'Lantern Bills' });

function control(ref: string, role: string, name: string): RememberedControl {
  return { ref, role, name };
}

const CHECK_C = control('ax-22', 'checkbox', LB_CHECK_NAME);
const LEARN_C = control('ax-23', 'button', 'Learn more');
const CONTINUE_C = control('ax-24', 'button', 'Continue');
const CLOSE_C = control('ax-21', 'button', 'Close dialog');
const PAY_C = control('ax-4', 'button', 'Pay this bill');
const CONTINUE_NODE = node({ ref: 'ax-24', role: 'button', name: 'Continue' });

function intention(kind: Intention['target']['kind'], id = 'confirm'): Intention {
  return {
    id,
    do: 'activate',
    thought: 'I need to confirm the payment.',
    target: { kind, en: ['^confirm$'] },
    doneWhen: 'success',
  };
}

function memoryOf(over: Partial<ListenerMemory> = {}): ListenerMemory {
  return {
    actions: 0,
    seeking: null,
    goal: "Pay this month's electricity bill",
    focusedRefs: new Set(['ax-22', 'ax-23']),
    reached: [],
    scope: 'page',
    dialogName: null,
    tabReached: [],
    shiftReached: [],
    escapePressed: false,
    dialogUnreached: [],
    pageUnreached: [],
    ...over,
  };
}

/** The Lantern Bills trap as the Mind remembers it after the Escape press. */
function trapMemory(over: Partial<ListenerMemory> = {}): ListenerMemory {
  return memoryOf({
    seeking: intention('button'),
    scope: 'dialog',
    dialogName: 'Protect your payment',
    reached: [CHECK_C, LEARN_C],
    tabReached: [CHECK_C, LEARN_C],
    shiftReached: [LEARN_C, CHECK_C],
    escapePressed: true,
    dialogUnreached: [CONTINUE_C, CLOSE_C],
    ...over,
  });
}

function manyButtons(count: number): RememberedControl[] {
  return Array.from({ length: count }, (_, i) => control(`ax-${100 + i}`, 'button', `Button ${i + 1}`));
}

// -- Helpers ------------------------------------------------------------------------------------------------------

describe('thought helpers', () => {
  it('shortens long names at a word boundary and keeps short ones', () => {
    expect(shorten(LB_CHECK_NAME)).toBe('Payment protection for ₹99…');
    expect(shorten('Learn more')).toBe('Learn more');
    expect(shorten('  Two   spaces  ')).toBe('Two spaces');
    expect(shorten('Supercalifragilisticexpialidocious name')).toBe('Supercalifragilisticexpialid…');
  });

  it('says a node the way a screen reader does, and nothing for no focus or the document', () => {
    expect(heardAs(PAY)).toBe("'Pay this bill, button'");
    expect(heardAs(UNNAMED)).toBe("'button'");
    expect(heardAs(CARD)).toBe("'Card Number, edit text, required'");
    expect(heardAs(CHECK)).toBe("'Payment protection for ₹99…, checkbox, checked'");
    expect(heardAs(undefined)).toBeNull();
    expect(heardAs(ROOT)).toBeNull();
  });

  it('joins lists and shortens long ones with "and N more"', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['a'])).toBe('a');
    expect(joinList(['a', 'b'])).toBe('a and b');
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c');
    const items = Array.from({ length: MAX_LISTED }, (_, i) => `n${i}`);
    expect(joinList(items)).toBe('n0, n1, n2, n3 and n4');
    expect(joinList([...items, 'x'])).toBe('n0, n1, n2, n3, n4 and 1 more');
    expect(joinList([...items, 'x', 'y', 'z'])).toBe('n0, n1, n2, n3, n4 and 3 more');
  });

  it('lists named controls once each and skips the ones with no name', () => {
    const names = namedList([LEARN_C, control('ax-1', 'button', ''), LEARN_C, control('ax-2', 'button', 'Learn more'), CHECK_C]);
    expect(names).toEqual(["'Learn more'", "'Payment protection for ₹99…'"]);
  });
});

// -- Decision thoughts -------------------------------------------------------------------------------------------

describe('decision thoughts', () => {
  const LEAD = 'I want to pay this bill. ';

  it('orients on the first page and on a page change', () => {
    expect(orientationThought(heard([], { title: 'Lantern Bills - Pay Your Electricity Bill' }), true)).toBe(
      "I've just arrived on 'Lantern Bills - Pay Your Electricity Bill'. Before I look for anything, I'll jump to the next heading to hear where I am.",
    );
    expect(orientationThought(heard([], { title: '  ' }), true)).toBe(
      "I've just arrived on the page. Before I look for anything, I'll jump to the next heading to hear where I am.",
    );
    expect(orientationThought(heard([], { title: 'Next' }), false)).toBe(
      "The page has changed, so I'll jump to the next heading to hear where I am before I look for anything.",
    );
  });

  it('names what it heard and why it presses a key on a match', () => {
    expect(matchActivateThought('', PAY, 'Enter')).toBe("I heard 'Pay this bill, button'. That's what I want, so I'll press Enter.");
    expect(matchActivateThought(LEAD, CHECK, 'Space')).toBe(
      "I want to pay this bill. I heard 'Payment protection for ₹99…, checkbox, checked'. That's what I want, so I'll press Space.",
    );
  });

  it('names the field and the text it types', () => {
    expect(matchTypeThought('', CARD, '4111111111111111')).toBe(
      `I heard 'Card Number, edit text, required'. That's the field I want, so I'll type "4111111111111111".`,
    );
  });

  it('explains each page search jump', () => {
    const base = { lead: '', node: PAY, landed: true, used: false };
    expect(pageSearchThought({ ...base, mode: 'button', landed: false, node: undefined })).toBe(
      "I'm not on anything I can use yet, so I'll jump to the next button.",
    );
    expect(pageSearchThought({ ...base, mode: 'field', landed: false })).toBe(
      "I'm on 'Pay this bill, button', which isn't what I'm after, so I'll jump to the next form field.",
    );
    expect(pageSearchThought({ ...base, mode: 'button' })).toBe(
      "I heard 'Pay this bill, button'. That isn't what I'm looking for. I'll jump to the next button again.",
    );
    expect(pageSearchThought({ ...base, mode: 'tab', used: true })).toBe(
      "I heard 'Pay this bill, button'. I've already used that one. I'll press Tab again.",
    );
    expect(pageSearchThought({ ...base, mode: 'button', node: UNNAMED })).toBe(
      "I heard 'button'. It has no name, so I can't tell what it does. I'll jump to the next button again.",
    );
    expect(pageSearchThought({ ...base, mode: 'button', node: ROOT })).toBe(
      "I'm on the page itself, not on a control, so I'll jump to the next button again.",
    );
  });

  it('explains the Tab and Shift+Tab presses in a dialog', () => {
    const a = { lead: '', dialogName: 'Protect your payment', node: CHECK, key: 'Tab' as const, first: true, used: false };
    expect(dialogSearchThought(a)).toBe(
      "I'm inside the 'Protect your payment' dialog on 'Payment protection for ₹99…, checkbox, checked', which isn't what I'm after. I'll press Tab and listen to where I land.",
    );
    expect(dialogSearchThought({ ...a, node: undefined })).toBe(
      "I'm inside the 'Protect your payment' dialog. I'll press Tab and listen to where I land.",
    );
    expect(dialogSearchThought({ ...a, dialogName: '  ' })).toContain("I'm inside a dialog on ");
    expect(dialogSearchThought({ ...a, key: 'Shift+Tab' })).toBe(
      "I'll go the other way round the 'Protect your payment' dialog, pressing Shift+Tab and listening to where I land.",
    );
    expect(dialogSearchThought({ ...a, first: false, node: CONTINUE_NODE })).toBe(
      "I heard 'Continue, button'. That isn't what I'm after. I'll press Tab again.",
    );
    expect(dialogSearchThought({ ...a, first: false, used: true, node: CONTINUE_NODE })).toContain("I've already used that one.");
    expect(dialogSearchThought({ ...a, first: false, node: undefined })).toBe("I'm not on a control. I'll press Tab again.");
  });

  it('says a round is complete, and before Escape names the controls it hears but cannot reach', () => {
    const a = { lead: '', dialogName: 'Protect your payment', node: CHECK, key: 'Tab' as const, next: 'Shift+Tab' as const };
    expect(roundCompleteThought(a)).toBe(
      "Tab has brought me back to 'Payment protection for ₹99…, checkbox, checked', where I had already been, so I have been all the way round. I'll go the other way and press Shift+Tab.",
    );
    expect(roundCompleteThought({ ...a, node: undefined })).toContain('back to somewhere I had already been');

    const escape = { ...a, key: 'Shift+Tab' as const, next: 'Escape' as const };
    expect(roundCompleteThought({ ...escape, unreached: [CONTINUE_C, CLOSE_C] })).toBe(
      "Shift+Tab has brought me back to 'Payment protection for ₹99…, checkbox, checked', where I had already been, so I have been all the way round. I can hear 'Continue' and 'Close dialog' in the 'Protect your payment' dialog, but Shift+Tab never lands on them. I'll press Escape once to see if the dialog closes.",
    );
    expect(roundCompleteThought({ ...escape, unreached: [CLOSE_C], dialogName: '' })).toContain(
      "I can hear 'Close dialog' in the dialog, but Shift+Tab never lands on it.",
    );
    expect(roundCompleteThought({ ...escape, unreached: [] })).not.toContain('I can hear');
    // Before Shift+Tab the Mind has not tried the other direction yet, so it does not list anything.
    expect(roundCompleteThought({ ...a, unreached: [CLOSE_C] })).not.toContain('I can hear');
  });

  it('explains the last resort on buttons with no name', () => {
    expect(lastResortGoThought({ lead: '', remaining: 2, tried: 0 })).toBe(
      "I've been all the way round and nothing else fits. I heard 2 buttons with no name, so I'll go back to the first one and try it.",
    );
    expect(lastResortGoThought({ lead: '', remaining: 1, tried: 1 })).toBe(
      "That didn't get me anywhere. I still have 1 button with no name to try, so I'll move on to the next one.",
    );
    expect(lastResortEnterThought({ lead: '', node: UNNAMED, first: true })).toBe(
      "I heard 'button'. This button has no name. I've been all the way round and nothing else fits, so I'll try it and hope it's the one I need.",
    );
    expect(lastResortEnterThought({ lead: '', node: UNNAMED, first: false })).toContain('no name either');
  });

  it('puts the Intention\'s own thought in front when there is one', () => {
    expect(matchActivateThought(LEAD, PAY, 'Enter').startsWith(LEAD)).toBe(true);
    expect(pageSearchThought({ lead: LEAD, mode: 'tab', node: PAY, landed: false, used: false }).startsWith(LEAD)).toBe(true);
  });
});

// -- Give_Up_Thoughts --------------------------------------------------------------------------------------------

describe('trapped Give_Up_Thought', () => {
  it('matches the design example, with the unreached buttons in the order the memory holds them', () => {
    expect(trappedThought(trapMemory())).toBe(
      "I'm stuck in the 'Protect your payment' dialog. Tab and Shift+Tab only move between 'Payment protection for ₹99…' and 'Learn more', and Escape does nothing. I can hear 'Continue' and 'Close dialog' buttons, but I can't reach them with the keyboard, so I'm giving up.",
    );
  });

  it('lists the unreached buttons in document order when the memory holds them that way', () => {
    expect(trappedThought(trapMemory({ dialogUnreached: [CLOSE_C, CONTINUE_C] }))).toContain(
      "I can hear 'Close dialog' and 'Continue' buttons, but",
    );
  });

  it('has a sentence when nothing was heard at all', () => {
    expect(trappedThought(memoryOf())).toBe("I'm stuck in a dialog. I can't get out with the keyboard, so I'm giving up.");
  });

  it('says a dialog with no name is "a dialog", also when the name is blank', () => {
    expect(trappedThought(trapMemory({ dialogName: '   ' }))).toMatch(/^I'm stuck in a dialog\. /);
    expect(trappedThought(trapMemory({ dialogName: null }))).toMatch(/^I'm stuck in a dialog\. /);
  });

  it('has no list of controls to reach when every control was reached', () => {
    const text = trappedThought(trapMemory({ dialogUnreached: [] }));
    expect(text).toBe(
      "I'm stuck in the 'Protect your payment' dialog. Tab and Shift+Tab only move between 'Payment protection for ₹99…' and 'Learn more', and Escape does nothing. I can't get out with the keyboard, so I'm giving up.",
    );
  });

  it('uses the singular for one reached control and one unreached control', () => {
    const text = trappedThought(trapMemory({ tabReached: [LEARN_C], shiftReached: [LEARN_C], dialogUnreached: [CLOSE_C] }));
    expect(text).toContain("Tab and Shift+Tab only land on 'Learn more', and Escape does nothing.");
    expect(text).toContain("I can hear 'Close dialog' button, but I can't reach it with the keyboard");
  });

  it('does not claim Escape did nothing when Escape was not pressed, and covers nothing reached', () => {
    expect(trappedThought(trapMemory({ escapePressed: false }))).not.toContain('Escape');
    expect(trappedThought(trapMemory({ tabReached: [], shiftReached: [] }))).toContain("dialog. Escape does nothing. I can hear");
    expect(trappedThought(trapMemory({ tabReached: [], shiftReached: [], escapePressed: false }))).toMatch(
      /dialog\. I can hear /,
    );
  });

  it('calls a mix of controls "controls" and leaves out controls with no name', () => {
    const text = trappedThought(
      trapMemory({ dialogUnreached: [CLOSE_C, control('ax-30', 'link', 'Terms'), control('ax-31', 'button', '')] }),
    );
    expect(text).toContain("I can hear 'Close dialog' and 'Terms' controls, but I can't reach them");
  });

  it('shortens a long list with "and N more"', () => {
    const text = trappedThought(trapMemory({ dialogUnreached: manyButtons(8) }));
    expect(text).toContain(
      "I can hear 'Button 1', 'Button 2', 'Button 3', 'Button 4', 'Button 5' and 3 more buttons, but I can't reach them",
    );
    expect(text).not.toContain('Button 6');
  });
});

describe('no_match Give_Up_Thought', () => {
  const onPage = (over: Partial<ListenerMemory> = {}): ListenerMemory =>
    memoryOf({ seeking: intention('button'), reached: [PAY_C, control('ax-14', 'button', '')], ...over });

  it('names what it went through on the page, including buttons with no name', () => {
    expect(noMatchThought(onPage())).toBe(
      "I went through every button I could reach on this page ('Pay this bill' and 1 with no name) and none of them sounded like what I was looking for, so I'm giving up.",
    );
  });

  it('uses the kind of control it was looking for', () => {
    expect(noMatchThought(onPage({ seeking: intention('field') }))).toContain('every form field I could reach');
    expect(noMatchThought(onPage({ seeking: intention('link') }))).toContain('every link I could reach');
    expect(noMatchThought(onPage({ seeking: intention('checkbox') }))).toContain('every checkbox I could reach');
  });

  it('says where it looked when it was in a dialog, with or without a name', () => {
    const inDialog = onPage({ scope: 'dialog', dialogName: 'Protect your payment', reached: [CHECK_C, LEARN_C] });
    expect(noMatchThought(inDialog)).toBe(
      "I went through every button I could reach in the 'Protect your payment' dialog ('Payment protection for ₹99…' and 'Learn more') and none of them sounded like what I was looking for, so I'm giving up.",
    );
    expect(noMatchThought({ ...inDialog, dialogName: null })).toContain('reach in the dialog (');
    expect(noMatchThought({ ...inDialog, dialogName: '' })).toContain('reach in the dialog (');
  });

  it('says so when it never landed on a control of that kind', () => {
    expect(noMatchThought(onPage({ reached: [] }))).toBe("I couldn't land on any button on this page, so I'm giving up.");
    expect(noMatchThought(onPage({ reached: [], seeking: intention('field') }))).toBe(
      "I couldn't land on any form field on this page, so I'm giving up.",
    );
  });

  it('leaves out the list when every control it reached has no name', () => {
    const text = noMatchThought(onPage({ reached: [control('ax-1', 'button', ''), control('ax-2', 'button', '')] }));
    expect(text).toContain('(2 with no name)');
  });

  it('mentions controls of the right kind that it hears but cannot reach, and no others', () => {
    const text = noMatchThought(
      onPage({
        pageUnreached: [control('ax-40', 'button', 'Hidden pay'), control('ax-41', 'link', 'Terms'), CONTINUE_C],
      }),
    );
    expect(text).toContain("I can hear 'Hidden pay' and 'Continue' on this page, but my keyboard never lands on them.");
    expect(text).not.toContain('Terms');
    const dialogText = noMatchThought(
      onPage({ scope: 'dialog', dialogName: 'Protect your payment', dialogUnreached: [CLOSE_C], pageUnreached: [CONTINUE_C] }),
    );
    expect(dialogText).toContain("I can hear 'Close dialog' in the 'Protect your payment' dialog, but my keyboard never lands on it.");
    expect(dialogText).not.toContain('Continue');
  });

  it('shortens a long list of controls it went through', () => {
    const text = noMatchThought(onPage({ reached: manyButtons(9) }));
    expect(text).toContain("('Button 1', 'Button 2', 'Button 3', 'Button 4', 'Button 5' and 4 more)");
  });

  it('has a sentence when it was not looking for anything yet', () => {
    expect(noMatchThought(memoryOf())).toBe("I have nothing left to try, so I'm giving up.");
  });
});

describe('step_limit Give_Up_Thought', () => {
  it('counts the opening of the page as the first try and names the goal', () => {
    expect(stepLimitThought(memoryOf({ actions: 59 }))).toBe(
      "I've tried 60 times and still haven't managed to pay this month's electricity bill, so I'm giving up.",
    );
  });

  it('copes with an empty goal, a goal ending in a full stop, an acronym, and a single try', () => {
    expect(stepLimitThought(memoryOf({ actions: 9, goal: '' }))).toBe("I've tried 10 times and still haven't finished, so I'm giving up.");
    expect(stepLimitThought(memoryOf({ actions: 9, goal: 'Pay the bill.' }))).toContain('managed to pay the bill, so');
    expect(stepLimitThought(memoryOf({ actions: 9, goal: 'PDF download' }))).toContain('managed to PDF download, so');
    expect(stepLimitThought(memoryOf({ actions: 0 }))).toContain("I've tried 1 time and");
  });
});

// -- Properties of every thought ---------------------------------------------------------------------------------

describe('every thought', () => {
  // Names written without full stops inside them, so that the sentences can be split on ". ".
  const everything: Record<string, string> = {
    orientationFirst: orientationThought(heard([], { title: 'Lantern Bills' }), true),
    orientationNext: orientationThought(heard([], { title: 'Lantern Bills' }), false),
    activate: matchActivateThought('I want to pay. ', PAY, 'Enter'),
    type: matchTypeThought('', CARD, '4111111111111111'),
    pageButton: pageSearchThought({ lead: '', mode: 'button', node: PAY, landed: true, used: false }),
    pageTabNothing: pageSearchThought({ lead: '', mode: 'tab', node: undefined, landed: false, used: false }),
    dialogFirst: dialogSearchThought({ lead: '', dialogName: 'Protect your payment', node: CHECK, key: 'Tab', first: true, used: false }),
    dialogShift: dialogSearchThought({ lead: '', dialogName: '', node: undefined, key: 'Shift+Tab', first: true, used: false }),
    dialogNext: dialogSearchThought({ lead: '', dialogName: 'X', node: CONTINUE_NODE, key: 'Tab', first: false, used: true }),
    roundTab: roundCompleteThought({ lead: '', dialogName: 'X', node: CHECK, key: 'Tab', next: 'Shift+Tab' }),
    roundShift: roundCompleteThought({
      lead: '',
      dialogName: 'Protect your payment',
      node: CHECK,
      key: 'Shift+Tab',
      next: 'Escape',
      unreached: [CLOSE_C, CONTINUE_C],
    }),
    resortGo: lastResortGoThought({ lead: '', remaining: 3, tried: 0 }),
    resortEnter: lastResortEnterThought({ lead: '', node: UNNAMED, first: true }),
    trapped: trappedThought(trapMemory()),
    trappedEmpty: trappedThought(memoryOf()),
    trappedMany: trappedThought(trapMemory({ dialogUnreached: manyButtons(12) })),
    noMatch: noMatchThought(memoryOf({ seeking: intention('button'), reached: [PAY_C, CLOSE_C], pageUnreached: [CONTINUE_C] })),
    noMatchNothing: noMatchThought(memoryOf({ seeking: intention('field') })),
    noMatchNull: noMatchThought(memoryOf()),
    stepLimit: stepLimitThought(memoryOf({ actions: 59 })),
  };

  it.each(Object.entries(everything))('%s: first person, capital letters, full stops, ASCII apostrophes', (_name, text) => {
    expect(text).toMatch(/\bI\b|\bI'/);
    expect(text.endsWith('.')).toBe(true);
    expect(text).not.toMatch(/[\u2018\u2019\u201C\u201D]/u);
    expect(text).not.toMatch(/\s{2,}|\s$|^\s/u);
    for (const sentence of text.split(/(?<=\.) /u)) {
      expect(sentence).toMatch(/^[A-Z]/u);
      expect(sentence.endsWith('.')).toBe(true);
    }
  });

  it('never writes anything that is not in the memory: no refs, boxes or pixels', () => {
    for (const text of Object.values(everything)) {
      expect(text).not.toMatch(/\bax-\d+/u);
      expect(text).not.toMatch(/\d\s?px\b|\bpixels?\b|\bbox\b|\bcoordinates?\b|\bscreenshot\b|\bfinding\b/iu);
    }
  });

  it('builds the Give_Up_Thoughts from the memory alone: same memory, same sentence', () => {
    const a = trapMemory();
    const b = trapMemory({ focusedRefs: new Set(['something-else']) });
    expect(trappedThought(a)).toBe(trappedThought(b));
    expect(noMatchThought(a)).toBe(noMatchThought(b));
    expect(stepLimitThought(a)).toBe(stepLimitThought(b));
    // Changing only what the memory holds changes the sentence.
    expect(trappedThought(trapMemory({ dialogName: 'Other dialog' }))).toContain("'Other dialog'");
    expect(stepLimitThought(memoryOf({ actions: 4 }))).toContain('5 times');
    expect(stepLimitThought(memoryOf({ goal: 'Find the form' }))).toContain('managed to find the form');
  });

  it('does not change the memory it is given', () => {
    const memory = trapMemory({ dialogUnreached: manyButtons(8) });
    const copy = JSON.stringify({ ...memory, focusedRefs: [...memory.focusedRefs] });
    trappedThought(memory);
    noMatchThought(memory);
    stepLimitThought(memory);
    expect(JSON.stringify({ ...memory, focusedRefs: [...memory.focusedRefs] })).toBe(copy);
  });
});
