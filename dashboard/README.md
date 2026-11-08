# Dashboard

**Owner:** House Builder

The Haunt dashboard replays ghost runs and shows where the ghosts got stuck. It is a static React + Vite + TypeScript site. It never runs ghosts itself, and it makes no requests outside its own origin.

## Commands

Run these in `dashboard/`:

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Collect runs, then serve the dashboard at <http://localhost:3001> |
| `npm run build` | Collect runs, type-check, and build a static site into `dist/` |
| `npm run preview` | Serve the built `dist/` at <http://localhost:3001> |
| `npm test` | Unit, component, axe-core and property tests (Vitest) |
| `npm run test:properties` | Only the fast-check property tests |
| `npm run test:e2e` | Playwright checks against the built site (run `npx playwright install chromium` once first) |
| `npm run collect-runs` | Only the collect step |

The port is fixed at **3001** (the demo site uses 3000). If 3001 is taken, `dev` and `preview` stop with an error instead of picking another port.

## Where runs come from

Before `dev` and `build`, `scripts/collect-runs.ts` does this:

1. Deletes `public/runs/`, so deleted runs don't linger.
2. Finds every `run.json` under the repository's `runs/` folder, at any depth, including `runs/samples/`.
3. Copies each run folder (with its screenshots) to `public/runs/<same path>/`.
4. Validates each file against `contract/run-format.md` and writes `public/runs/index.json`.

It only reads `runs/` and never writes there. A file that fails validation is listed under **Restless files** on Home, with every problem in plain words. A later file with a `runId` that is already used is marked as a duplicate. `public/runs/` is generated and ignored by git.

The built site needs a static file host such as `npm run preview` or GitHub Pages. Opening `dist/index.html` from `file://` does not work, because browsers block module scripts and `fetch` there.

## Deep links

URLs use the hash, so they work on any static host:

| Screen | URL |
|---|---|
| Home | `#/` |
| Haunted Map | `#/haunt/<siteKey>/map` and `?ghost=listener` |
| Graveyard | `#/graveyard`, with `?site=<siteKey>&ghost=<ghost>` |
| Ghost Cam | `#/run/<runKey>/step/<n>` (`#/run/<runKey>` opens step 1) |
| Séance | `#/seance` and `#/seance/<runKey>/<question>` |
| Exorcise | `#/exorcise` and `#/exorcise/<beforeKey>/<afterKey>` |
| Spec Coverage | `#/coverage` |

`<runKey>` is the run's `runId`. `<siteKey>` is the site name in lowercase with other characters replaced by `-`. The Séance questions are `why-give-up`, `where-stuck`, `what-heard` and `what-helped`.

Example links with the sample runs:

- The Listener trapped in the payment dialog: <http://localhost:3001/#/run/2026-11-03-listener-pay-bill/step/9>
- Bebe finding untranslated text: <http://localhost:3001/#/run/2026-11-03-bebe-pay-bill/step/3>
- The Haunted Map with fog for The Phantom: <http://localhost:3001/#/haunt/lantern-bills-demo/map?ghost=phantom>
- Asking The Listener why it gave up: <http://localhost:3001/#/seance/2026-11-03-listener-pay-bill/why-give-up>

All URLs are built in `src/routes.ts`.

## Adding a live RunSource

All loading goes through `src/data/`. Screens call the hooks in `src/data/hooks.ts`, and the hooks call a `RunSource`:

```ts
interface RunSource {
  listRuns(): Promise<RunIndex>;                     // reject if the index can't be read
  loadRun(entry: RunIndexEntry): Promise<LoadedRun>; // never reject; return { ok: false, errors } instead
  screenshotUrl(run: Run, path: string): string | null;
}
```

To add a live source:

1. Write `src/data/liveSource.ts` that implements `RunSource`. Pass every run through `validateRun` from `src/data/validate.ts`, and resolve screenshots with `resolveScreenshotUrl` from `src/data/screenshots.ts` so paths stay inside the run folder.
2. Return it from `selectRunSource()` in `src/data/source.ts`. That is the only place a source is chosen, so no screen changes.
3. If it talks to another origin, update `connect-src` and `img-src` in the CSP in `vite.config.ts`.

## Design

The look follows `.kiro/steering/dashboard-design.md`. Colors live only in `src/styles/tokens.css` (mirrored in `tokens.ts` for the contrast test). Animation is in `src/styles/motion.css` and only runs when the user's system allows motion.

## Font licenses

Both fonts are installed from npm and bundled by Vite. Nothing is loaded from a CDN.

- **IM Fell English** (headings), by Igino Marini, via `@fontsource/im-fell-english`. SIL Open Font License 1.1.
- **Atkinson Hyperlegible** (body), by the Braille Institute, via `@fontsource/atkinson-hyperlegible`. SIL Open Font License 1.1.

The license texts are in `node_modules/@fontsource/*/LICENSE`.
