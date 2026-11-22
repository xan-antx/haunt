import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { latestBody, summaryBody } from './backend/handler.ts';
import { parseRecord, serializeRecord, type PatrolRecord } from './record.ts';
import { selectPrevious, type PreviousState } from './summary.ts';

export interface PatrolStore {
  loadPrevious(currentDate: string): Promise<PreviousState>;
  writeRecord(record: PatrolRecord): Promise<void>;
  writeSummary(summary: string): Promise<void>;
  exportStatic(record: PatrolRecord, summary: string, dashboardBaseUrl: string): Promise<void>;
}

const DATED = /^\d{4}-\d{2}-\d{2}\.json$/;

async function atomicWrite(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, file);
}

export function createPatrolStore(repoRoot: string): PatrolStore {
  const dataDir = path.join(repoRoot, 'crew-app', 'data', 'patrols');
  const staticDir = path.join(repoRoot, 'crew-app', 'ui', 'dist', 'data');
  return {
    async loadPrevious(currentDate) {
      let names: string[];
      try {
        names = await readdir(dataDir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'none' };
        throw error;
      }
      const dates = names.filter((n) => DATED.test(n)).map((n) => n.slice(0, -'.json'.length));
      const date = selectPrevious(currentDate, dates);
      if (date === null) return { kind: 'none' };
      try {
        const parsed = parseRecord(await readFile(path.join(dataDir, `${date}.json`), 'utf8'));
        return parsed.ok ? { kind: 'record', record: parsed.record } : { kind: 'unreadable', date };
      } catch {
        return { kind: 'unreadable', date };
      }
    },
    async writeRecord(record) {
      const text = serializeRecord(record);
      await atomicWrite(path.join(dataDir, `${record.date}.json`), text);
      await atomicWrite(path.join(dataDir, 'latest.json'), text);
    },
    async writeSummary(summary) {
      await atomicWrite(path.join(dataDir, 'summary.md'), summary);
    },
    async exportStatic(record, summary, dashboardBaseUrl) {
      await atomicWrite(path.join(staticDir, 'latest.json'), JSON.stringify(latestBody(record, dashboardBaseUrl)));
      await atomicWrite(path.join(staticDir, 'summary.json'), JSON.stringify(summaryBody(summary)));
    },
  };
}
