import { createHash } from 'node:crypto';

// Everything we know about the Crew gateway's request signing lives in this one file.
//
// Source: docs/app-kit/api-reference.md in kirodotdev/KiroCrew, sections "Reverse Proxy Authentication"
// and "Backend Environment Variables" (checked 2026-11-23).
//  - The gateway proxies /apps/{name}/api/{path} to the backend as /api/{path} and signs each request
//    with the header `X-KiroCrew-Proxy: <timestamp>:<hmac-sha256>`. (kiro.dev/docs/crew/apps still
//    names it `X-Crew-Proxy`; the repository reference and its Node.js verifier use `X-KiroCrew-Proxy`.)
//  - The HMAC is keyed with the per-app secret, which the gateway passes to the backend process in
//    the environment variable KIROCREW_PROXY_SECRET. The backend never reads a secret file.
//  - The signed message is `timestamp:method:/api/path[?query]:sha256(body)`, where the target is the
//    raw request-target (Node's req.url) and sha256(body) is the lowercase hex digest of the raw body.
//  - The timestamp is Unix seconds and must be within 60 seconds of now. Compare in constant time.
//
// Not used: the optional replay-proof v2 headers (X-KiroCrew-Proxy-V2 and X-KiroCrew-Proxy-Nonce).
// v1 stays valid; the backend serves read-only GET and HEAD requests on loopback.
//
// Still unknown: the status code the gateway itself returns when its own signing step fails. Not relied on.
export const CREW_PROXY = {
  headerName: 'x-kirocrew-proxy',
  secretEnvVar: 'KIROCREW_PROXY_SECRET',
  toleranceSeconds: 60,
  timestampUnit: 'seconds',
  signedString(timestamp: string, method: string, target: string, body: string): string {
    const bodyHash = createHash('sha256').update(body, 'utf8').digest('hex');
    return `${timestamp}:${method}:${target}:${bodyHash}`;
  },
} as const;
