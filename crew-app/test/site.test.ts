import { EventEmitter } from 'node:events';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSiteController, type ChildLike, type SiteDeps } from '../src/site.ts';

const root = path.resolve('/fake-site-root');

class FakeChild extends EventEmitter implements ChildLike {
  pid: number | undefined;
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed: (NodeJS.Signals | number | undefined)[] = [];
  constructor(pid: number) {
    super();
    this.pid = pid;
  }
  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed.push(signal);
    queueMicrotask(() => this.emit('exit', null));
    return true;
  }
}

interface Setup {
  deps: SiteDeps;
  spawned: { command: string; args: string[]; options: Parameters<SiteDeps['spawn']>[2]; child: FakeChild }[];
  taskkills: string[][];
  titles: (string | null)[];
}

function setup(options: { platform?: string; portBusy?: boolean; titles?: (string | null)[]; buildExit?: number | 'hang'; previewExits?: boolean } = {}): Setup {
  const spawned: Setup['spawned'] = [];
  const taskkills: string[][] = [];
  const titles = options.titles ?? ['Lantern Bills - Pay'];
  let clock = 0;
  const deps: SiteDeps = {
    spawn(command, args, spawnOptions) {
      const child = new FakeChild(100 + spawned.length);
      spawned.push({ command, args, options: spawnOptions, child });
      if (args[1] === 'build' && options.buildExit !== 'hang') {
        queueMicrotask(() => {
          child.stderr.emit('data', 'build says something\n');
          child.emit('exit', options.buildExit ?? 0);
        });
      }
      if (args[1] === 'preview' && options.previewExits) queueMicrotask(() => child.emit('exit', 1));
      return child;
    },
    portInUse: () => Promise.resolve(options.portBusy ?? false),
    fetchTitle: () => Promise.resolve(titles.length > 1 ? (titles.shift() as string | null) : (titles[0] ?? null)),
    sleep: () => {
      clock += 5_000;
      return Promise.resolve();
    },
    now: () => clock,
    platform: options.platform ?? 'win32',
    execFile: (command, args) => {
      taskkills.push([command, ...args]);
      return Promise.resolve();
    },
    killSync: () => undefined,
    mkdir: () => Promise.resolve(),
    exists: () => true,
    onProcessExit: () => () => undefined,
    readyTimeoutMs: 20_000,
    buildTimeoutMs: 50,
  };
  return { deps, spawned, taskkills, titles };
}

describe('site controller with a fake spawner', () => {
  it('builds, then previews with --strictPort, without a shell, and waits for the title', async () => {
    const s = setup({ titles: [null, '', 'Lantern Bills'] });
    const started = await createSiteController(root, s.deps).start();
    expect(started.ok).toBe(true);
    expect(s.spawned).toHaveLength(2);
    expect(s.spawned[0]?.args).toContain('build');
    expect(s.spawned[1]?.args).toEqual(expect.arrayContaining(['preview', '--strictPort', '--port', '3000']));
    for (const call of s.spawned) {
      expect(call.options.shell).toBe(false);
      expect(call.options.cwd).toBe(path.join(root, 'demo-site'));
      expect(call.options.env.HAUNT_UNDER_TEST).toBeUndefined();
    }
    expect(s.titles.length).toBeLessThan(3);
  });

  it('reports not started when the title never matches', async () => {
    const s = setup({ titles: ['Some other site'] });
    const started = await createSiteController(root, s.deps).start();
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.reason).toContain('Lantern Bills');
  });

  it('refuses to start when port 3000 is busy, without building', async () => {
    const s = setup({ portBusy: true });
    const started = await createSiteController(root, s.deps).start();
    expect(started).toMatchObject({ ok: false });
    if (!started.ok) expect(started.reason).toContain('Port 3000 is already in use');
    expect(s.spawned).toHaveLength(0);
  });

  it('reports a build failure with the reason and does not start the preview', async () => {
    const s = setup({ buildExit: 1 });
    const started = await createSiteController(root, s.deps).start();
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.reason).toContain('build says something');
    expect(s.spawned).toHaveLength(1);
  });

  it('reports a build that takes too long', async () => {
    const s = setup({ buildExit: 'hang' });
    const started = await createSiteController(root, s.deps).start();
    expect(started.ok).toBe(false);
    if (!started.ok) expect(started.reason).toContain('too long');
  });

  it('reports a preview that exits while starting', async () => {
    const s = setup({ previewExits: true, titles: [null] });
    const started = await createSiteController(root, s.deps).start();
    expect(started.ok).toBe(false);
  });

  it('stops the process tree with taskkill /T /F on win32', async () => {
    const s = setup({ platform: 'win32' });
    const started = await createSiteController(root, s.deps).start();
    if (!started.ok) throw new Error('expected the site to start');
    await started.stop();
    expect(s.taskkills).toEqual([['taskkill', '/pid', '101', '/T', '/F']]);
  });

  it('stops with SIGKILL elsewhere', async () => {
    const s = setup({ platform: 'linux' });
    const started = await createSiteController(root, s.deps).start();
    if (!started.ok) throw new Error('expected the site to start');
    await started.stop();
    expect(s.taskkills).toHaveLength(0);
    expect(s.spawned[1]?.child.killed).toEqual(['SIGKILL']);
  });
});
