import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AiRunDriver } from './driver.ts';
import { parseToolCall } from './tools.ts';
import type { ToolResult } from './tools.ts';

/*
 * The Bridge (design: "Bridge").
 *
 * An HTTP server on 127.0.0.1 that the haunt-mcp process calls. It listens on a random port and
 * wants a bearer token on every request. A request with a missing or wrong token gets 401 and never
 * reaches the driver. Only `POST /tool` exists; anything else gets 404.
 */

export interface Bridge {
  /** `http://127.0.0.1:<port>` */
  readonly url: string;
  /** 32 random bytes, hex. */
  readonly token: string;
  close(): Promise<void>;
}

/** The part of the driver the Bridge uses, so tests can pass a fake. */
export type BridgeDriver = Pick<AiRunDriver, 'handle'>;

/** Largest request body the Bridge reads. */
export const MAX_BODY_BYTES = 64 * 1024;

const HOST = '127.0.0.1';

/** Compares two strings in constant time, whatever their lengths. */
function sameToken(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearerOf(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer (.*)$/.exec(header);
  return match ? (match[1] ?? '') : null;
}

function send(response: ServerResponse, status: number, body: ToolResult | { error: string }): void {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  response.end(text);
}

/** Reads the body up to the limit. Resolves `null` when it is larger. */
function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooBig = true;
        chunks.length = 0;
        return;
      }
      if (!tooBig) chunks.push(chunk);
    });
    request.on('end', () => resolve(tooBig ? null : Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

export function startBridge(driver: BridgeDriver, opts: { token?: string } = {}): Promise<Bridge> {
  const token = opts.token ?? randomBytes(32).toString('hex');

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      if (!response.headersSent) send(response, 500, { error: error instanceof Error ? error.message : String(error) });
      else response.destroy();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const isTool = request.method === 'POST' && (request.url ?? '').split('?')[0] === '/tool';

    // Only `POST /tool` exists. Everything else is 404, with or without a token.
    if (!isTool) {
      request.resume();
      send(response, 404, { error: 'Not found.' });
      return;
    }
    const given = bearerOf(request);
    if (given === null || !sameToken(given, token)) {
      request.resume();
      send(response, 401, { error: 'Unauthorized.' });
      return;
    }

    const raw = await readBody(request);
    if (raw === null) {
      send(response, 413, { ok: false, error: `The request is larger than ${MAX_BODY_BYTES} bytes.` });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      send(response, 400, { ok: false, error: 'The request body is not valid JSON.' });
      return;
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload) || typeof (payload as { name?: unknown }).name !== 'string') {
      send(response, 400, { ok: false, error: 'The request needs a "name" string and an "args" object.' });
      return;
    }

    const { name, args } = payload as { name: string; args?: unknown };
    const parsed = parseToolCall(name, args);
    if (!parsed.ok) {
      send(response, 400, { ok: false, error: parsed.error });
      return;
    }
    send(response, 200, await driver.handle(parsed.call));
  }

  return new Promise<Bridge>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The Bridge could not read its port.'));
        return;
      }
      resolve({
        url: `http://${HOST}:${address.port}`,
        token,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          }),
      });
    });
  });
}
