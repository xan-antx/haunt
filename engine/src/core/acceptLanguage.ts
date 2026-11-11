import type { BrowserProfile } from './types.ts';

/** The part of a CDP session `applyAcceptLanguage` uses. A Playwright `CDPSession` fits. */
export interface AcceptLanguageCdp {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/** The profile's `Accept-Language` header value (key matched case-insensitively), or `undefined`. */
export function profileAcceptLanguage(profile: Pick<BrowserProfile, 'extraHTTPHeaders'>): string | undefined {
  const headers = profile.extraHTTPHeaders ?? {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === 'accept-language') return value;
  }
  return undefined;
}

/**
 * Makes the page behind `cdp` send the profile's `Accept-Language` header (Requirement 17.1: Bebe's
 * `pa-IN,pa;q=0.9`). Playwright's `locale` option sets Chromium's accept-language to the bare locale
 * (`pa-IN`) through a user-agent override, and that override replaces an `Accept-Language` given in
 * `extraHTTPHeaders`. So this sets the user-agent override again with the profile's languages, keeping the
 * page's current user agent. It also makes `navigator.languages` follow the same list (`pa-IN`, `pa`).
 * A profile without an `Accept-Language` header sends nothing. Call it before the first navigation.
 */
export async function applyAcceptLanguage(
  cdp: AcceptLanguageCdp,
  profile: Pick<BrowserProfile, 'extraHTTPHeaders' | 'userAgent'>,
): Promise<void> {
  const acceptLanguage = profileAcceptLanguage(profile);
  if (acceptLanguage === undefined) return;
  let userAgent = profile.userAgent;
  if (userAgent === undefined) {
    const evaluated = (await cdp.send('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true })) as {
      result?: { value?: unknown };
    };
    userAgent = typeof evaluated.result?.value === 'string' ? evaluated.result.value : '';
  }
  await cdp.send('Emulation.setUserAgentOverride', { userAgent, acceptLanguage: languageList(acceptLanguage) });
}

/**
 * The header's languages without q-values (`pa-IN,pa;q=0.9` gives `pa-IN,pa`). Chromium's override
 * takes this bare list and adds descending q-values itself, so `pa-IN,pa` is sent as `pa-IN,pa;q=0.9`.
 */
export function languageList(acceptLanguage: string): string {
  return acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0]?.trim() ?? '')
    .filter((lang) => lang.length > 0)
    .join(',');
}
