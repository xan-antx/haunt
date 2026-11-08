// An Invalid_Run: its file path and every validation error, in plain words.

import type { InvalidRun } from '../data/types';

export function runFilePath(folder: string): string {
  return folder ? `runs/${folder}/run.json` : 'runs/run.json';
}

export function RunErrorPanel({ invalid }: { invalid: InvalidRun }) {
  return (
    <section className="panel" aria-labelledby="run-error-heading">
      <h2 id="run-error-heading">What is wrong with this file</h2>
      <p>
        File: <code>{runFilePath(invalid.folder)}</code>
      </p>
      <ul>
        {invalid.errors.map((error, i) => (
          <li key={i}>
            <code>{error.path}</code>: {error.message}
          </li>
        ))}
      </ul>
      <p className="muted">Fix the file and run the dashboard again. Every other run still works.</p>
    </section>
  );
}
