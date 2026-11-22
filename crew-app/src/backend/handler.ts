import { CREW_PROXY } from './crewProxyConfig.ts';
import { verifyCrewProxy } from './crewProxy.ts';
import { parseRecord, type PatrolRecord } from '../record.ts';

export interface BackendFiles {
  read(name: 'latest.json' | 'summary.md'): Promise<string | null>; // null when missing
}
export interface BackendResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface BackendRequest {
  method: string;
  path: string; // path and query as received, relative to the proxy prefix
  body: string; // raw request body ('' for GET and HEAD)
  crewProxyHeader: string | undefined; // value of X-Crew-Proxy
}
export interface BackendOptions {
  dashboardBaseUrl: string;
  secret: string | undefined;
  nowMs: number;
  /** Where rejection reasons go. Defaults to standard error. Never receives the secret or the header. */
  log?: (message: string) => void;
}

export function latestBody(record: PatrolRecord, dashboardBaseUrl: string): { record: PatrolRecord; dashboardBaseUrl: string } {
  return { record, dashboardBaseUrl };
}

export function summaryBody(summary: string): { summary: string } {
  return { summary };
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function json(status: number, value: string, head: boolean, extra: Record<string, string> = {}): BackendResponse {
  return { status, headers: { ...JSON_HEADERS, ...extra }, body: head ? '' : value };
}

/** Pure: no clock, environment or file access of its own. */
export async function handleRequest(req: BackendRequest, files: BackendFiles, options: BackendOptions): Promise<BackendResponse> {
  // 1. Method check first, on every path.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(405, '{"error":"method_not_allowed"}', false, { Allow: 'GET, HEAD' });
  }
  const head = req.method === 'HEAD';

  // 2. The unsigned health probe: exactly /health, nothing read.
  if (req.path === '/health') return json(200, '{"ok":true}', head);

  // 3. Verify the Crew proxy header before any file is read.
  const verdict = verifyCrewProxy({
    header: req.crewProxyHeader,
    secret: options.secret,
    nowMs: options.nowMs,
    method: req.method,
    path: req.path,
    body: req.body,
  });
  if (!verdict.ok) {
    (options.log ?? ((m: string) => console.error(m)))(`Rejected a request to ${CREW_PROXY.headerName}-protected route: ${verdict.reason}`);
    return json(401, '{"error":"unauthorized"}', head);
  }

  // 4. The two data routes, each mapped to one fixed file name.
  if (req.path === '/latest') {
    const text = await files.read('latest.json');
    if (text === null) return json(404, '{"error":"no_patrol"}', head);
    const parsed = parseRecord(text);
    if (!parsed.ok) return json(500, '{"error":"unreadable","file":"latest.json"}', head);
    return json(200, JSON.stringify(latestBody(parsed.record, options.dashboardBaseUrl)), head);
  }
  if (req.path === '/summary') {
    const text = await files.read('summary.md');
    if (text === null) return json(404, '{"error":"no_patrol"}', head);
    return json(200, JSON.stringify(summaryBody(text)), head);
  }
  return json(404, '{"error":"not_found"}', head);
}
