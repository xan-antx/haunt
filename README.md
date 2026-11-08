# Haunt

**Haunt your app before your users do.**

Haunt sends three synthetic "ghost" users into a website to finish a task, then shows on a candlelit dashboard where each ghost got stuck. Built for the Kiroween 2026 hackathon, Costume Contest category.

## Judge Quick Start

**Live links**

- Live dashboard: TODO
- Live demo site (Lantern Bills): TODO

**Run it locally (about 60 seconds).** You need a current Node.js LTS. The repo has no root `package.json`, so install and run each app in its own folder. Use two terminals.

Terminal 1, the demo site (the example app the ghosts visit):

```
cd demo-site
npm install
npm run dev
```

It serves at <http://localhost:3000>. Add `?lang=pa` or `?lang=hi` to see Punjabi or Hindi.

Terminal 2, the dashboard:

```
cd dashboard
npm install
npm run dev
```

It serves at <http://localhost:3001>. Both ports are fixed. If one is taken, the server stops with an error instead of choosing another port.

**A 60-second path through the dashboard**

1. Open <http://localhost:3001> and press **Start here**. This opens the Ghost Cam at the step where The Listener got trapped.
2. Press play in the Ghost Cam. Turn on **Read aloud (approximation)** to hear what The Listener hears.
3. Open the **Séance** and ask The Listener why it gave up.
4. Open the **Graveyard** and follow a tombstone to the moment it happened.
5. Open the **Haunted Map** for "Lantern Bills demo" and switch ghosts to see which rooms are covered in fog.

Direct links to the sample runs (dashboard must be running):

- The Listener trapped in the payment dialog: <http://localhost:3001/#/run/2026-11-03-listener-pay-bill/step/9>
- Bebe finding untranslated text: <http://localhost:3001/#/run/2026-11-03-bebe-pay-bill/step/3>
- Asking The Listener why it gave up: <http://localhost:3001/#/seance/2026-11-03-listener-pay-bill/why-give-up>

**Run the tests**

```
cd dashboard
npm test
npm run test:properties
npm run test:e2e
```

Run `npx playwright install chromium` once before `npm run test:e2e`. The end-to-end tests run against the built site. See [dashboard/README.md](dashboard/README.md) for details, and the [property tests](#how-we-built-it-with-kiro) section for the demo site's tests.

## What Haunt is

### The three ghosts

- **The Listener** moves through a page with only the keyboard and listens to what a screen reader would announce.
- **The Phantom** browses on slow 3G and an old phone.
- **Bebe** reads at 200% zoom, prefers Punjabi or Hindi, and watches out for tricky wording.

Each ghost stands for real people with real needs. A ghost that gets stuck points to a real barrier, so we never weaken a test to make a ghost pass.

### The demo site

Lantern Bills (`demo-site/`) is an electricity bill-payment site in English, Punjabi and Hindi. It has six deliberate accessibility and usability problems for the ghosts to find. They stay in on purpose, and tests guard them.

### The dashboard screens

The dashboard (`dashboard/`) is a static React and Vite site. It only reads run files and never runs a ghost.

| Screen | What it shows |
|---|---|
| **Home** | Each haunted site, the latest result for each ghost, recent ghost walks, and a **Start here** button. Run files that cannot be read are listed as "Restless files" with the reasons. |
| **Haunted Map** | One room per page the ghosts visited. A frost circle marks a cold spot where a ghost got stuck. A bigger circle means a longer wait. Fog covers rooms the selected ghost never entered. |
| **Graveyard** | One tombstone per problem found, filterable by site and ghost. Each links to the moment it happened. |
| **Ghost Cam** | A step-by-step replay of one run: the screenshot, where the ghost's focus was, what it said, and what it thought. The Listener's spoken lines can be read aloud. |
| **Séance** | Ask a ghost four questions about its run: why it gave up, where it got stuck, what it heard, and what helped. Every answer comes from the run file and links to the steps it mentions. |
| **Exorcise** | Compare a run before a fix with a run after it, by the same ghost on the same mission, and see which hauntings are gone, still there, new, or not reached. |
| **Spec Coverage** | Each mission is one requirement. Shows whether each ghost's latest run completed it. |

### What is not built yet

- **The engine** (`engine/`) is a placeholder folder today. Live ghost runs are **coming soon**.
- The **Summon a live ghost** button on Home is disabled and says so.
- The command shown for reproducing a run (`npx haunt run ...`) is a template for the coming engine. It does not run yet.
- The sample runs include a Listener run and a Bebe run. A sample run for The Phantom is **coming soon**.

## How we built it with Kiro

Every row points to a file in this repo.

### Specs (`.kiro/specs/`)

| Spec | Purpose | Files |
|---|---|---|
| `lantern-bills` | The demo site and its six planted problems | [requirements](.kiro/specs/lantern-bills/requirements.md), [design](.kiro/specs/lantern-bills/design.md), [tasks](.kiro/specs/lantern-bills/tasks.md) |
| `haunt-dashboard` | The dashboard and its screens | [requirements](.kiro/specs/haunt-dashboard/requirements.md), [design](.kiro/specs/haunt-dashboard/design.md), [tasks](.kiro/specs/haunt-dashboard/tasks.md) |
| `exorcise-different-ghost-fix` | A bugfix spec: Exorcise must not compare runs by different ghosts | [bugfix](.kiro/specs/exorcise-different-ghost-fix/bugfix.md), [design](.kiro/specs/exorcise-different-ghost-fix/design.md), [tasks](.kiro/specs/exorcise-different-ghost-fix/tasks.md) |

### Steering (`.kiro/steering/`)

| File | What it does |
|---|---|
| [product.md](.kiro/steering/product.md) | The three ghosts, ethics rules (own sites only, respectful personas, never weaken a test) |
| [structure.md](.kiro/steering/structure.md) | Who owns each folder and how data flows from `runs/` to the dashboard |
| [tech.md](.kiro/steering/tech.md) | TypeScript, Node LTS, Playwright, React with Vite, and file-editing rules |
| [demo-site.md](.kiro/steering/demo-site.md) | Loads when working in `demo-site/`. Keeps the six planted problems in place unless a bugfix spec names them |
| [dashboard-design.md](.kiro/steering/dashboard-design.md) | Loads when working in `dashboard/`. Colors with measured contrast ratios, fonts, ghost designs, what each spooky element means, motion limits |

### Hooks (`.kiro/hooks/`)

| Hook | Trigger | What it does |
|---|---|---|
| [Build check](.kiro/hooks/build-check.json) | After a spec task | Runs `npm run build` in each changed project folder ([script](.kiro/hooks/scripts/build-check.mjs)) |
| [Contract guard](.kiro/hooks/contract-guard.json) | Before a file write | Asks for confirmation before anything in `contract/` changes ([script](.kiro/hooks/scripts/contract-guard.mjs)) |
| [Planted problems guard](.kiro/hooks/planted-problems-guard.json) | After saving a file in `demo-site/src/` | Runs the tests proving the six planted problems still exist ([script](.kiro/hooks/scripts/run-check.mjs)) |
| [Translation keeper](.kiro/hooks/translation-keeper.json) | After saving the English translation file | Adds missing keys to the Punjabi and Hindi files and lists them for review. It skips the keys that are deliberately untranslated |

### Property tests

Property tests use [fast-check](https://fast-check.dev). A property test is a top-level `describe` whose name starts with `Feature: <spec name>, Property`. The runner passes that pattern to Vitest, and it fails if zero tests match.

| Spec | Command | Test files |
|---|---|---|
| `haunt-dashboard` and `exorcise-different-ghost-fix` | `cd dashboard` then `npm run test:properties` | [outcome](dashboard/src/__tests__/outcome.properties.test.ts), [models](dashboard/src/__tests__/models.properties.test.ts), [routes](dashboard/src/__tests__/routes.test.ts), [name filter](dashboard/scripts/__tests__/propertyTestPattern.properties.test.ts) |
| `lantern-bills` | `cd demo-site` then `npm run test:properties` | [`demo-site/src/__tests__/properties/`](demo-site/src/__tests__/properties) (payment flow, validation, modal, language, layout, accessibility) |

The runner is [dashboard/scripts/test-properties.ts](dashboard/scripts/test-properties.ts). The full suites run with `npm test` in each folder.

### Shared contract

[contract/run-format.md](contract/run-format.md) defines the run file format that the engine will write and the dashboard reads. [contract/example-run.json](contract/example-run.json) is an example. The dashboard checks every run file against it.

## Honest limitations

- **Ghosts do not replace people.** They find barriers a script can reach. They do not replace testing with disabled people, and a clean ghost run does not mean a site is accessible.
- **The read-aloud voice is an approximation.** It uses the browser's built-in speech voice. It is not real screen reader output, and the dashboard says so next to the button.
- **The dashboard shows sample runs until real runs exist.** Today's runs in `runs/samples/` are hand-made examples, not output from a live engine. The engine is coming soon.
- **Ghosts only visit our own sites,** or local copies of open-source sites. We do not test third-party production sites.

## Related work

- **UXAgent** ([paper](https://arxiv.org/abs/2504.09407), [code](https://github.com/neuhai/UXAgent)) generates thousands of LLM-driven personas that test a web design, so UX researchers can refine a study before running it with people.
- **AgentA/B** ([paper](https://arxiv.org/html/2504.09723)) runs LLM agents on live websites to carry out A/B tests, then analyzes the logged behavior for the experiment owner.
- **persona-lab:** TODO. Add a link and a one-line description here.

**How Haunt differs.** UXAgent and AgentA/B generate many general-purpose personas to study how people choose and behave. Haunt uses three fixed personas, each built around one access need: keyboard and screen reader, slow network and old phone, large text and another language. The output is a list of specific barriers, each tied to a step, a screenshot, and a mission, so a team can fix it and re-check with Exorcise. Haunt's focus is accessibility, and its dashboard is part of the product.

## License

[MIT](LICENSE). Copyright (c) 2026 Anant Agrawal.
