# Dashboard

**Owner:** House Builder

The Haunt dashboard replays ghost runs and shows where the ghosts got stuck. It is a static React + Vite + TypeScript site, and it makes no requests outside its own origin. The built site never runs ghosts. Only `npm run dev` adds one local-only endpoint, for the **Summon a live ghost** button (see below).

## Commands

Run these in `dashboard/`:

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Collect runs, then serve the dashboard at <http://localhost:3001>, with the live ghost button working |
| `npm run build` | Collect runs, type-check, and build a static site into `dist/` |
| `npm run preview` | Serve the built `dist/` at <http://localhost:3001> |
| `npm test` | Unit, component, axe-core and property tests (Vitest) |
| `npm run test:properties` | Only the fast-check property tests |
| `npm run test:e2e` | Playwright checks against a build of the fixed test runs in `fixtures/runs/` (run `npx playwright install chromium` once first, and make sure nothing is listening on port 3001) |
| `npm run build:e2e` / `npm run preview:e2e` | Build and serve only `fixtures/runs/`, into `.e2e/` (used by `test:e2e`; `dist/` and `public/runs/` are untouched) |
| `npm run collect-runs` | Only the collect step |

The port is fixed at **3001** (the demo site uses 3000). If 3001 is taken, `dev` and `preview` stop with an error instead of picking another port. Stop a server with Ctrl+C in the terminal that started it; on Windows, closing the terminal can leave the server holding its port.

`npm run dev` prints a long warning about `configLoader: 'native'`. It is about import paths in the Vite config and does not affect anything; set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` in the environment to hide it.

## Summon a live ghost

Needs `npm install` in `dashboard/`, `demo-site/` and `engine/`, and `npx playwright install chromium` in `engine/`.

With `npm run dev`, the button on Home starts Lantern Bills on port 3000 if nothing is there (built into `dashboard/.live/`), runs The Listener on the `pay-bill` mission through the engine's CLI (Scripted mind; the same as `npm run haunt -- run --ghost listener --mission pay-bill --url http://localhost:3000` in `engine/`), writes the run into `runs/`, adds it to the dashboard, and stops the site again if it started it. Progress shows on Home. If Lantern Bills is already running on port 3000, it is used and left running; anything else on that port stops the job.

Only requests from your own computer are accepted (loopback address, local host name, this page's origin, and an `x-haunt-summon` header). The ghost, mission and address are fixed in `scripts/liveGhost.ts`. `npm run build` and the published site have no such endpoint, so there the button explains that live ghosts run on your own computer and shows `cd dashboard` and `npm run dev`.

## Where runs come from

Before `dev` and `build`, `scripts/collect-runs.ts` does this:

1. Deletes `public/runs/`, so deleted runs don't linger.
2. Finds every `run.json` under the repository's `runs/` folder, at any depth, including `runs/samples/`.
3. Copies each run folder (with its screenshots) to `public/runs/<same path>/`.
4. Validates each file against `contract/run-format.md` and writes `public/runs/index.json`.

It only reads `runs/` and never writes there. A file that fails validation is listed under **Restless files** on Home, with every problem in plain words. A later file with a `runId` that is already used is marked as a duplicate. `public/runs/` is generated and ignored by git.

Real runs win over samples. Once a ghost has a real run (anywhere under `runs/` except `runs/samples/`), its samples are left out of every list; a link that names one still opens it. Samples of ghosts with no real run yet stay, labelled **Sample run**.

Some tests read the recorded runs. The data-logic tests (`datalogic.test.tsx`, `phase4.test.tsx` and the shared `fixtures/samples.ts`) load every `run.json` under `runs/`, so a new run in `runs/` changes which run counts as "latest" and makes some of them fail. If you record trial runs, use `--out` with a folder outside `runs/` (see the root README), or move them out before you run `npm test`. The Playwright suite (`npm run test:e2e`) builds and serves only `fixtures/runs/` (see its README). A later task will point the data-logic tests at a frozen copy of the recorded runs.

The built site needs a static file host such as `npm run preview` or GitHub Pages. Opening `dist/index.html` from `file://` does not work, because browsers block module scripts and `fetch` there.

## Deep links

URLs use the hash, so they work on any static host:

The dashboard has six screens. Five are in the menu: Home, Ghost Cam, Graveyard, Exorcise and Spec Coverage. The sixth, "A real-world haunt", opens from a link at the bottom of Home. "Ask this ghost" is a panel in the Ghost Cam, and "Map" is a view of the Graveyard.

| Screen or view | URL |
|---|---|
| Home | `#/` |
| Ghost Cam | `#/run/<runKey>/step/<n>` (`#/run/<runKey>` opens step 1) |
| Ghost Cam with "Ask this ghost" open | `#/run/<runKey>/step/<n>?ask=open`, or `?ask=<question>` to show that answer |
| Graveyard (tombstones) | `#/graveyard`, with `?site=<siteKey>&ghost=<ghost>` |
| Graveyard (map) | `#/graveyard?view=map`, with the same `site` and `ghost` filters (the ghost filter fogs rooms that ghost never entered) |
| Exorcise | `#/exorcise` and `#/exorcise/<beforeKey>/<afterKey>` |
| Spec Coverage | `#/coverage` |

`<runKey>` is the run's `runId`. `<siteKey>` is the site name in lowercase with other characters replaced by `-`. The questions are `why-give-up`, `where-stuck`, `what-heard` and `what-helped`. The `what-heard` question is "What did you hear?" for The Listener and "What were you thinking?" for The Phantom and Bebe, who see the page and hear nothing.

Old links still work. Each one replaces itself with the place that holds its content now:

| Old link | Opens |
|---|---|
| `#/haunt/<siteKey>/map?ghost=<ghost>` | `#/graveyard?site=<siteKey>&ghost=<ghost>&view=map` |
| `#/seance` | The Ghost Cam's default step (The Listener's newest real run at its keyboard trap, step 26 today) with `?ask=open` |
| `#/seance/<runKey>/<question>` | That run's key step (where the ghost was blocked, else its last step, or for a run that made it through, its first problem) with `?ask=<question>` |

Example links:

- The Listener trapped in the "Protect your payment" dialog (real run): <http://localhost:3001/#/run/2026-11-10T1822Z-listener-pay-bill/step/20>
- Asking The Listener where it got stuck: <http://localhost:3001/#/run/2026-11-10T1822Z-listener-pay-bill/step/20?ask=where-stuck>
- Bebe finding untranslated text (sample run): <http://localhost:3001/#/run/2026-11-03-bebe-pay-bill/step/3>
- The Graveyard map with fog for The Phantom: <http://localhost:3001/#/graveyard?site=lantern-bills-demo&ghost=phantom&view=map>
- The Listener sample (hidden from lists now, still opens): <http://localhost:3001/#/run/2026-11-03-listener-pay-bill/step/9>

Home opens with what the ghosts found, one card per ghost with a "Watch it happen" button. "Take the 60-second tour" walks through the results, the Ghost Cam, the Graveyard, Exorcise and Spec Coverage; Escape or Skip leaves it at any time.

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
