import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processPayment } from '../payment';

describe('processPayment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('succeeds for an ordinary card and charges the bill amount', async () => {
    const promise = processPayment('4111111111111111', false, 2490);
    await vi.advanceTimersByTimeAsync(800);
    await expect(promise).resolves.toEqual({
      success: true,
      totalCharged: 2490,
      addOnIncluded: false,
    });
  });

  it('adds ₹99 when the add-on is included', async () => {
    const promise = processPayment('4111111111111111', true, 2490);
    await vi.advanceTimersByTimeAsync(800);
    await expect(promise).resolves.toEqual({
      success: true,
      totalCharged: 2589,
      addOnIncluded: true,
    });
  });

  it('fails for the magic failure card 4000000000000002', async () => {
    const promise = processPayment('4000000000000002', true, 2490);
    await vi.advanceTimersByTimeAsync(800);
    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.totalCharged).toBe(0);
  });

  it('recognises the failure card when typed with spaces', async () => {
    const promise = processPayment('4000 0000 0000 0002', false, 2490);
    await vi.advanceTimersByTimeAsync(800);
    expect((await promise).success).toBe(false);
  });

  it('does not resolve before 800ms', async () => {
    let settled = false;
    const promise = processPayment('4111111111111111', false, 2490).then(result => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(799);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(settled).toBe(true);
  });
});
