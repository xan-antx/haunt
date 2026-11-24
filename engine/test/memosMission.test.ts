import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { expandMission } from '../src/cli/main.ts';
import { loadConfig } from '../src/config/loadConfig.ts';
import { finalizeRun } from '../src/core/finalize.ts';
import { Recorder } from '../src/core/recorder.ts';
import { formatRunId } from '../src/core/runId.ts';
import { listenerGhost } from '../src/ghosts/listener/index.ts';
import { loadMission } from '../src/missions/loadMission.ts';

/**
 * The `memos` site, the `write-note` mission and the Memos behavior spec.
 * **Validates: Requirements 1.1, 1.2, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.9**
 */
const ENGINE = fileURLToPath(new URL('..', import.meta.url));
const REPO = path.resolve(ENGINE, '..');
const SPEC = path.join(REPO, '.kiro', 'specs', 'memos-real-world-haunt', 'memos-behavior.md');
const MISSION_FILE = path.join(ENGINE, 'missions', 'write-note.json');

interface SpecRequirement {
  id: string;
  text: string;
}

/** The `## MEMOS-n: Title` sections of the spec, each with its body text. */
function specRequirements(): SpecRequirement[] {
  const text = readFileSync(SPEC, 'utf8').replace(/\r\n/g, '\n');
  const parts = text.split(/^## (MEMOS-\d+):.*$/m);
  const out: SpecRequirement[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) out.push({ id: parts[i]!, text: parts[i + 1]!.trim().replace(/\s+/g, ' ') });
  return out;
}

const sentences = (text: string): number => (text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? []).length;

describe('Memos behavior spec', () => {
  it('has MEMOS-n requirements of at most three sentences each', () => {
    const list = specRequirements();
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const r of list) {
      expect(r.id).toMatch(/^MEMOS-\d+$/);
      expect(sentences(r.text), r.id).toBeGreaterThan(0);
      expect(sentences(r.text), r.id).toBeLessThanOrEqual(3);
      expect(r.text, r.id).toMatch(/\b(WHEN|WHILE|THE)\b/);
    }
  });

  it('states that Tab and Shift+Tab move focus out of the note editor, and writes and saves a note', () => {
    const list = specRequirements();
    const focus = list.find((r) => /Tab/.test(r.text) && /Shift\+Tab/.test(r.text) && /editor/.test(r.text));
    expect(focus).toBeDefined();
    expect(list.some((r) => /Save/.test(r.text) && /new memo/.test(r.text))).toBe(true);
    expect(list.some((r) => /accessible name/.test(r.text) && /editor/.test(r.text))).toBe(true);
  });
});

describe('write-note mission', () => {
  const mission = loadMission(path.join(ENGINE, 'missions'), 'write-note');

  it('loads, belongs to memos, and cites a requirement of the spec with its text', () => {
    expect(mission.id).toBe('write-note');
    expect(mission.site).toBe('memos');
    const match = /^(MEMOS-\d+): (.+)$/s.exec(mission.requirement);
    expect(match).not.toBeNull();
    const cited = specRequirements().find((r) => r.id === match![1]);
    expect(cited).toBeDefined();
    expect(match![2]!.replace(/\s+/g, ' ')).toBe(cited!.text);
  });

  it('has the five intentions, with the note field as an unnamed-field last resort', () => {
    expect(mission.intentions.map((i) => i.id)).toEqual(['username', 'password', 'sign-in', 'note', 'save']);
    const note = mission.intentions.find((i) => i.id === 'note')!;
    expect(note.lastResort).toBe('unnamedField');
    expect(note.do).toBe('type');
    expect(note.value).toBe('Haunt was here {{runStamp}}');
  });

  it('keeps the Throwaway_Account credentials in the mission file only', () => {
    expect(readFileSync(MISSION_FILE, 'utf8')).toContain('ghost-test');
    expect(readFileSync(MISSION_FILE, 'utf8')).toContain('HauntTest123!');
    const roots = [path.join(ENGINE, 'src'), path.join(ENGINE, 'missions'), path.join(ENGINE, 'haunt.config.json'), SPEC];
    const files: string[] = [];
    const walk = (p: string): void => {
      if (statSync(p).isDirectory()) for (const name of readdirSync(p)) walk(path.join(p, name));
      else files.push(p);
    };
    roots.forEach(walk);
    for (const file of files) {
      if (path.resolve(file) === path.resolve(MISSION_FILE)) continue;
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toContain('HauntTest123!');
      expect(text, file).not.toContain('ghost-test');
    }
  });

  it('expands the stamp into the goal and the success check, and the run file shows the cited requirement', () => {
    const start = new Date(Date.UTC(2026, 10, 22, 11, 16, 5));
    const expanded = expandMission(mission, start);
    expect(expanded.goal).toContain('Haunt was here 20261122-111605');
    expect(expanded.successCheck.visible).toContain('Haunt was here 20261122-111605');
    expect(expanded.intentions.find((i) => i.id === 'note')!.value).toBe('Haunt was here 20261122-111605');

    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    recorder.add(
      {
        actionText: 'Open http://localhost:5230',
        spoken: '',
        focusBox: null,
        screenshot: Buffer.from('png'),
        trace: { pathBefore: '/', pathAfter: '/', keys: [], touchedKeys: [], actionEndedAt: 0, readyAt: 0, waits: [], announcements: [] },
      },
      'Listening.',
    );
    const { run } = finalizeRun({
      runId: formatRunId(start, 'listener', 'write-note'),
      ghost: 'listener',
      mind: 'scripted',
      mission: expanded,
      site: { name: 'Memos' },
      url: 'http://localhost:5230',
      commit: 'abc1234',
      startedAt: start,
      result: 'gave_up',
      recorder,
      findings: [],
      screenshotSize: { width: 800, height: 600 },
    });
    expect(run.mission.requirement).toBe(mission.requirement);
    expect(run.mission.goal).toContain('20261122-111605');
  });

  it('has a success check that matches a saved memo card and not the editor', async () => {
    const start = new Date(Date.UTC(2026, 10, 22, 11, 16, 5));
    const { successCheck } = expandMission(mission, start);
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const note = 'Haunt was here 20261122-111605';
      await page.setContent(
        `<main><div id="editor" role="textbox" contenteditable="true"><p>${note}</p></div></main>`,
      );
      expect(await page.locator(successCheck.visible).count()).toBe(0);
      await page.setContent(
        `<main><div id="editor" role="textbox" contenteditable="true"><p></p></div>` +
          `<div class="memo-card"><div class="memo-content"><p>${note}</p></div></div></main>`,
      );
      expect(await page.locator(successCheck.visible).count()).toBe(1);
      await page.setContent(`<main><div class="memo-card"><p>${note} and more</p></div></main>`);
      expect(await page.locator(successCheck.visible).count()).toBe(0);
    } finally {
      await browser.close();
    }
  }, 30_000);
});

describe('memos site and The Listener', () => {
  it('has a memos entry with the local base URL', () => {
    const config = loadConfig();
    expect(config.sites['memos']).toEqual({ name: 'Memos', allowedTerms: ['Memos'], baseUrl: 'http://localhost:5230' });
    expect(config.sites['lantern-bills']).toBeDefined();
  });

  it('has the focus_trap and unlabeled_field detectors', () => {
    const types = listenerGhost.detectors().map((d) => d.type);
    expect(types).toContain('focus_trap');
    expect(types).toContain('unlabeled_field');
  });
});
