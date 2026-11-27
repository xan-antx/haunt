---
inclusion: fileMatch
fileMatchPattern: 'demo-site/**/*'
---

# Demo Site - Deliberate Issues

## Important: Intentional Bugs

The demo site contains **six deliberate accessibility and usability problems** for our ghosts to find.

**Never fix them, remove them, or warn about them** unless a bugfix spec specifically asks.

These issues are the teaching examples that demonstrate what Haunt can catch. They are features, not bugs.

## The six planted problems

1. An icon-only pay button with no accessible name (`unlabeled_button`).
2. A "Protect your payment" dialog that traps keyboard focus, ignores Escape and has a paid add-on ticked by default (`focus_trap`, and a tricky choice for Bebe, `dark_pattern`).
3. Card errors that are visible but never announced (`unannounced_error`).
4. A banner that loads late and pushes the page down (`slow_wait`, and a `misclick` for The Phantom).
5. A payment total that is cut off at narrow widths and large zoom (`cut_off_text`).
6. Missing Punjabi and Hindi text for the pay button and the card errors (`untranslated`).

The fixed copy in `demo-site-exorcised/` repairs all six through bugfix specs. The hook "Planted problems guard" runs the tests that prove these six still exist whenever anything in `demo-site/src/` differs from `HEAD`.

## When Working on the Demo Site

- Add new features without accidentally fixing the existing issues
- Preserve the problematic patterns that our ghosts are designed to detect
- Only address these issues if explicitly directed by a specification or user request that names them
