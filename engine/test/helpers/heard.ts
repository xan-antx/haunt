import type { Heard, HeardNode } from '../../src/ghosts/listener/ax.ts';

/*
 * Test support: builds scripted `Heard` values, including a copy of Lantern Bills' accessibility tree as
 * the design describes it ("What the ghosts will meet on Lantern Bills"). The Mind tests feed these to
 * the Mind one after another, the way the run loop would.
 */

export interface NodeSpec {
  ref: string;
  role: string;
  name?: string;
  value?: string;
  states?: HeardNode['states'];
  level?: number;
  depth?: number;
}

export interface HeardSpec {
  path?: string;
  title?: string;
  /** Ref of the focused node, or `null` for no focus. */
  focus?: string | null;
  /** The dialog that contains the focus. */
  dialog?: { ref: string; name: string } | null;
  readingPosition?: string | null;
  announcements?: string[];
}

/** Builds a `Heard` from node specs. The focused node gets `states.focused`. */
export function heard(nodes: readonly NodeSpec[], spec: HeardSpec = {}): Heard {
  const focus = spec.focus ?? null;
  return {
    title: spec.title ?? 'Test page',
    path: spec.path ?? '/',
    nodes: nodes.map((n) => {
      const node: HeardNode = {
        ref: n.ref,
        role: n.role,
        name: n.name ?? '',
        description: '',
        value: n.value ?? '',
        states: { ...(n.states ?? {}), ...(n.ref === focus ? { focused: true as const } : {}) },
        depth: n.depth ?? 1,
      };
      if (n.level !== undefined) node.level = n.level;
      return node;
    }),
    focus,
    dialog: spec.dialog ?? null,
    region: null,
    readingPosition: spec.readingPosition ?? null,
    announcements: spec.announcements ?? [],
  };
}

/** Refs of the Lantern Bills tree. */
export const LB = {
  ROOT: 'ax-1',
  HEADING: 'ax-3',
  PAY: 'ax-4',
  AUTOPAY: 'ax-5',
  REGION: 'ax-9',
  CARD: 'ax-10',
  EXPIRY: 'ax-11',
  CVV: 'ax-12',
  NAME: 'ax-13',
  SUBMIT: 'ax-14',
  DIALOG: 'ax-20',
  CLOSE: 'ax-21',
  CHECK: 'ax-22',
  LEARN: 'ax-23',
  CONTINUE: 'ax-24',
} as const;

export const LB_DIALOG_NAME = 'Protect your payment';
export const LB_CHECK_NAME = 'Payment protection for ₹99 Get a refund if your payment fails due to a technical issue.';

const DIALOG_MEMBERS: ReadonlySet<string> = new Set([LB.CLOSE, LB.CHECK, LB.LEARN, LB.CONTINUE]);

export interface LanternScene {
  /** Ref of the focused node. */
  focus?: string | null;
  /** The payment form is open. */
  form?: boolean;
  /** AX values of the form fields, by ref. */
  values?: Readonly<Record<string, string>>;
  /** The Protection modal is open. */
  modal?: boolean;
  /** The late banner's "Set up autopay" link is present. */
  autopay?: boolean;
  path?: string;
  readingPosition?: string | null;
  /**
   * The name of the form's submit button. Default `''` (the unnamed button of the real site). `null` leaves
   * the button out of the tree.
   */
  submitName?: string | null;
  /** Accessible names that replace the English ones, by ref (for example the Punjabi site). */
  names?: Readonly<Record<string, string>>;
}

/** The Lantern Bills bill page as The Listener hears it, in the state described by `scene`. */
export function lanternBills(scene: LanternScene = {}): Heard {
  const values = scene.values ?? {};
  const nameOf = (ref: string, english: string): string => scene.names?.[ref] ?? english;
  const nodes: NodeSpec[] = [
    { ref: LB.ROOT, role: 'RootWebArea', name: nameOf(LB.ROOT, 'Lantern Bills - Pay Your Electricity Bill'), depth: 0 },
    { ref: LB.HEADING, role: 'heading', name: nameOf(LB.HEADING, 'Your Electricity Bill'), level: 1 },
    ...(scene.autopay ? [{ ref: LB.AUTOPAY, role: 'link', name: nameOf(LB.AUTOPAY, 'Set up autopay') }] : []),
    { ref: LB.PAY, role: 'button', name: nameOf(LB.PAY, 'Pay this bill') },
  ];
  if (scene.form) {
    nodes.push(
      { ref: LB.REGION, role: 'region', name: nameOf(LB.REGION, 'Payment Information') },
      { ref: LB.CARD, role: 'textbox', name: nameOf(LB.CARD, 'Card Number'), value: values[LB.CARD] ?? '', states: { required: true }, depth: 2 },
      { ref: LB.EXPIRY, role: 'textbox', name: nameOf(LB.EXPIRY, 'Expiry Date'), value: values[LB.EXPIRY] ?? '', states: { required: true }, depth: 2 },
      { ref: LB.CVV, role: 'textbox', name: nameOf(LB.CVV, 'CVV'), value: values[LB.CVV] ?? '', states: { required: true }, depth: 2 },
      { ref: LB.NAME, role: 'textbox', name: nameOf(LB.NAME, 'Cardholder Name'), value: values[LB.NAME] ?? '', states: { required: true }, depth: 2 },
      ...(scene.submitName === null ? [] : [{ ref: LB.SUBMIT, role: 'button', name: scene.submitName ?? '', depth: 2 }]),
    );
  }
  const dialogName = nameOf(LB.DIALOG, LB_DIALOG_NAME);
  if (scene.modal) {
    nodes.push(
      { ref: LB.DIALOG, role: 'dialog', name: dialogName, states: { modal: true } },
      { ref: LB.CLOSE, role: 'button', name: nameOf(LB.CLOSE, 'Close dialog'), depth: 2 },
      { ref: LB.CHECK, role: 'checkbox', name: nameOf(LB.CHECK, LB_CHECK_NAME), states: { checked: true }, depth: 2 },
      { ref: LB.LEARN, role: 'button', name: nameOf(LB.LEARN, 'Learn more'), states: { expanded: false }, depth: 2 },
      { ref: LB.CONTINUE, role: 'button', name: nameOf(LB.CONTINUE, 'Continue'), depth: 2 },
      { ref: 'ax-25', role: 'StaticText', name: 'Total Amount: ₹2,589.00', depth: 2 },
    );
  }
  const focus = scene.focus ?? null;
  const inDialog = scene.modal === true && focus !== null && DIALOG_MEMBERS.has(focus);
  return heard(nodes, {
    path: scene.path ?? '/',
    title: nameOf(LB.ROOT, 'Lantern Bills - Pay Your Electricity Bill'),
    focus,
    dialog: inDialog ? { ref: LB.DIALOG, name: dialogName } : null,
    readingPosition: scene.readingPosition ?? null,
  });
}
