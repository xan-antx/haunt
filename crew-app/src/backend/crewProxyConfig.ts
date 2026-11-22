// Everything we assume about the Crew gateway's request signing lives in this one file.
//
// Documented (kiro.dev/docs/crew/apps): the gateway proxies /apps/{name}/api/* and signs each request
// with the header `X-Crew-Proxy: <timestamp>:<hmac-sha256>`.
//
// UNVERIFIED (design risk 8). Re-check items (a) to (d) against the Crew docs or a real gateway
// request before relying on them, and update the verifier test example when one changes:
//  (a) the source of the signing secret (assumed: the environment variable below, set by the operator)
//  (b) exactly what is signed (assumed: the string built by signedString below)
//  (c) the timestamp unit and tolerance (assumed: Unix seconds, 300 s either side of now)
//  (d) the status code the gateway itself returns when its own signing step fails (unknown, not relied on)
export const CREW_PROXY = {
  headerName: 'x-crew-proxy', // documented
  secretEnvVar: 'HAUNT_CREW_PROXY_SECRET', // UNVERIFIED (a)
  toleranceSeconds: 300, // UNVERIFIED (c)
  timestampUnit: 'seconds', // UNVERIFIED (c)
  // UNVERIFIED (b). Change this one function if the gateway signs something else.
  signedString(timestamp: string, method: string, pathWithQuery: string, body: string): string {
    return `${timestamp}.${method.toUpperCase()}.${pathWithQuery}.${body}`;
  },
} as const;
