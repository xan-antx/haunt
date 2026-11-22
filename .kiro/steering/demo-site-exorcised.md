---
inclusion: fileMatch
fileMatchPattern: 'demo-site-exorcised/**'
---

# Demo Site (Exorcised Copy)

`demo-site-exorcised/` is a copy of `demo-site/` used for the Exorcise demo. It is where the planted problems get fixed, through bugfix specs.

- Fix a planted problem only when a bugfix spec names it.
- Keep `demo-site/` unchanged. It stays the haunted original, and its problems must not be fixed.
- Do not weaken or delete a test to make it pass. When a fix makes a planted-problem test fail, the bugfix spec updates that test to assert the fixed behavior.
- Dev server: port 3002 (`npm run dev`). Production base path: `/haunt/lantern-bills-exorcised/`.
