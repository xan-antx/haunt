import type { HauntConfig } from './loadConfig.ts';

/** Hosts that are always allowed, besides the entries of `allowedDomains`. */
const ALWAYS_ALLOWED_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

function parse(raw: string): URL | undefined {
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

/**
 * Tells whether the Engine may visit `raw`.
 *
 * The address must parse as a URL, use `http:` or `https:`, carry no user name or password,
 * and its host (already lowercased and punycoded by the URL parser) must be `localhost`,
 * `127.0.0.1` or exactly an entry of `config.allowedDomains`.
 * `[::1]`, `0.0.0.0`, `localhost.` and subdomains of a listed domain are refused.
 */
export function isAllowedAddress(raw: string, config: Pick<HauntConfig, 'allowedDomains'>): boolean {
  const url = parse(raw);
  if (!url) return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;

  const host = url.hostname;
  if (host === '') return false;
  return ALWAYS_ALLOWED_HOSTS.includes(host) || config.allowedDomains.includes(host);
}

/**
 * The host to name in a refusal message. Falls back to the raw text when it is not a URL
 * or has no host, so the message always names what was refused.
 */
export function refusedHost(raw: string): string {
  const host = parse(raw)?.hostname;
  return host ? host : raw;
}

/** Plain-words message printed when `raw` is not an Allowed_Address. */
export function refusalMessage(raw: string): string {
  return (
    `Refused to visit "${refusedHost(raw)}". ` +
    'Ghosts only visit sites we own. ' +
    'To allow a domain you own, add it to allowedDomains in engine/haunt.config.json.'
  );
}
