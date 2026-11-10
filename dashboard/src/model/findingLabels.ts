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
}

export const FINDING_LABELS: Record<FindingType, FindingLabel> = {
  unlabeled_button: {
    label: 'Button with no name',
    helped: "If the button had a name, like 'Pay bill', I'd have known what it does.",
    blocker: "couldn't tell what a button did",
    thing: 'a button with no name',
  },
  focus_trap: {
    label: 'Keyboard trap',
    helped: 'A way out with the keyboard, like Escape or a Close button I could reach.',
    blocker: 'got trapped with no keyboard way out',
    thing: 'a keyboard trap',
  },
  unannounced_error: {
    label: 'Error nobody announced',
    helped: "If the page had announced the error, I'd have known what to fix.",
    blocker: 'missed an error nobody announced',
    thing: 'an error nobody announced',
  },
  slow_wait: {
    label: 'Too long a wait',
    helped: 'A faster page, or a sign that it was still working.',
    blocker: 'waited too long for the page',
    thing: 'a page that took too long',
  },
  misclick: {
    label: 'Clicked the wrong thing',
    helped: 'A page that stayed still while I was about to click.',
    blocker: 'clicked the wrong thing',
    thing: 'something easy to click by mistake',
  },
  cut_off_text: {
    label: 'Text cut off',
    helped: 'Text that wrapped to the next line when I zoomed in, instead of running off the edge.',
    blocker: "couldn't read text that was cut off",
    thing: 'text that was cut off',
  },
  untranslated: {
    label: 'Text not translated',
    helped: 'This text in my language.',
    blocker: "couldn't read text that wasn't translated",
    thing: "text that wasn't translated",
  },
  dark_pattern: {
    label: 'Tricky choice',
    helped: 'A plain choice, with nothing extra ticked for me.',
    blocker: 'ran into a tricky choice',
    thing: 'a tricky choice',
  },
};

/** The focus_trap blocker when the finding talks about a dialog, modal or pop-up. */
export const POP_UP_BLOCKER = 'got trapped in a pop-up';

export function plainFindingType(type: FindingType): string {
  return FINDING_LABELS[type].label;
}
