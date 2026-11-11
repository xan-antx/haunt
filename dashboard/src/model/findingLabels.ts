// The only table of plain-words finding labels and phrases. Typed as Record<FindingType, …>,
// so a missing finding type or phrase fails to compile (Req 9.4).

import type { FindingType } from '../data/types';

export interface FindingLabel {
  label: string;
  /** First person, used by the Ask_Panel's "What would have helped?" answer. */
  helped: string;
  /** Result_Headline of a gave-up run, after the ghost's name: "The Listener <blocker> and couldn't pay." */
  blocker: string;
  /** Result_Headline of a succeeded run, after "but found": "Bebe managed to pay, but found <thing>." */
  thing: string;
  /** First person, after "At step n I", in the "Where did you get stuck?" answer. */
  stuck: string;
  /** One plain sentence for the Stuck_Notice when the evidence has none that reads well. */
  summary: string;
}

export const FINDING_LABELS: Record<FindingType, FindingLabel> = {
  unlabeled_button: {
    label: 'Button with no name',
    helped: "If the button had a name, like 'Pay bill', I'd have known what it does.",
    blocker: "couldn't tell what a button did",
    thing: 'a button with no name',
    stuck: 'found a button with no name',
    summary: 'This button has no name, so a screen reader says only "button".',
  },
  focus_trap: {
    label: 'Keyboard trap',
    helped: 'A way out with the keyboard, like Escape or a Close button I could reach.',
    blocker: 'got trapped with no keyboard way out',
    thing: 'a keyboard trap',
    stuck: 'got trapped with no keyboard way out',
    summary: 'Keyboard focus got stuck here, with no way out by keyboard.',
  },
  unannounced_error: {
    label: 'Error nobody announced',
    helped: "If the page had announced the error, I'd have known what to fix.",
    blocker: 'missed an error nobody announced',
    thing: 'an error nobody announced',
    stuck: 'missed an error nobody announced',
    summary: 'An error appeared here, but the screen reader never announced it.',
  },
  slow_wait: {
    label: 'Too long a wait',
    helped: 'A faster page, or a sign that it was still working.',
    blocker: 'waited too long for the page',
    thing: 'a page that took too long',
    stuck: 'waited too long for the page',
    summary: 'The page took too long to respond here.',
  },
  misclick: {
    label: 'Clicked the wrong thing',
    helped: 'A page that stayed still while I was about to click.',
    blocker: 'clicked the wrong thing',
    thing: 'something easy to click by mistake',
    stuck: 'clicked the wrong thing',
    summary: 'A click here landed on the wrong thing.',
  },
  cut_off_text: {
    label: 'Text cut off',
    helped: 'Text that wrapped to the next line when I zoomed in, instead of running off the edge.',
    blocker: "couldn't read text that was cut off",
    thing: 'text that was cut off',
    stuck: "couldn't read text that was cut off",
    summary: 'Some text here runs off the edge and is cut off.',
  },
  untranslated: {
    label: 'Text not translated',
    helped: 'This text in my language.',
    blocker: "couldn't read text that wasn't translated",
    thing: "text that wasn't translated",
    stuck: "found text that wasn't translated",
    summary: "Some text here isn't translated into the reader's language.",
  },
  dark_pattern: {
    label: 'Tricky choice',
    helped: 'A plain choice, with nothing extra ticked for me.',
    blocker: 'ran into a tricky choice',
    thing: 'a tricky choice',
    stuck: 'ran into a tricky choice',
    summary: 'A choice here is worded or set up to trick people.',
  },
};

/** The focus_trap blocker when the finding talks about a dialog, modal or pop-up. */
export const POP_UP_BLOCKER = 'got trapped in a pop-up';

export function plainFindingType(type: FindingType): string {
  return FINDING_LABELS[type].label;
}
