import type { BrowserContext, BrowserContextOptions } from 'playwright';
import { isAllowedAddress } from './address.ts';
import type { HauntConfig } from './loadConfig.ts';

/**
 * Context options every guarded browser context must be created with.
 * `serviceWorkers: 'block'` stops a page from registering a service worker, which could
 * otherwise fetch from a host the guard never sees.
 */
export const GUARDED_CONTEXT_OPTIONS = {
  serviceWorkers: 'block',
} as const satisfies BrowserContextOptions;

/** Where blocked URLs are reported. Defaults to standard error. */
export type GuardLog = (message: string) => void;

type GuardConfig = Pick<HauntConfig, 'allowedDomains'>;

/** These schemes carry their content in the URL itself and cause no network request. */
const NON_NETWORK_PROTOCOLS: readonly string[] = ['data:', 'blob:', 'about:'];

function defaultLog(message: string): void {
  process.stderr.write(`${message}\n`);
}

/**
 * Tells whether the guard must block `raw`: true for anything that is not an
 * Allowed_Address, except `data:`, `blob:` and `about:` URLs.
 * `ws:` and `wss:` are judged as `http:` and `https:` with the same host.
 */
export function isBlockedUrl(raw: string, config: GuardConfig): boolean {
  let protocol: string;
  try {
    protocol = new URL(raw).protocol;
  } catch {
    return true;
  }
  if (NON_NETWORK_PROTOCOLS.includes(protocol)) return false;
  if (protocol === 'ws:' || protocol === 'wss:') {
    return !isAllowedAddress(`${protocol === 'ws:' ? 'http:' : 'https:'}${raw.slice(protocol.length)}`, config);
  }
  return !isAllowedAddress(raw, config);
}

/**
 * Blocks every request, navigation and WebSocket to a host that is not an Allowed_Address,
 * and reports each blocked URL through `log` (standard error by default).
 *
 * Only URLs that are blocked match the routes. Allowed traffic is never touched, so the
 * guard does not change timing or network conditions for it.
 * Create the context with {@link GUARDED_CONTEXT_OPTIONS} so service workers are blocked too.
 */
export async function installGuard(
  context: BrowserContext,
  config: GuardConfig,
  log: GuardLog = defaultLog,
): Promise<void> {
  await context.route(
    (url) => isBlockedUrl(url.toString(), config),
    async (route) => {
      log(`Blocked request to ${route.request().url()}`);
      // The page may already be gone by the time the request is aborted.
      await route.abort('blockedbyclient').catch(() => undefined);
    },
  );

  await context.routeWebSocket(
    (url) => isBlockedUrl(url.toString(), config),
    async (ws) => {
      log(`Blocked WebSocket to ${ws.url()}`);
      // Closing without connectToServer() means nothing reaches the remote host.
      await ws.close({ code: 1008, reason: 'Blocked by Haunt: host is not an allowed address' }).catch(() => undefined);
    },
  );
}
