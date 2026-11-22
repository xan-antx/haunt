import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { NO_ANNOUNCEMENTS } from '../src/mind/ai/driver.ts';
import { FakeBody, makeDriver } from './helpers/aiFakes.ts';

/**
 * Feature: listener-ai-mind, Property 3: Announcements are delivered exactly once, in order
 * **Validates: Requirements 1.7**
 */
const RUNS = { numRuns: 100 };

const announcement = fc.stringMatching(/^[a-z][a-z0-9 ,.]{0,20}$/);
const perceptions = fc.array(fc.array(announcement, { maxLength: 3 }), { minLength: 10, maxLength: 10 });
const ops = fc.array(fc.constantFrom('read_page', 'read_announcements'), { maxLength: 10 });

describe('Feature: listener-ai-mind, Property 3: Announcements are delivered exactly once, in order', () => {
  it('delivers every announcement once, in the order the perceptions produced them', async () => {
    await fc.assert(
      fc.asyncProperty(perceptions, ops, async (lists, sequence) => {
        const { driver } = makeDriver({ body: new FakeBody({ announcements: lists }) });
        await driver.start();

        const delivered: string[] = [];
        const drain = async (): Promise<void> => {
          const result = await driver.handle({ name: 'read_announcements' });
          expect(result.ok).toBe(true);
          if (result.ok && result.text !== NO_ANNOUNCEMENTS) delivered.push(...result.text.split('\n'));
        };

        let pages = 0;
        for (const op of sequence) {
          if (op === 'read_page') {
            const page = await driver.handle({ name: 'read_page' });
            expect(page.ok).toBe(true);
            pages += 1;
          } else {
            await drain();
          }
        }
        await drain();

        expect(delivered).toEqual(lists.slice(0, pages).flat());
      }),
      RUNS,
    );
  });
});
