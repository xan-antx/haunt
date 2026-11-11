import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fieldLabel, VisualMind } from '../src/ghosts/visual/mind.ts';
import { loadMission, type Mission } from '../src/missions/loadMission.ts';
import type { SeenItem, Sight } from '../src/page/sight.ts';

/**
 * Smoke tests for the shared visual Mind. The scripted Lantern Bills walks are in task 17.2.
 * **Validates: Requirements 14.1, 14.3, 14.5, 18.1**
 */

const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function payBill(): Mission {
  const mission = loadMission(path.join(ENGINE_ROOT, 'missions'), 'pay-bill');
  return JSON.parse(JSON.stringify(mission).replaceAll('{{futureExpiry}}', '11/28')) as Mission;
}

let nextId = 0;
function item(look: SeenItem['look'], text: string, x: number, y: number, w = 120, h = 24): SeenItem {
  nextId++;
  return { id: `s${nextId}`, look, text, box: { x, y, w, h } };
}

function sight(pathName: string, items: SeenItem[], hash = `h-${pathName}-${items.length}`): Sight {
  return { path: pathName, viewport: { w: 360, h: 640 }, screenshot: Buffer.alloc(0), screenshotHash: hash, items };
}

describe('VisualMind', () => {
  it('finds a field by the text just above it, not by text far away', () => {
    const field = item('field', '', 16, 200, 300, 40);
    const label = item('text', 'Card Number', 16, 170, 100, 20);
    const far = item('text', 'Expiry Date', 16, 100, 100, 20);
    expect(fieldLabel(field, [far, label, field])).toBe('Card Number');
    expect(fieldLabel(field, [far, field])).toBeNull();
  });

  it('The Phantom clicks "Pay this bill", then recovers from an unexpected page with "Back to bill"', () => {
    const mind = new VisualMind(payBill(), { languages: ['en'], pointer: 'tap' });
    const pay = item('button', 'Pay this bill', 16, 170, 132, 48);
    const first = mind.decide(sight('/', [item('text', 'Your Electricity Bill', 16, 80), pay]));
    expect(first).toMatchObject({ kind: 'act', action: { type: 'click', itemId: pay.id }, intentionId: 'open-form' });
    expect(first.thought).toContain("I can see 'Pay this bill'. I'll tap it.");

    const back = item('link', 'Back to bill', 16, 300);
    const second = mind.decide(sight('/autopay', [item('text', 'Autopay coming soon', 16, 80, 200, 40), back]));
    expect(second).toMatchObject({ kind: 'act', action: { type: 'click', itemId: back.id }, recovery: true });
  });

  it('Bebe tries Punjabi first and falls back to English', () => {
    const mind = new VisualMind(payBill(), { languages: ['pa', 'hi', 'en'] });
    const pay = item('button', 'Pay this bill', 16, 170);
    const decision = mind.decide(sight('/', [item('text', 'ਤੁਹਾਡਾ ਬਿਜਲੀ ਬਿੱਲ', 16, 80), pay]));
    expect(decision).toMatchObject({ kind: 'act', action: { type: 'click', itemId: pay.id } });
    expect(decision.thought).toContain("The button says 'Pay this bill' in English, not Punjabi, but I can make it out.");
  });

  it('waits on an empty Sight, scrolls down then up, then gives up with no_match', () => {
    const mind = new VisualMind(payBill(), { languages: ['en'] });
    expect(mind.decide(sight('/', []))).toMatchObject({ action: { type: 'wait' } });
    const text = [item('text', 'Nothing here', 16, 80)];
    expect(mind.decide(sight('/', text, 'a'))).toMatchObject({ action: { type: 'scroll', dir: 'down' } });
    expect(mind.decide(sight('/', text, 'b'))).toMatchObject({ action: { type: 'scroll', dir: 'down' } });
    expect(mind.decide(sight('/', text, 'b'))).toMatchObject({ action: { type: 'scroll', dir: 'up' } });
    expect(mind.decide(sight('/', text, 'a'))).toMatchObject({ action: { type: 'scroll', dir: 'up' } });
    const end = mind.decide(sight('/', text, 'a'));
    expect(end).toMatchObject({ kind: 'give_up', reason: 'no_match' });
    expect(end.thought).toContain("I've looked from the top of this page to the bottom and back");
  });
});
