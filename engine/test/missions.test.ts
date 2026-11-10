import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadMission,
  MissionLoadError,
  type Mission,
  type MissionProblem,
} from '../src/missions/loadMission.ts';
import { matchPatterns, type PatternSet } from '../src/missions/patterns.ts';
import { applyTemplates, futureExpiry } from '../src/missions/templates.ts';

/**
 * Unit tests for missions (Requirement 5).
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9**
 */

const ENGINE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const REPO_ROOT = path.resolve(ENGINE_ROOT, '..');
const MISSIONS_DIR = path.join(ENGINE_ROOT, 'missions');
const LANTERN_REQUIREMENTS = path.join(REPO_ROOT, '.kiro', 'specs', 'lantern-bills', 'requirements.md');

/** Reads the EARS text of Requirement 2, acceptance criterion 9 of the Lantern Bills spec. */
function readRequirement2Criterion9(): string {
  const lines = readFileSync(LANTERN_REQUIREMENTS, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => /^### Requirement 2:/.test(line));
  expect(start, 'Requirement 2 heading in lantern-bills/requirements.md').toBeGreaterThanOrEqual(0);
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i] as string;
    if (/^### /.test(line)) break; // next requirement: criterion 9 was not found
    const match = /^9\. (.*)$/.exec(line);
    if (match) return (match[1] as string).trimEnd();
  }
  throw new Error('Criterion 9 not found in Requirement 2');
}

describe('pay-bill mission', () => {
  it('loads from engine/missions with the expected shape', () => {
    const mission = loadMission(MISSIONS_DIR, 'pay-bill');
    expect(mission.id).toBe('pay-bill');
    expect(mission.site).toBe('lantern-bills');
    expect(mission.intentions.map((i) => i.id)).toEqual([
      'open-form',
      'card-number',
      'expiry',
      'cvv',
      'name',
      'submit',
      'confirm',
    ]);
    const values = Object.fromEntries(mission.intentions.filter((i) => i.do === 'type').map((i) => [i.id, i.value]));
    expect(values).toEqual({
      'card-number': '4111111111111111',
      expiry: '{{futureExpiry}}',
      cvv: '123',
      name: 'Asha Kaur',
    });
  });

  it('has a requirement equal, character for character, to Requirement 2 criterion 9 of Lantern Bills', () => {
    const mission = loadMission(MISSIONS_DIR, 'pay-bill');
    const expected = readRequirement2Criterion9();
    expect(expected).toContain('4000000000000002'); // guards against reading the wrong line
    expect(mission.requirement).toBe(expected);
  });

  it('uses the payment-success selector as its success check', () => {
    const mission = loadMission(MISSIONS_DIR, 'pay-bill');
    expect(mission.successCheck.visible).toBe('[data-haunt="payment-success"]');
  });
});

describe('{{futureExpiry}}', () => {
  const at = (iso: string) => new Date(iso);

  it('gives 11/28 for a November 2026 start', () => {
    expect(futureExpiry(at('2026-11-15T10:30:00Z'))).toBe('11/28');
    expect(applyTemplates('{{futureExpiry}}', at('2026-11-01T00:00:00Z'))).toBe('11/28');
  });

  it('keeps December as December', () => {
    expect(futureExpiry(at('2026-12-01T00:00:00Z'))).toBe('12/28');
    expect(futureExpiry(at('2026-12-31T23:59:59Z'))).toBe('12/28');
  });

  it('rolls into the next year on 1 January', () => {
    expect(futureExpiry(at('2027-01-01T00:00:00Z'))).toBe('01/29');
  });

  it('keeps two digits around the century', () => {
    expect(futureExpiry(at('2097-06-10T00:00:00Z'))).toBe('06/99');
    expect(futureExpiry(at('2098-12-31T23:59:59Z'))).toBe('12/00');
    expect(futureExpiry(at('2099-01-01T00:00:00Z'))).toBe('01/01');
    expect(futureExpiry(at('1999-12-31T23:59:59Z'))).toBe('12/01');
  });

  it('leaves values without the template untouched and replaces every occurrence', () => {
    const start = at('2026-11-15T00:00:00Z');
    expect(applyTemplates('4111111111111111', start)).toBe('4111111111111111');
    expect(applyTemplates('{{futureExpiry}} / {{futureExpiry}}', start)).toBe('11/28 / 11/28');
  });
});

describe('invalid mission files', () => {
  let dir: string;
  let valid: Mission;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'haunt-missions-'));
    valid = loadMission(MISSIONS_DIR, 'pay-bill');
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Writes a mission file (a mutated copy of pay-bill unless `raw` is given) and returns its problems. */
  function problemsFor(
    fileId: string,
    mutate?: (draft: Record<string, any>) => void,
    raw?: string,
  ): MissionProblem[] {
    const sub = mkdtempSync(path.join(dir, 'case-'));
    const draft = structuredClone(valid) as unknown as Record<string, any>;
    draft.id = fileId;
    mutate?.(draft);
    writeFileSync(path.join(sub, `${fileId}.json`), raw ?? JSON.stringify(draft, null, 2), 'utf8');
    try {
      loadMission(sub, fileId);
    } catch (error) {
      expect(error).toBeInstanceOf(MissionLoadError);
      return (error as MissionLoadError).problems;
    }
    throw new Error('Expected the mission to be rejected');
  }

  const has = (problems: MissionProblem[], pathName: string) =>
    expect(problems.map((p) => p.path)).toContain(pathName);

  it('accepts an unchanged copy of pay-bill (control)', () => {
    const sub = mkdtempSync(path.join(dir, 'ok-'));
    writeFileSync(path.join(sub, 'copy.json'), JSON.stringify({ ...valid, id: 'copy' }), 'utf8');
    expect(loadMission(sub, 'copy').id).toBe('copy');
  });

  it('rejects do:"type" without value, naming intentions[1].value', () => {
    const problems = problemsFor('no-value', (m) => {
      delete m.intentions[1].value;
    });
    has(problems, 'intentions[1].value');
  });

  it('rejects an id that differs from the file name, naming id', () => {
    const problems = problemsFor('file-name', (m) => {
      m.id = 'other-name';
    });
    has(problems, 'id');
  });

  it('rejects a name pattern that is not a valid regular expression, naming its path', () => {
    const problems = problemsFor('bad-regex', (m) => {
      m.intentions[0].target.en = ['^pay( this bill$'];
    });
    has(problems, 'intentions[0].target.en[0]');
    const doneWhenProblems = problemsFor('bad-regex-done', (m) => {
      m.intentions[0].doneWhen.present.en = ['ok', '(['];
    });
    has(doneWhenProblems, 'intentions[0].doneWhen.present.en[1]');
  });

  it('rejects a missing successCheck, naming successCheck', () => {
    const problems = problemsFor('no-check', (m) => {
      delete m.successCheck;
    });
    has(problems, 'successCheck');
  });

  it('rejects an unknown target kind, naming intentions[2].target.kind', () => {
    const problems = problemsFor('bad-kind', (m) => {
      m.intentions[2].target.kind = 'slider';
    });
    has(problems, 'intentions[2].target.kind');
  });

  it('rejects an extra top-level field and an extra intention field', () => {
    has(
      problemsFor('extra-top', (m) => {
        m.colour = 'orange';
      }),
      'colour',
    );
    has(
      problemsFor('extra-inner', (m) => {
        m.intentions[3].retries = 3;
      }),
      'intentions[3].retries',
    );
  });

  it('rejects an empty intentions list and a wrong do value', () => {
    has(
      problemsFor('no-intentions', (m) => {
        m.intentions = [];
      }),
      'intentions',
    );
    has(
      problemsFor('bad-do', (m) => {
        m.intentions[0].do = 'hover';
      }),
      'intentions[0].do',
    );
  });

  it('rejects a missing file, naming $', () => {
    const sub = mkdtempSync(path.join(dir, 'missing-'));
    let caught: unknown;
    try {
      loadMission(sub, 'nothing-here');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MissionLoadError);
    const problems = (caught as MissionLoadError).problems;
    has(problems, '$');
    expect(problems[0]?.message).toMatch(/does not exist/);
  });

  it('rejects a file that is not JSON, naming $', () => {
    const problems = problemsFor('not-json', undefined, '{ "id": "not-json", ');
    has(problems, '$');
    expect(problems[0]?.message).toMatch(/not valid JSON/);
  });

  it('rejects a mission id that is not a valid key without touching the disk', () => {
    expect(() => loadMission(dir, '../pay-bill')).toThrow(MissionLoadError);
  });

  it('puts the JSON path and the problem in the error message', () => {
    const sub = mkdtempSync(path.join(dir, 'message-'));
    const draft = { ...structuredClone(valid), id: 'message' } as Record<string, any>;
    delete draft.successCheck;
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(sub, 'message.json'), JSON.stringify(draft), 'utf8');
    expect(() => loadMission(sub, 'message')).toThrow(/successCheck: is required/);
  });
});

describe('pay-bill patterns', () => {
  const mission = loadMission(MISSIONS_DIR, 'pay-bill');
  const byId = (id: string) => {
    const intention = mission.intentions.find((i) => i.id === id);
    if (!intention) throw new Error(`No intention ${id}`);
    return intention;
  };
  const submit = byId('submit').target as PatternSet;
  const openForm = byId('open-form').target as PatternSet;

  it('submit patterns match "Submit" but not "Pay this bill"', () => {
    expect(matchPatterns('Submit', submit, ['en'])).toMatchObject({ lang: 'en' });
    expect(matchPatterns('Pay this bill', submit, ['en'])).toBeNull();
    expect(matchPatterns('Pay this bill', submit, ['pa', 'hi', 'en'])).toBeNull();
  });

  it('open-form patterns match "Pay this bill"', () => {
    expect(matchPatterns('Pay this bill', openForm, ['en'])).toMatchObject({ lang: 'en' });
    expect(matchPatterns('  pay   THIS\u00a0bill ', openForm, ['en'])).toMatchObject({ lang: 'en' });
  });

  it('falls back from pa to en when the Punjabi patterns do not match', () => {
    const match = matchPatterns('Pay this bill', openForm, ['pa', 'hi', 'en']);
    expect(match).not.toBeNull();
    expect(match?.lang).toBe('en');
    // Without the fallback in the caller's list, en is still tried last.
    expect(matchPatterns('Pay this bill', openForm, ['pa'])?.lang).toBe('en');
  });

  it('matches Punjabi text through the pa patterns first', () => {
    const match = matchPatterns('ਬਿੱਲ ਭਰੋ', openForm, ['pa', 'hi', 'en']);
    expect(match?.lang).toBe('pa');
  });
});
