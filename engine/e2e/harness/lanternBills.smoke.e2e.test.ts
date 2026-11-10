import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startLanternBills, type LanternBills } from './lanternBills.ts';

function isListening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value: boolean): void => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

describe('Lantern_Bills_Harness smoke test', () => {
  let bills: LanternBills | undefined;

  beforeAll(async () => {
    bills = await startLanternBills();
  });

  afterAll(async () => {
    await bills?.stop();
  });

  it('serves the home page and the client-side routes with HTTP 200', async () => {
    for (const route of ['/', '/autopay', '/confirmation']) {
      const response = await fetch(`${bills!.url}${route}`);
      expect(response.status, route).toBe(200);
      expect(await response.text(), route).toContain('<div id="root">');
    }
  });

  it('answers on 127.0.0.1 or ::1 so that localhost works', async () => {
    const [v4, v6] = await Promise.all([isListening('127.0.0.1', 3000), isListening('::1', 3000)]);
    expect(v4 || v6).toBe(true);
  });

  it('stops the server, frees port 3000, can be stopped twice, and leaves demo-site/ unchanged', async () => {
    await bills!.stop();
    await bills!.stop();
    expect(await isListening('127.0.0.1', 3000)).toBe(false);
    expect(await isListening('::1', 3000)).toBe(false);
    await bills!.assertDemoSiteUnchanged();
    expect(await bills!.gitStatusNow()).toBe(bills!.gitStatusBefore);
  });
});
