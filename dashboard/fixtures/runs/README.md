# Test fixture runs

**Owner:** House Builder

Fixed run files for the dashboard's tests, so the tests don't change when new real runs are added to the repository's `runs/` folder.

| Folder | What it is |
|---|---|
| `samples/listener-gave-up/` | A copy of `runs/samples/listener-gave-up/run.json` |
| `samples/bebe-succeeded/` | A copy of `runs/samples/bebe-succeeded/run.json` |
| `lantern-bills/2026-11-10T1822Z-listener-pay-bill/` | A copy of the first real Listener run, taken on 10 Nov 2026, with the `screenshot` fields removed. The Ghost Cam shows its grey Placeholder for every step, as it does for the samples |

`npm run build:e2e` collects this folder (instead of `runs/`) into `.e2e/public/runs/` and builds `.e2e/dist/`. `npm run test:e2e` serves that build on port 3001. The unit tests import the real-run copy through `src/__tests__/fixtures/real.ts`.

With these files, real runs win for The Listener, so the Listener sample is hidden from every list, and Bebe's sample is shown with the "Sample run" label.

Never edit these files to make a test pass. To test new data, add a new run folder here and update the tests that should see it.
