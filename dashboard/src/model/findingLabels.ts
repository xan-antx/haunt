// The only table of plain-words finding labels and "What would have helped?" suggestions.
// Typed as Record<FindingType, …>, so a missing finding type fails to compile.

import type { FindingType } from '../data/types';

export interface FindingLabel {
  label: string;
  /** First person, used by the Séance "What would have helped?" answer. */
  helped: string;
}

export const FINDING_LABELS: Record<FindingType, FindingLabel> = {
  unlabeled_button: {
    label: 'Button with no name',
    helped: "If the button had a name, like 'Pay bill', I'd have known what it does.",
  },
  focus_trap: {
    label: 'Keyboard trap',
    helped: 'A way out with the keyboard, like Escape or a Close button I could reach.',
  },
  unannounced_error: {
    label: 'Error nobody announced',
    helped: "If the error had been read out, I'd have known what to fix.",
  },
  slow_wait: {
    label: 'Too long a wait',
    helped: 'A faster page, or a sign that it was still working.',
  },
  misclick: {
    label: 'Clicked the wrong thing',
    helped: 'A page that stayed still while I was about to click.',
  },
  cut_off_text: {
    label: 'Text cut off',
    helped: 'Text that wrapped instead of being cut off when I zoomed in.',
  },
  untranslated: {
    label: 'Text not translated',
    helped: 'This text in my language.',
  },
  dark_pattern: {
    label: 'Tricky choice',
    helped: 'A plain choice, with nothing extra ticked for me.',
  },
};

export function plainFindingType(type: FindingType): string {
  return FINDING_LABELS[type].label;
}
