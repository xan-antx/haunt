import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboardBaseUrl } from '../dashboardLink.ts';
import { CREW_PROXY } from './crewProxyConfig.ts';
import { handleRequest, type BackendFiles } from './handler.ts';

// The app root is two folders up from src/backend/. In the repository that is crew-app/; in an
// installed copy it is ~/.kiro/crew/apps/haunt-patrol/. The gateway passes no app-specific
// environment variables to a backend, so the data folder is found from this file's location only.
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = path.join(appRoot, 'data', 'patrols');

// Only these two names can ever be read.
const FIXED_FILES = { 'latest.json': path.join(dataDir, 'latest.json'), 'summary.md': path.join(dataDir, 'summary.md') } as const;

const files: BackendFiles = {
  async read(name) {
    try {
      return await readFile(FIXED_FILES[name], 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  },
};

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.once('error', reject);
  });
}

const server = createServer((req, res) => {
  void (async () => {
    try {
      const header = req.headers[CREW_PROXY.headerName];
      const response = await handleRequest(
        {
          method: req.method ?? 'GET',
          path: req.url ?? '/',
          body: await readBody(req),
          crewProxyHeader: typeof header === 'string' ? header : undefined,
        },
        files,
        {
          dashboardBaseUrl: dashboardBaseUrl(process.env),
          secret: process.env[CREW_PROXY.secretEnvVar],
          nowMs: Date.now(),
        },
      );
      res.writeHead(response.status, response.headers);
      res.end(response.body);
    } catch (error) {
      process.stderr.write(`Backend error: ${error instanceof Error ? error.message : String(error)}\n`);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{"error":"server_error"}');
    }
  })();
});

const port = Number(process.env.PORT ?? 0);
server.listen(port, '127.0.0.1');
