import { createReadStream, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The folder `startFixtureServer` serves by default: `engine/test/fixtures`. */
export const FIXTURES_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bin': 'application/octet-stream',
};

export interface FixtureServer {
  /** `http://127.0.0.1:<port>` (no trailing slash). */
  readonly origin: string;
  readonly port: number;
  /** Builds a full URL for a path such as `/guard-probe.html`. */
  url(pathname: string): string;
  /** Paths requested so far (pathname only, in order). Useful to prove what did or did not arrive. */
  readonly requests: readonly string[];
  close(): Promise<void>;
}

/**
 * Starts a static file server on 127.0.0.1 with a random free port.
 * It serves the files of `root` (default `test/fixtures`) and nothing outside it.
 * `/` serves `index.html` when that file exists.
 */
export async function startFixtureServer(root: string = FIXTURES_DIR): Promise<FixtureServer> {
  const rootDir = path.resolve(root);
  const requests: string[] = [];

  const server: Server = createServer((req, res) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end('Bad request');
      return;
    }
    requests.push(pathname);

    let file = path.resolve(rootDir, `.${pathname}`);
    if (file !== rootDir && !file.startsWith(rootDir + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    try {
      if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!statSync(file).isFile()) throw new Error('not a file');
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = (server.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    port,
    url: (pathname) => `${origin}${pathname.startsWith('/') ? '' : '/'}${pathname}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
