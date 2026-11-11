import type { BrowserProfile } from './types.ts';

/** The part of a CDP session `applyThrottling` uses. A Playwright `CDPSession` fits. */
export interface ThrottlingCdp {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Applies the profile's network and CPU throttling to the page behind `cdp` (the design's
 * `applyThrottling(cdp, profile)`, used by The Phantom only). A profile without `throttling` sends nothing.
 *
 * Network throttling is Chromium's own (`Network.enable`, then `Network.emulateNetworkConditions`), so it
 * applies to every request of the page, including the ones the request guard's `context.route` lets
 * through: the guard only matches blocked URLs. CPU throttling is `Emulation.setCPUThrottlingRate`.
 * Call it after the page is created and before the first navigation.
 */
export async function applyThrottling(cdp: ThrottlingCdp, profile: Pick<BrowserProfile, 'throttling'>): Promise<void> {
  const network = profile.throttling?.network;
  if (network) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: network.latencyMs,
      downloadThroughput: network.downloadBytesPerSecond,
      uploadThroughput: network.uploadBytesPerSecond,
      ...(network.connectionType === undefined ? {} : { connectionType: network.connectionType }),
    });
  }
  const cpuRate = profile.throttling?.cpuRate;
  if (cpuRate !== undefined) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
}
