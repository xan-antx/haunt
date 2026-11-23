import { describe, expect, it } from 'vitest';
import { AiRunDriver, kiroStoppedSentence, RUN_ENDED } from '../src/mind/ai/driver.ts';
import { AiMindMemory, CONTINUE_PROMPT_ACTIONS } from '../src/mind/ai/memory.ts';
import { ENGINE_ERROR_PREFIX } from '../src/core/stepPipeline.ts';
import { FakeBody, FakeDetectors, makeDriver } from './helpers/aiFakes.ts';

/**
 * Unit tests for the AI run driver, with a fake Body and fake detectors. No browser and no Kiro.
 * **Validates: Requirements 1.8, 4.4, 4.6, 5.5**
 */

describe('AiRunDriver', () => {
  it('records Step 1 when it starts and goes on', async () => {
    const { driver, body, recorder } = makeDriver();
    await driver.start();
    expect(body.opened).toEqual(['http://127.0.0.1:5173/']);
    expect(recorder.steps).toHaveLength(1);
    expect(driver.outcome).toBeNull();
  });

  it('ends with gave_up and reason no_match when the agent calls finish', async () => {
    const { driver, detectors, recorder } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'press_key', key: 'Tab' });
    const result = await driver.handle({ name: 'finish' });
    expect(result.ok).toBe(true);
    expect(driver.outcome).toEqual({ result: 'gave_up', reason: 'no_match' });
    expect(await driver.ended).toEqual({ result: 'gave_up', reason: 'no_match' });
    expect(detectors.finished).toBe(1);
    expect(recorder.last?.step.thought).toContain('I tried 1 thing with the keyboard and could not finish what I came to do.');
  });

  it('ends with gave_up when Kiro exits with code 0 before the run ended', async () => {
    const { driver } = makeDriver();
    await driver.start();
    expect(await driver.endExternally({ kind: 'exit', code: 0 })).toEqual({ result: 'gave_up', reason: 'no_match' });
  });

  it('writes why Kiro stopped into the last thought when it gives up after relaunches', async () => {
    const { driver, recorder } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'press_key', key: 'Tab' });
    await driver.endExternally({ kind: 'exit', code: 0, launches: 6 });
    expect(recorder.last?.step.thought).toBe(
      'I press Tab and listen. I tried 1 thing with the keyboard and could not finish what I came to do. ' +
        kiroStoppedSentence(6),
    );
    expect(kiroStoppedSentence(6)).toContain('6 times before the run was over (the first launch and 5 relaunches)');
    expect(kiroStoppedSentence(2)).toContain('the first launch and 1 relaunch)');
  });

  it('does not mention Kiro in the last thought when the agent calls finish', async () => {
    const { driver, recorder } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'finish' });
    expect(recorder.last?.step.thought).not.toContain('Kiro');
  });

  it('settled() waits for a queued tool call before it reports the outcome', async () => {
    const { driver } = makeDriver({ stopAtSteps: 2 });
    await driver.start();
    const pending = driver.handle({ name: 'press_key', key: 'Tab' });
    expect(await driver.settled()).toEqual({ result: 'gave_up', reason: 'trapped' });
    await pending;
  });

  it('settled() is null while the run goes on', async () => {
    const { driver } = makeDriver();
    await driver.start();
    expect(await driver.settled()).toBeNull();
  });

  it('builds the continue prompt from the actions and what was heard, never from findings', async () => {
    const { driver } = makeDriver({ detectors: new FakeDetectors({ findWhen: () => true }) });
    await driver.start();
    expect(driver.continuePrompt('Pay the bill')).toContain('You have not pressed any keys yet.');
    await driver.handle({ name: 'press_key', key: 'Tab' });
    await driver.handle({ name: 'type_text', text: '4111 1111 1111 1111' });
    const prompt = driver.continuePrompt('Pay the bill');
    expect(prompt.split('\n')).toEqual([
      'Continue the mission. Your goal: Pay the bill',
      'Your last session ended before the task was done. The page is still open exactly where you left it.',
      'What you did so far:',
      '1. Press Tab. You heard: "spoken: Press Tab"',
      '2. Type text. You heard: "spoken: Type text"',
      'Call read_page now to hear where you are, then keep going with the tools, one action at a time.',
      'Do not answer with text alone. Only call finish if you truly cannot go on.',
    ]);
    expect(prompt).not.toMatch(/finding|unlabeled|4111/i);
  });

  it('ends with an error that names the code when Kiro exits with a non-zero code', async () => {
    const { driver, recorder } = makeDriver();
    await driver.start();
    const outcome = await driver.endExternally({ kind: 'exit', code: 7 });
    expect(outcome.result).toBe('error');
    expect(outcome.errorMessage).toContain('7');
    expect(recorder.last?.step.thought).toContain(ENGINE_ERROR_PREFIX);
  });

  it('ends with an error that names the limit on a timeout', async () => {
    const { driver } = makeDriver();
    await driver.start();
    const outcome = await driver.endExternally({ kind: 'timeout', ms: 600000 });
    expect(outcome.result).toBe('error');
    expect(outcome.errorMessage).toContain('600000');
  });

  it('keeps the first outcome when the run has already ended', async () => {
    const { driver } = makeDriver({ successAtCall: 2 });
    await driver.start();
    await driver.handle({ name: 'press_key', key: 'Enter' });
    expect(driver.outcome).toEqual({ result: 'succeeded' });
    expect(await driver.endExternally({ kind: 'exit', code: 1 })).toEqual({ result: 'succeeded' });
  });

  it('refuses every call after the end and does not touch the Body', async () => {
    const { driver, body } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'finish' });
    const actsBefore = body.acts.length;
    const perceivesBefore = body.perceives;
    for (const call of [
      { name: 'read_page' },
      { name: 'read_announcements' },
      { name: 'press_key', key: 'Tab' },
      { name: 'type_text', text: 'x' },
      { name: 'jump', to: 'heading', dir: 'next' },
      { name: 'think', text: 'x' },
      { name: 'finish' },
    ] as const) {
      expect(await driver.handle(call)).toEqual({ ok: false, error: RUN_ENDED });
    }
    expect(body.acts.length).toBe(actsBefore);
    expect(body.perceives).toBe(perceivesBefore);
  });

  it('records a non-empty fallback thought for a step with no think call', async () => {
    const { driver, recorder } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'press_key', key: 'Tab' });
    await driver.handle({ name: 'type_text', text: 'my secret card number' });
    await driver.handle({ name: 'jump', to: 'heading', dir: 'next' });
    const thoughts = recorder.steps.slice(1).map((r) => r.step.thought);
    expect(thoughts).toEqual([
      'I press Tab and listen.',
      'I type some text and listen.',
      'I jump to the next heading and listen.',
    ]);
  });

  it('puts each thought on the action that follows it, and on no other', async () => {
    const { driver, recorder } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'think', text: 'I press Tab to leave the CVV field.' });
    await driver.handle({ name: 'press_key', key: 'Tab' });
    // No think before this action: it gets the plain fallback, not the thought of the step before.
    await driver.handle({ name: 'type_text', text: 'Asha Kaur' });
    await driver.handle({ name: 'think', text: 'I type my name.' });
    await driver.handle({ name: 'think', text: 'I type my name into the cardholder field.' });
    await driver.handle({ name: 'type_text', text: 'Asha Kaur' });
    expect(recorder.steps.slice(1).map((r) => [r.step.action, r.step.thought])).toEqual([
      ['Press Tab', 'I press Tab to leave the CVV field.'],
      ['Type text', 'I type some text and listen.'],
      ['Type text', 'I type my name into the cardholder field.'],
    ]);
  });

  it('keeps a thought for the next action when a read comes between the think and the action', async () => {
    const { driver, recorder } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'think', text: 'I jump to the next field.' });
    await driver.handle({ name: 'read_page' });
    await driver.handle({ name: 'read_announcements' });
    await driver.handle({ name: 'jump', to: 'field', dir: 'next' });
    expect(recorder.steps[1]?.step.thought).toBe('I jump to the next field.');
  });

  it('records the AI intention id and no recovery flag', async () => {
    const { driver, recorder } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'press_key', key: 'Tab' });
    expect(recorder.steps[0]?.intention).toBeUndefined();
    expect(recorder.steps[1]?.intention).toEqual({ intentionId: 'ai-mind', recovery: false });
  });

  it('perceives by itself before an action when the agent has not read the page', async () => {
    const { driver, body, recorder } = makeDriver();
    await driver.start();
    await driver.handle({ name: 'press_key', key: 'Tab' });
    expect(body.perceives).toBe(1);
    expect(recorder.steps[1]?.probe.at).toBe(1001);
  });

  it('never returns a Probe, a StepTrace or a Finding in a tool result', async () => {
    const { driver } = makeDriver({ detectors: new FakeDetectors({ findWhen: () => true }) });
    await driver.start();
    const results = [
      await driver.handle({ name: 'read_page' }),
      await driver.handle({ name: 'read_announcements' }),
      await driver.handle({ name: 'think', text: 'I look around.' }),
      await driver.handle({ name: 'press_key', key: 'Tab' }),
      await driver.handle({ name: 'type_text', text: 'hello' }),
      await driver.handle({ name: 'jump', to: 'button', dir: 'next' }),
    ];
    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual(['ok', result.ok ? 'text' : 'error']);
      const text = result.ok ? result.text : result.error;
      expect(typeof text).toBe('string');
      expect(text).not.toMatch(/probe|trace|finding|actionEndedAt|readyAt|itemKeys/i);
    }
  });

  it('answers one call at a time, in order', async () => {
    const order: string[] = [];
    class SlowBody extends FakeBody {
      override async act(action: Parameters<FakeBody['act']>[0]) {
        order.push(`start ${action.type === 'key' ? action.key : action.type}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const result = await super.act(action);
        order.push(`end ${action.type === 'key' ? action.key : action.type}`);
        return result;
      }
    }
    const { driver } = makeDriver({ body: new SlowBody() });
    await driver.start();
    await Promise.all([
      driver.handle({ name: 'press_key', key: 'Tab' }),
      driver.handle({ name: 'press_key', key: 'Enter' }),
    ]);
    expect(order).toEqual(['start Tab', 'end Tab', 'start Enter', 'end Enter']);
  });

  it('turns a failing open into an error outcome with no step', async () => {
    const body = new FakeBody();
    body.open = async () => {
      throw new Error('net::ERR_CONNECTION_REFUSED\nCall log: ...');
    };
    const { driver, recorder } = makeDriver({ body });
    await driver.start();
    expect(driver.outcome).toEqual({ result: 'error', errorMessage: 'net::ERR_CONNECTION_REFUSED' });
    expect(recorder.steps).toHaveLength(0);
  });

  it('lists only the last actions in a long continue prompt, numbered from the start, with long speech cut', () => {
    const memory = new AiMindMemory();
    for (let i = 1; i <= 14; i += 1) memory.recordAction({ action: `Action ${i}`, spoken: i === 14 ? 'x'.repeat(500) : `heard ${i}` });
    const lines = memory.continuePrompt('Pay the bill').split('\n');
    expect(lines).toContain(`Your last ${CONTINUE_PROMPT_ACTIONS} of 14 actions so far:`);
    expect(lines.some((line) => line.startsWith('4. '))).toBe(false);
    expect(lines).toContain('5. Action 5. You heard: "heard 5"');
    const last = lines.find((line) => line.startsWith('14. '))!;
    expect(last.length).toBeLessThan(260);
    expect(last.endsWith('…"')).toBe(true);
  });

  it('is an AiRunDriver whose ended promise resolves with the outcome', async () => {
    const { driver } = makeDriver({ stopAtSteps: 2, stopReason: 'trapped' });
    expect(driver).toBeInstanceOf(AiRunDriver);
    await driver.start();
    const result = await driver.handle({ name: 'press_key', key: 'Tab' });
    expect(result).toEqual({ ok: true, text: RUN_ENDED });
    expect(await driver.ended).toEqual({ result: 'gave_up', reason: 'trapped' });
  });
});
