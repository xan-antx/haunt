# Haunt

**Haunt your app before your users do.**

Haunt sends three synthetic "ghost" users into a website to finish a task, then shows on a candlelit dashboard where each ghost got stuck. Built for the Kiroween 2026 hackathon, Costume Contest category.

## Live links

- Dashboard: https://xan-antx.github.io/haunt/
- Demo site, Lantern Bills: https://xan-antx.github.io/haunt/lantern-bills/

## Real runs

All three ghosts have a real run on Lantern Bills, recorded by the engine and shown in the dashboard. Each ghost has one real run in the repo, so these are single runs, not statistics.

| Ghost | Mission | Result | Run in the live dashboard |
|---|---|---|---|
| The Listener | Pay a bill | Gave up | [2026-11-10T1822Z-listener-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-10T1822Z-listener-pay-bill) |
| The Phantom | Pay a bill | Gave up | [2026-11-11T1744Z-phantom-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-11T1744Z-phantom-pay-bill) |
| Bebe | Pay a bill | Succeeded | [2026-11-11T1744Z-bebe-pay-bill](https://xan-antx.github.io/haunt/#/run/2026-11-11T1744Z-bebe-pay-bill) |

The run folders are in [`dashboard/public/runs/lantern-bills/`](dashboard/public/runs/lantern-bills). Two hand-made sample runs (`runs/samples/`) are also in the repo. The dashboard hides a ghost's sample once that ghost has a real run.

## Judge Quick Start (60 seconds)

1. Open the [live dashboard](https://xan-antx.github.io/haunt/).
2. Press **Take the 60-second tour**. It walks through the main screens.
3. Open the [live Lantern Bills demo site](https://xan-antx.github.io/haunt/lantern-bills/) and try to pay a bill yourself. Use only the keyboard, or add `?lang=pa` or `?lang=hi` to the address, and see what the ghosts ran into.
4. Back in the dashboard, open a ghost's run in the Ghost Cam and compare it with what you just did.

## The engine

The engine (`engine/`) drives one ghost through one mission in a real Chromium browser with Playwright, and writes a `run.json` folder (steps, screenshots, findings) that the dashboard reads. The format is defined in [`contract/run-format.md`](contract/run-format.md), and the engine checks every run against it before saving. It needs Node.js 24 or newer.

Run a ghost against Lantern Bills. Start the demo site first (`cd demo-site`, `npm install`, `npm run dev`, serves on port 3000), then in another terminal:

```
cd engine
npm install
npx playwright install chromium
npx haunt run --ghost listener --mission pay-bill --url http://localhost:3000
```

`--ghost` is `listener`, `phantom` or `bebe`. The last line printed is the path of the saved `run.json`. The engine refuses any address other than `localhost`, `127.0.0.1` and domains in its config. See [engine/README.md](engine/README.md) for every option, exit code and test command.

## Run it locally

You need a current Node.js LTS. There is no root `package.json`, so install and run each app in its own folder.

```
cd demo-site
npm install
npm run dev        # http://localhost:3000
```

```
cd dashboard
npm install
npm run dev        # http://localhost:3001
```

Both ports are fixed. If one is taken, the server stops with an error. See [dashboard/README.md](dashboard/README.md) for how run files get into the dashboard.

## What Haunt is

### The three ghosts

- **The Listener** moves through a page with only the keyboard and listens to what a screen reader would announce.
- **The Phantom** browses on slow 3G and an old phone.
- **Bebe** reads at 200% zoom, prefers Punjabi or Hindi, and watches out for tricky wording.

Each ghost stands for real people with real needs. A ghost that gets stuck points to a real barrier, so we never weaken a test to make a ghost pass.

### The demo site

Lantern Bills (`demo-site/`) is an electricity bill-payment site in English, Punjabi and Hindi. It has six deliberate accessibility and usability problems for the ghosts to find. They stay in on purpose, and tests guard them.

### The dashboard

The dashboard (`dashboard/`) is a static React and Vite site. It only reads run files and never runs a ghost.

| Screen | What it shows |
|---|---|
| **Home** | Each haunted site, the latest result for each ghost, recent walks, and the 60-second tour. Run files that cannot be read are listed as "Restless files" with the reasons. |
| **Graveyard** | One tombstone per problem found, filterable by site and ghost. A map view shows one room per page the ghosts visited, with a cold spot where a ghost got stuck. Each tombstone links to the moment it happened. |
| **Ghost Cam** | A step-by-step replay of one run: the screenshot, where the ghost's focus was, what it said, and what it thought. The Listener's spoken lines can be read aloud. An ask panel answers four questions about the run from the run file: why it gave up, where it got stuck, what it heard, and what helped. |
| **Exorcise** | Compares a run before a fix with a run after it, by the same ghost on the same mission. The repo has one real run per ghost, so there is no real before and after pair yet. |
| **Spec Coverage** | Each mission is one requirement. Shows whether each ghost's latest run completed it. |

The reproduce command in the dashboard (`npx haunt run ...`) is the real engine command. The **Summon a live ghost** button on Home is disabled. The dashboard is static and cannot start the engine.

## Tests

Counts come from running the suites on 2026-11-22. Commands run in the folder named in the first column.

| Folder | Command | Tests |
|---|---|---|
| `engine/` | `npm test` | 855 in 45 files |
| `dashboard/` | `npm test` | 399 in 35 files |
| `demo-site/` | `npm test` | 123 in 18 files |
| `dashboard/` | `npm run test:e2e` (Playwright, run `npx playwright install chromium` once) | 150 in 8 files, counted with `npx playwright test --list`, not run for this README |
| `engine/` | `npm run test:e2e` (all three ghosts against Lantern Bills, slow) | 22 listed by `npx vitest list --config vitest.e2e.config.ts`, not run for this README |

The unit suites total 1,377 tests, and all of them passed. One run of the dashboard suite, started while the other two suites ran at the same time, had 2 failures. A rerun on its own passed all 399.

## How we built it with Kiro

Every row points to a file in this repo.

### Specs (`.kiro/specs/`)

| Spec | Purpose | Files |
|---|---|---|
| `lantern-bills` | The demo site and its six planted problems | [requirements](.kiro/specs/lantern-bills/requirements.md), [design](.kiro/specs/lantern-bills/design.md), [tasks](.kiro/specs/lantern-bills/tasks.md) |
| `haunt-dashboard` | The dashboard and its screens | [requirements](.kiro/specs/haunt-dashboard/requirements.md), [design](.kiro/specs/haunt-dashboard/design.md), [tasks](.kiro/specs/haunt-dashboard/tasks.md) |
| `haunt-engine` | The engine and the three ghosts | [requirements](.kiro/specs/haunt-engine/requirements.md), [design](.kiro/specs/haunt-engine/design.md), [tasks](.kiro/specs/haunt-engine/tasks.md) |
| `exorcise-different-ghost-fix` | A bugfix spec: Exorcise must not compare runs by different ghosts | [bugfix](.kiro/specs/exorcise-different-ghost-fix/bugfix.md), [design](.kiro/specs/exorcise-different-ghost-fix/design.md), [tasks](.kiro/specs/exorcise-different-ghost-fix/tasks.md) |

### Steering (`.kiro/steering/`)

| File | What it does |
|---|---|
| [product.md](.kiro/steering/product.md) | The three ghosts, ethics rules (own sites only, respectful personas, never weaken a test) |
| [structure.md](.kiro/steering/structure.md) | Who owns each folder and how data flows from `runs/` to the dashboard |
| [tech.md](.kiro/steering/tech.md) | TypeScript, Node LTS, Playwright, React with Vite, and file-editing rules |
| [demo-site.md](.kiro/steering/demo-site.md) | Loads when working in `demo-site/`. Keeps the six planted problems in place unless a bugfix spec names them |
| [dashboard-design.md](.kiro/steering/dashboard-design.md) | The dashboard's colors with measured contrast ratios, fonts, ghost designs, what each spooky element means, motion limits |

### Hooks (`.kiro/hooks/`)

| Hook | Trigger | What it does |
|---|---|---|
| [Build check](.kiro/hooks/build-check.json) | After a spec task finishes | Runs `npm run build` in each changed project folder ([script](.kiro/hooks/scripts/build-check.mjs)) |
| [Contract guard](.kiro/hooks/contract-guard.json) | Before a file write, move or delete | Asks for confirmation before anything in `contract/` changes ([script](.kiro/hooks/scripts/contract-guard.mjs)) |
| [Planted problems guard](.kiro/hooks/planted-problems-guard.json) | When the agent finishes a turn | If anything in `demo-site/src/` differs from `HEAD`, runs the tests proving the six planted problems still exist, and sends a failure back to the agent ([script](.kiro/hooks/scripts/planted-problems-guard.mjs)) |
| [Translation keeper](.kiro/hooks/translation-keeper.json) | Manual | After English strings change, adds missing keys to the Punjabi and Hindi files and lists them for review. It skips the keys that are deliberately untranslated |

### Property tests

Property tests use [fast-check](https://fast-check.dev). A property test is a `describe` whose name starts with `Feature: <spec name>, Property`. Each command below runs only those tests.

| Spec | Command | Tests | Test files |
|---|---|---|---|
| `haunt-engine` | `cd engine`, then `npm run test:properties` | 26 | [`engine/test/*.properties.test.ts`](engine/test) (address refusal, saved runs pass the schema, step numbering, finding links, delays, misclicks, run ids, visual perception) |
| `haunt-dashboard` and `exorcise-different-ghost-fix` | `cd dashboard`, then `npm run test:properties` | 29 | [`dashboard/src/__tests__/*.properties.test.ts`](dashboard/src/__tests__), [routes](dashboard/src/__tests__/routes.test.ts), [name filter](dashboard/scripts/__tests__/propertyTestPattern.properties.test.ts) |
| `lantern-bills` | `cd demo-site`, then `npm run test:properties` | 20 | [`demo-site/src/__tests__/properties/`](demo-site/src/__tests__/properties) (payment flow, validation, modal, language, layout, accessibility) |

That is 75 property tests, all passing. The dashboard runner ([dashboard/scripts/test-properties.ts](dashboard/scripts/test-properties.ts)) fails if no test matches the pattern.

The planted-problems tests that the hook runs are `cd demo-site`, then `npx vitest --run src/components/__tests__ src/__tests__/translations.test.ts`.

### Shared contract

[contract/run-format.md](contract/run-format.md) defines the run file format that the engine writes and the dashboard reads. [contract/example-run.json](contract/example-run.json) is an example, and [contract/run.schema.json](contract/run.schema.json) is the schema. The dashboard and the engine each check every run against it.

## Honest limitations

- **Ghosts do not replace people.** They find barriers a script can reach. They do not replace testing with disabled people, and a clean ghost run does not mean a site is accessible.
- **The read-aloud voice is an approximation.** It uses the browser's built-in speech voice. It is not real screen reader output, and the dashboard says so next to the button.
- **The Listener cannot use a screen reader's browse mode.** It moves by keyboard and listens to what would be announced, so it is stricter than a real screen reader user on some traps. A real user might get around a barrier that stops The Listener.
- **The minds are scripted for now.** Each ghost follows a fixed state machine over its mission, with no AI. It will not improvise the way a person does.
- **The evidence is thin.** There is one real run per ghost on one site, and one mission.
- **Ghosts only visit our own sites,** or local copies of open-source sites. We do not test third-party production sites.

## Related work

- **UXAgent** ([paper](https://arxiv.org/abs/2504.09407), [code](https://github.com/neuhai/UXAgent)) generates thousands of LLM-driven personas that test a web design, so UX researchers can refine a study before running it with people.
- **AgentA/B** ([paper](https://arxiv.org/html/2504.09723)) runs LLM agents on live websites to carry out A/B tests, then analyzes the logged behavior for the experiment owner.
- **persona-lab:** - [persona-lab](https://github.com/gobika21/persona-lab): AI agents that test websites the way disabled people use them, with an eval suite that checks whether the agents can be trusted. Haunt differs in three ways: our ghosts' missions come from Kiro specs, findings are decided by deterministic detectors rather than the AI, and Exorcise compares before-and-after runs by the same ghost.

**How Haunt differs.** UXAgent and AgentA/B generate many general-purpose personas to study how people choose and behave. Haunt uses three fixed personas, each built around one access need: keyboard and screen reader, slow network and old phone, large text and another language. The output is a list of specific barriers, each tied to a step, a screenshot, and a mission, so a team can fix it and re-check with Exorcise. Haunt's focus is accessibility, and its dashboard is part of the product.

## License

[MIT](LICENSE). Copyright (c) 2026 Anant Agrawal.
