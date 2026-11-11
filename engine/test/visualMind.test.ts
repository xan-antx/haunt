import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Decision } from '../src/core/types.ts';
import { VisualMind, type VisualMindParams } from '../src/ghosts/visual/mind.ts';
import type { VisualAction } from '../src/ghosts/visual/types.ts';
import { loadMission, type Mission } from '../src/missions/loadMission.ts';
import type { SeenItem, Sight } from '../src/page/sight.ts';

/**
 * The shared visual Mind on scripted Sights that copy Lantern Bills' screens (design "Shared visual
 * body (Phase 2a)" > Visual mind, and the expected walks of The Phantom and Bebe). The texts come from
 * `demo-site/public/locales/{en,pa}/translation.json`; "Pay this bill" and "Lantern Bills" are English in
 * every language. The boxes follow the page's layout at each ghost's viewport.
 *
 * **Validates: Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 18.1, 18.2, 18.3, 18.4**
 */

const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const PHANTOM: VisualMindParams = { languages: ['en'], pointer: 'tap' };
const BEBE: VisualMindParams = { languages: ['pa', 'hi', 'en'] };

function payBill(): Mission {
  const mission = loadMission(path.join(ENGINE_ROOT, 'missions'), 'pay-bill');
  return JSON.parse(JSON.stringify(mission).replaceAll('{{futureExpiry}}', '11/28')) as Mission;
}

// ---------------------------------------------------------------------------------------------------------
// Building Sights
// ---------------------------------------------------------------------------------------------------------

type Spec = [
  look: SeenItem['look'],
  text: string,
  x: number,
  y: number,
  w: number,
  h: number,
  extra?: Partial<SeenItem> | undefined,
];

/** One Sight. Item ids are "s1", "s2"… in the order given, valid for this Sight only. */
function screen(pathName: string, hash: string, viewport: Sight['viewport'], specs: Spec[]): Sight {
  const items = specs.map(([look, text, x, y, w, h, extra], i): SeenItem => ({
    id: `s${i + 1}`,
    look,
    text,
    box: { x, y, w, h },
    ...extra,
  }));
  return { path: pathName, viewport, screenshot: Buffer.alloc(0), screenshotHash: hash, items };
}

/** The id of the first item with this look and text. */
function idOf(sight: Sight, look: SeenItem['look'], text: string): string {
  const found = sight.items.find((item) => item.look === look && item.text === text);
  if (found === undefined) throw new Error(`no ${look} "${text}" in the Sight of ${sight.path}`);
  return found.id;
}

function walk(mind: VisualMind, sights: readonly Sight[]): Decision<VisualAction>[] {
  return sights.map((sight) => mind.decide(sight));
}

const PLACEHOLDER = { placeholder: true } as const;

// ---------------------------------------------------------------------------------------------------------
// Lantern Bills in English, for The Phantom (360×640)
// ---------------------------------------------------------------------------------------------------------

const PHONE = { w: 360, h: 640 };

/** The bill page before the late banner moves the layout: "Pay this bill" sits where the banner will be. */
function enBillPage(hash = 'en-bill'): Sight {
  return screen('/', hash, PHONE, [
    ['text', 'Lantern Bills', 16, 12, 120, 24],
    ['text', 'Power for every home', 16, 36, 160, 18],
    ['link', 'English', 200, 12, 50, 20],
    ['link', 'ਪੰਜਾਬੀ', 254, 12, 44, 20],
    ['link', 'हिन्दी', 302, 12, 42, 20],
    ['text', 'Your electricity bill', 16, 80, 300, 36],
    ['text', 'Check your bill and pay it securely online.', 16, 120, 320, 40],
    ['button', 'Pay this bill', 16, 170, 132, 48],
    ['text', 'Amount due', 16, 240, 100, 20],
    ['text', '₹2,490.00', 16, 262, 120, 28],
  ]);
}

/** `/autopay`, reached when a tap meant for "Pay this bill" lands on "Set up autopay". */
function enAutopayPage(): Sight {
  return screen('/autopay', 'en-autopay', PHONE, [
    ['text', 'Lantern Bills', 16, 12, 120, 24],
    ['text', 'Power for every home', 16, 36, 160, 18],
    ['link', 'English', 200, 12, 50, 20],
    ['link', 'ਪੰਜਾਬੀ', 254, 12, 44, 20],
    ['link', 'हिन्दी', 302, 12, 42, 20],
    ['text', 'Set up autopay', 16, 80, 260, 36],
    ['text', 'Autopay coming soon', 80, 140, 200, 24],
    ['text', 'Autopay is not ready yet. Soon it will pay each bill for you on its due date.', 80, 168, 260, 60],
    ['link', 'Back to bill', 16, 250, 130, 24],
  ]);
}

/** The payment form, scrolled to the card number. `values` are what the fields show. */
function enForm(hash: string, values: { card?: string; expiry?: string; cvv?: string; name?: string } = {}): Sight {
  const field = (value: string | undefined, placeholder: string): [string, Partial<SeenItem> | undefined] =>
    value === undefined ? [placeholder, PLACEHOLDER] : [value, undefined];
  const [card, cardExtra] = field(values.card, '1234 5678 9012 3456');
  const [expiry, expiryExtra] = field(values.expiry, 'MM/YY');
  const [cvv, cvvExtra] = field(values.cvv, '123');
  const [name, nameExtra] = field(values.name, 'Name on card');
  return screen('/', hash, PHONE, [
    ['text', 'Payment information', 16, 20, 260, 30],
    ['text', 'We send your card details over a secure connection and never store them.', 16, 56, 328, 40],
    ['text', 'Card number', 16, 110, 100, 20],
    ['field', card, 16, 136, 328, 44, cardExtra],
    ['text', 'Expiry date', 16, 196, 100, 20],
    ['text', 'CVV', 184, 196, 40, 20],
    ['field', expiry, 16, 222, 156, 44, expiryExtra],
    ['field', cvv, 184, 222, 160, 44, cvvExtra],
    ['text', 'Cardholder name', 16, 282, 140, 20],
    ['field', name, 16, 308, 328, 44, nameExtra],
    ['button', '', 16, 372, 328, 48],
    ['text', 'Payment summary', 16, 450, 180, 24],
  ]);
}

function enModal(): Sight {
  return screen('/', 'en-modal', PHONE, [
    ['text', 'Protect your payment', 32, 120, 240, 28],
    ['button', '', 300, 120, 32, 32],
    ['checkbox', '', 32, 170, 20, 20, { checked: true }],
    ['text', 'Payment protection for ₹99', 60, 170, 240, 20],
    ['text', 'Get a refund if your payment fails due to a technical issue.', 60, 194, 260, 40],
    ['button', 'Learn more', 60, 240, 100, 24],
    ['text', 'Total Amount: ₹2,589.00', 32, 280, 240, 24],
    ['button', 'Continue', 32, 320, 296, 48],
  ]);
}

// ---------------------------------------------------------------------------------------------------------
// Lantern Bills in Punjabi, for Bebe (640×400, after the banner has moved the layout)
// ---------------------------------------------------------------------------------------------------------

const ZOOMED = { w: 640, h: 400 };

function paHeader(): Spec[] {
  return [
    ['text', 'Lantern Bills', 16, 8, 160, 28],
    ['text', 'ਹਰ ਘਰ ਲਈ ਬਿਜਲੀ', 16, 38, 180, 22],
    ['link', 'English', 420, 8, 60, 24],
    ['link', 'ਪੰਜਾਬੀ', 490, 8, 60, 24],
    ['link', 'हिन्दी', 560, 8, 60, 24],
  ];
}

function paBillPage(): Sight {
  return screen('/', 'pa-bill', ZOOMED, [
    ...paHeader(),
    ['text', 'ਤੁਹਾਡਾ ਬਿਜਲੀ ਬਿੱਲ', 16, 80, 360, 44],
    ['text', 'ਆਪਣਾ ਬਿੱਲ ਦੇਖੋ ਅਤੇ ਇਸਨੂੰ ਔਨਲਾਈਨ ਸੁਰੱਖਿਅਤ ਢੰਗ ਨਾਲ ਭਰੋ।', 16, 130, 600, 28],
    ['link', 'ਆਟੋਪੇ ਸੈੱਟਅੱਪ ਕਰੋ', 16, 170, 200, 28],
    ['text', "ਆਟੋਪੇ ਨਾਲ ਭੁਗਤਾਨ ਕਰਨ 'ਤੇ 5% ਕੈਸ਼ਬੈਕ", 16, 206, 400, 28],
    ['button', 'Pay this bill', 16, 320, 180, 56],
  ]);
}

function paAutopayPage(): Sight {
  return screen('/autopay', 'pa-autopay', ZOOMED, [
    ...paHeader(),
    ['text', 'ਆਟੋਪੇ ਸੈੱਟਅੱਪ ਕਰੋ', 16, 80, 360, 44],
    ['text', 'ਆਟੋਪੇ ਜਲਦੀ ਆ ਰਿਹਾ ਹੈ', 96, 140, 300, 28],
    ['text', 'ਆਟੋਪੇ ਅਜੇ ਤਿਆਰ ਨਹੀਂ ਹੈ। ਜਲਦੀ ਹੀ ਇਹ ਹਰ ਬਿੱਲ ਉਸਦੀ ਅੰਤਮ ਤਾਰੀਖ ਨੂੰ ਤੁਹਾਡੇ ਲਈ ਭਰੇਗਾ।', 96, 172, 520, 56],
    ['link', 'ਬਿੱਲ ਤੇ ਵਾਪਸ ਜਾਓ', 16, 250, 220, 28],
  ]);
}

/** The payment form, scrolled to the card number. The cardholder name is below the screen. */
function paFormTop(hash: string, values: { card?: string; expiry?: string; cvv?: string } = {}): Sight {
  const field = (value: string | undefined, placeholder: string): [string, Partial<SeenItem> | undefined] =>
    value === undefined ? [placeholder, PLACEHOLDER] : [value, undefined];
  const [card, cardExtra] = field(values.card, '1234 5678 9012 3456');
  const [expiry, expiryExtra] = field(values.expiry, 'MM/YY');
  const [cvv, cvvExtra] = field(values.cvv, '123');
  return screen('/', hash, ZOOMED, [
    ['text', 'ਭੁਗਤਾਨ ਜਾਣਕਾਰੀ', 16, 16, 300, 36],
    ['text', 'ਅਸੀਂ ਤੁਹਾਡੇ ਕਾਰਡ ਦੇ ਵੇਰਵੇ ਸੁਰੱਖਿਅਤ ਕਨੈਕਸ਼ਨ ਰਾਹੀਂ ਭੇਜਦੇ ਹਾਂ ਅਤੇ ਕਦੇ ਸਟੋਰ ਨਹੀਂ ਕਰਦੇ।', 16, 60, 608, 56],
    ['text', 'ਕਾਰਡ ਨੰਬਰ', 16, 130, 140, 26],
    ['field', card, 16, 160, 608, 52, cardExtra],
    ['text', 'ਮਿਆਦ ਪੁੱਗਣ ਦੀ ਤਾਰੀਖ', 16, 228, 280, 26],
    ['text', 'CVV', 330, 228, 60, 26],
    ['field', expiry, 16, 258, 296, 52, expiryExtra],
    ['field', cvv, 330, 258, 294, 52, cvvExtra],
  ]);
}

/** The same form after one scroll: the cardholder name, the button with no text and the clipped summary. */
function paFormBottom(hash: string, name?: string): Sight {
  return screen('/', hash, ZOOMED, [
    ['text', 'ਕਾਰਡਧਾਰਕ ਦਾ ਨਾਮ', 16, 10, 240, 26],
    ['field', name ?? 'ਕਾਰਡ ਤੇ ਨਾਮ', 16, 40, 608, 52, name === undefined ? PLACEHOLDER : undefined],
    ['button', '', 16, 112, 608, 56],
    ['text', 'ਭੁਗਤਾਨ ਸੰਖੇਪ', 16, 200, 180, 30],
    ['text', 'ਕੁੱਲ', 16, 240, 60, 26],
    ['text', '₹2,49', 16, 270, 144, 44],
  ]);
}

/** The protection modal at 200% zoom: Continue is below the screen until Bebe scrolls. */
function paModal(scrolled: boolean): Sight {
  const top = scrolled ? -200 : 0;
  const specs: Spec[] = [
    ['text', 'ਆਪਣੇ ਭੁਗਤਾਨ ਦੀ ਰੱਖਿਆ ਕਰੋ', 40, top + 60, 480, 36],
    ['button', '', 560, top + 60, 40, 40],
    ['checkbox', '', 40, top + 120, 24, 24, { checked: true }],
    ['text', '₹99 ਲਈ ਭੁਗਤਾਨ ਸੁਰੱਖਿਆ', 72, top + 118, 300, 28],
    ['text', 'ਜੇਕਰ ਤੁਹਾਡਾ ਭੁਗਤਾਨ ਤਕਨੀਕੀ ਸਮੱਸਿਆ ਕਾਰਨ ਅਸਫਲ ਹੋ ਜਾਂਦਾ ਹੈ ਤਾਂ ਰਿਫੰਡ ਪ੍ਰਾਪਤ ਕਰੋ।', 72, top + 152, 520, 84],
    ['button', 'ਹੋਰ ਜਾਣੋ', 72, top + 244, 140, 40],
    ['text', 'ਕੁੱਲ ਰਕਮ: ₹2,589.00', 40, top + 300, 360, 30],
    ['button', 'ਜਾਰੀ ਰੱਖੋ', 40, top + 400, 560, 56],
  ];
  // Only what intersects the viewport is seen.
  const visible = specs.filter(([, , , y, , h]) => y + h > 0 && y < ZOOMED.h);
  return screen('/', scrolled ? 'pa-modal-down' : 'pa-modal', ZOOMED, visible);
}

/** Bebe's whole walk, one Sight per decision (Step 1 is the opening of the page). */
function bebeSights(): Sight[] {
  return [
    paBillPage(),
    paFormTop('pa-form-1'),
    paFormTop('pa-form-2'),
    paFormTop('pa-form-3', { card: '4111 1111 1111 1111' }),
    paFormTop('pa-form-4', { card: '4111 1111 1111 1111' }),
    paFormTop('pa-form-5', { card: '4111 1111 1111 1111', expiry: '11/28' }),
    paFormTop('pa-form-6', { card: '4111 1111 1111 1111', expiry: '11/28' }),
    paFormTop('pa-form-7', { card: '4111 1111 1111 1111', expiry: '11/28', cvv: '123' }),
    paFormBottom('pa-form-8'),
    paFormBottom('pa-form-9'),
    paFormBottom('pa-form-10', 'Asha Kaur'),
    paModal(false),
    paModal(true),
  ];
}

// ---------------------------------------------------------------------------------------------------------
// The Phantom
// ---------------------------------------------------------------------------------------------------------

describe('The Phantom on Lantern Bills (English)', () => {
  it('follows the expected walk: Pay this bill, "Back to bill" as a recovery, Pay this bill again', () => {
    const mind = new VisualMind(payBill(), PHANTOM);
    const bill = enBillPage();
    const autopay = enAutopayPage();
    const billAgain = enBillPage('en-bill-again');
    const [first, second, third] = walk(mind, [bill, autopay, billAgain]);

    // Step 2: the tap meant for "Pay this bill".
    expect(first).toEqual({
      kind: 'act',
      action: { type: 'click', itemId: idOf(bill, 'button', 'Pay this bill') },
      intentionId: 'open-form',
      thought: "I want to pay this bill, so I'm looking for the button that starts paying. I can see 'Pay this bill'. I'll tap it.",
    });

    // Step 3: the autopay page is unexpected, so "Back to bill" is a recovery for the same Intention.
    expect(second).toEqual({
      kind: 'act',
      action: { type: 'click', itemId: idOf(autopay, 'link', 'Back to bill') },
      intentionId: 'open-form',
      recovery: true,
      thought: "This page says 'Set up autopay'. It isn't where I meant to go. I'll tap 'Back to bill' to go back.",
    });

    // Step 4: back on the bill page, the same button again, and not as a recovery.
    expect(third).toEqual({
      kind: 'act',
      action: { type: 'click', itemId: idOf(billAgain, 'button', 'Pay this bill') },
      intentionId: 'open-form',
      thought: "I can see 'Pay this bill'. I'll tap it again.",
    });

    // The engine then ends the Run with `misclicks`; the Give_Up_Thought quotes what was seen.
    expect(mind.giveUpThought('misclicks')).toBe(
      "Twice I tapped 'Pay this bill' and the page jumped just before my finger landed, so I ended up on a page that says 'Set up autopay' instead. I'm giving up.",
    );
  });

  it('waits on the blank screen of the long first load before it taps', () => {
    const mind = new VisualMind(payBill(), PHANTOM);
    const bill = enBillPage();
    const [waiting, tap] = walk(mind, [screen('/', 'blank', PHONE, []), bill]);
    expect(waiting).toMatchObject({ kind: 'act', action: { type: 'wait' }, intentionId: 'open-form' });
    expect(waiting).not.toHaveProperty('recovery');
    expect(tap).toMatchObject({ action: { type: 'click', itemId: idOf(bill, 'button', 'Pay this bill') } });
  });

  it('uses the browser Back when the unexpected page shows no way back', () => {
    const mind = new VisualMind(payBill(), PHANTOM);
    const noLink = screen('/autopay', 'no-link', PHONE, [['text', 'Set up autopay', 16, 80, 260, 36]]);
    const [, back] = walk(mind, [enBillPage(), noLink]);
    expect(back).toMatchObject({ kind: 'act', action: { type: 'back' }, recovery: true, intentionId: 'open-form' });
    expect(back!.thought).toContain("This page says 'Set up autopay'.");
  });

  it('fills the English form by its labels, presses the button with no text and taps Continue', () => {
    const mind = new VisualMind(payBill(), PHANTOM);
    const card = '4111 1111 1111 1111';
    const sights = [
      enBillPage(),
      enForm('f1'),
      enForm('f2'),
      enForm('f3', { card }),
      enForm('f4', { card }),
      enForm('f5', { card, expiry: '11/28' }),
      enForm('f6', { card, expiry: '11/28' }),
      enForm('f7', { card, expiry: '11/28', cvv: '123' }),
      enForm('f8', { card, expiry: '11/28', cvv: '123' }),
      enForm('f9', { card, expiry: '11/28', cvv: '123', name: 'Asha Kaur' }),
      enModal(),
    ];
    const decisions = walk(mind, sights);
    const form = sights[1]!;
    const fieldAt = (i: number) => form.items.filter((item) => item.look === 'field')[i]!.id;

    expect(decisions.map((d) => (d.kind === 'act' ? [d.intentionId, d.action.type] : [d.kind]))).toEqual([
      ['open-form', 'click'],
      ['card-number', 'click'],
      ['card-number', 'type'],
      ['expiry', 'click'],
      ['expiry', 'type'],
      ['cvv', 'click'],
      ['cvv', 'type'],
      ['name', 'click'],
      ['name', 'type'],
      ['submit', 'click'],
      ['confirm', 'click'],
    ]);
    expect(decisions[1]).toMatchObject({ action: { itemId: fieldAt(0) } });
    expect(decisions[3]).toMatchObject({ action: { itemId: fieldAt(1) } });
    expect(decisions[5]).toMatchObject({ action: { itemId: fieldAt(2) } });
    expect(decisions[7]).toMatchObject({ action: { itemId: fieldAt(3) } });
    expect(decisions.filter((d) => d.kind === 'act' && d.action.type === 'type').map((d) => d.kind === 'act' && d.action)).toEqual([
      { type: 'type', text: '4111111111111111' },
      { type: 'type', text: '11/28' },
      { type: 'type', text: '123' },
      { type: 'type', text: 'Asha Kaur' },
    ]);
    expect(decisions[1]!.thought).toBe(
      "I'll enter the card number. I can see a box labelled 'Card number'. I'll tap the box so I can type in it.",
    );
    expect(decisions[2]!.thought).toBe(`I've put my cursor in the 'Card number' box. I'll type "4111111111111111".`);
    expect(decisions[9]).toMatchObject({ action: { type: 'click', itemId: idOf(sights[9]!, 'button', '') } });
    expect(decisions[9]!.thought).toContain('There is a button with no words on it');
    expect(decisions[10]).toMatchObject({ action: { type: 'click', itemId: idOf(sights[10]!, 'button', 'Continue') } });
    expect(decisions[10]!.thought).toBe("I need to confirm the payment. I can see 'Continue'. I'll tap it.");
    expect(decisions.some((d) => d.kind === 'act' && d.recovery === true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Bebe
// ---------------------------------------------------------------------------------------------------------

describe('Bebe on Lantern Bills (Punjabi)', () => {
  it('follows the expected walk to Continue, with Pay this bill found through the en fallback', () => {
    const mind = new VisualMind(payBill(), BEBE);
    const sights = bebeSights();
    const decisions = walk(mind, sights);

    expect(decisions.map((d) => (d.kind === 'act' ? [d.intentionId, d.action] : [d.kind]))).toEqual([
      ['open-form', { type: 'click', itemId: idOf(sights[0]!, 'button', 'Pay this bill') }],
      ['card-number', { type: 'click', itemId: idOf(sights[1]!, 'field', '1234 5678 9012 3456') }],
      ['card-number', { type: 'type', text: '4111111111111111' }],
      ['expiry', { type: 'click', itemId: idOf(sights[3]!, 'field', 'MM/YY') }],
      ['expiry', { type: 'type', text: '11/28' }],
      ['cvv', { type: 'click', itemId: idOf(sights[5]!, 'field', '123') }],
      ['cvv', { type: 'type', text: '123' }],
      ['name', { type: 'scroll', dir: 'down' }],
      ['name', { type: 'click', itemId: idOf(sights[8]!, 'field', 'ਕਾਰਡ ਤੇ ਨਾਮ') }],
      ['name', { type: 'type', text: 'Asha Kaur' }],
      ['submit', { type: 'click', itemId: idOf(sights[10]!, 'button', '') }],
      ['confirm', { type: 'scroll', dir: 'down' }],
      ['confirm', { type: 'click', itemId: idOf(sights[12]!, 'button', 'ਜਾਰੀ ਰੱਖੋ') }],
    ]);
    // Bebe never goes back and never gives up on this walk.
    expect(decisions.every((d) => d.kind === 'act' && d.recovery === undefined)).toBe(true);
  });

  it('says that "Pay this bill" is English, not Punjabi, and quotes the Punjabi she read', () => {
    const decisions = walk(new VisualMind(payBill(), BEBE), bebeSights());
    const thoughts = decisions.map((d) => d.thought);
    expect(thoughts[0]).toBe(
      "I want to pay this bill, so I'm looking for the button that starts paying. The button says 'Pay this bill' in English, not Punjabi, but I can make it out. I'll press it.",
    );
    expect(thoughts[1]).toBe("I'll enter the card number. I can see a box labelled 'ਕਾਰਡ ਨੰਬਰ'. I'll click the box so I can type in it.");
    expect(thoughts[2]).toBe(`I've put my cursor in the 'ਕਾਰਡ ਨੰਬਰ' box. I'll type "4111111111111111".`);
    expect(thoughts[3]).toBe("Now the expiry date. I can see a box labelled 'ਮਿਆਦ ਪੁੱਗਣ ਦੀ ਤਾਰੀਖ'. I'll click the box so I can type in it.");
    expect(thoughts[5]).toContain("a box labelled 'CVV'");
    expect(thoughts[8]).toContain("a box labelled 'ਕਾਰਡਧਾਰਕ ਦਾ ਨਾਮ'");
    expect(thoughts[10]).toContain('There is a button with no words on it');
    // The Intention's own thought is said once, on the scroll inside the modal.
    expect(thoughts[11]).toBe("I need to confirm the payment. I can't see what I'm looking for on the screen, so I'll scroll down.");
    expect(thoughts[12]).toBe("I can see 'ਜਾਰੀ ਰੱਖੋ'. I'll press it.");
    // Every click thought quotes text that was on the screen of its Sight.
    const sights = bebeSights();
    decisions.forEach((d, i) => {
      if (d.kind !== 'act' || d.action.type !== 'click') return;
      const itemId = d.action.itemId;
      // The button with no text has nothing to quote.
      if (sights[i]!.items.find((item) => item.id === itemId)?.text === '') return;
      // Quotes open after a space, so the apostrophes of "I'll" and "isn't" are not taken for quotes.
      const quotes = [...d.thought.matchAll(/(?<=\s)'([^']+)'(?=[\s.,])/gu)].map((m) => m[1]);
      expect(quotes.length).toBeGreaterThan(0);
      for (const q of quotes) expect(sights[i]!.items.some((item) => item.text === q)).toBe(true);
    });
  });

  it('treats the Punjabi autopay page as unexpected and goes back by "ਬਿੱਲ ਤੇ ਵਾਪਸ ਜਾਓ"', () => {
    // Bebe saw the "ਆਟੋਪੇ ਸੈੱਟਅੱਪ ਕਰੋ" link on the bill page, so the page is described by the newest text on it.
    const mind = new VisualMind(payBill(), BEBE);
    const autopay = paAutopayPage();
    const [, back] = walk(mind, [paBillPage(), autopay]);
    expect(back).toEqual({
      kind: 'act',
      action: { type: 'click', itemId: idOf(autopay, 'link', 'ਬਿੱਲ ਤੇ ਵਾਪਸ ਜਾਓ') },
      intentionId: 'open-form',
      recovery: true,
      thought: "This page says 'ਆਟੋਪੇ ਜਲਦੀ ਆ ਰਿਹਾ ਹੈ'. It isn't where I meant to go. I'll click 'ਬਿੱਲ ਤੇ ਵਾਪਸ ਜਾਓ' to go back.",
    });
  });
});

// ---------------------------------------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------------------------------------

describe('VisualMind determinism', () => {
  it('gives the same decisions for the same Sights', () => {
    const run = (params: VisualMindParams, sights: Sight[]) => walk(new VisualMind(payBill(), params), sights);
    expect(run(BEBE, bebeSights())).toEqual(run(BEBE, bebeSights()));
    const phantom = () => [enBillPage(), enAutopayPage(), enBillPage('en-bill-again')];
    expect(run(PHANTOM, phantom())).toEqual(run(PHANTOM, phantom()));
  });
});
