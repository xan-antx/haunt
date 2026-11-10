import { describe, expect, it } from 'vitest';
import { isAllowedAddress, refusalMessage, refusedHost } from '../src/config/address.ts';

/**
 * Unit tests for the Allowed_Address check (Requirement 4).
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 */

const config = { allowedDomains: ['lantern-bills.example.org'] };

describe('isAllowedAddress: allowed', () => {
  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:5173/x',
    'http://LOCALHOST',
    'https://localhost',
    'https://localhost:8443/path?q=1#frag',
    'https://127.0.0.1',
    'http://lantern-bills.example.org',
    'https://lantern-bills.example.org/pay',
    'http://LANTERN-bills.Example.org:8080/',
  ])('allows %s', (address) => {
    expect(isAllowedAddress(address, config)).toBe(true);
  });

  it('allows only localhost and 127.0.0.1 when allowedDomains is empty', () => {
    expect(isAllowedAddress('http://localhost', { allowedDomains: [] })).toBe(true);
    expect(isAllowedAddress('http://127.0.0.1', { allowedDomains: [] })).toBe(true);
    expect(isAllowedAddress('http://lantern-bills.example.org', { allowedDomains: [] })).toBe(false);
  });
});

describe('isAllowedAddress: refused', () => {
  it.each([
    ['IPv6 loopback', 'http://[::1]'],
    ['IPv6 loopback with port', 'http://[::1]:3000/'],
    ['unspecified address', 'http://0.0.0.0'],
    ['user name and password', 'http://user:pw@localhost'],
    ['user name only', 'http://user@localhost'],
    ['password only', 'http://:pw@127.0.0.1'],
    ['ftp scheme', 'ftp://localhost'],
    ['file scheme', 'file:///etc/passwd'],
    ['trailing dot', 'http://localhost.'],
    ['subdomain of an allowed domain', 'http://www.lantern-bills.example.org'],
    ['parent of an allowed domain', 'http://example.org'],
    ['look-alike suffix', 'http://evil-lantern-bills.example.org'],
    ['allowed domain only in the user info', 'http://lantern-bills.example.org@example.com/'],
    ['javascript: URL', 'javascript:alert(1)'],
    ['data: URL', 'data:text/html,<p>hi</p>'],
    ['not allowed host', 'http://example.com'],
    ['other loopback address', 'http://127.0.0.2'],
    ['empty string', ''],
    ['spaces only', '   '],
    ['garbage', 'not a url'],
    ['host without a scheme', 'localhost:3000'],
    ['scheme without a host', 'http://'],
  ])('refuses %s (%s)', (_label, address) => {
    expect(isAllowedAddress(address, config)).toBe(false);
  });
});

describe('refusal message', () => {
  it.each([
    ['http://example.com', 'example.com'],
    ['http://[::1]', '[::1]'],
    ['http://0.0.0.0/admin', '0.0.0.0'],
    ['http://www.lantern-bills.example.org', 'www.lantern-bills.example.org'],
    ['http://localhost.', 'localhost.'],
    ['ftp://localhost', 'localhost'],
    ['not a url', 'not a url'],
    ['javascript:alert(1)', 'javascript:alert(1)'],
  ])('for %s names "%s", mentions allowedDomains and the config file', (address, named) => {
    const message = refusalMessage(address);
    expect(refusedHost(address)).toBe(named);
    expect(message).toContain(`"${named}"`);
    expect(message).toContain('allowedDomains');
    expect(message).toContain('engine/haunt.config.json');
  });

  it('does not repeat a password in the message', () => {
    expect(refusalMessage('http://user:secret-pw@localhost')).not.toContain('secret-pw');
  });
});
