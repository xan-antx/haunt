# Missions

A mission is one task a ghost tries on a site, written as a JSON file. The file name is the mission's id: `pay-bill.json` holds the mission `pay-bill`. The engine checks every file against [`schemas/mission.schema.json`](../schemas/mission.schema.json) and refuses one that does not follow it.

The missions in this folder are for the sites in this repository:

| File | Site |
|---|---|
| `pay-bill.json` | Lantern Bills and its fixed copy |
| `write-note.json` | A local copy of Memos |

To haunt your own site, keep your mission and config files in a folder of your own and point the engine at them (see "Haunt your own site" in the [README](../../README.md)). Ghosts only visit `localhost`, `127.0.0.1` and domains you list in `allowedDomains`, so only run them on a site you own.

## Template

Save this as `my-mission.json` in your own missions folder. Change the parts in capitals and the words in quotes to match your site.

```json
{
  "id": "my-mission",
  "site": "my-site",
  "goal": "One plain sentence saying what a visitor wants to do",
  "requirement": "WHEN a visitor does this, THE site SHALL do that",
  "successCheck": {
    "text": "What you can see when the task has worked",
    "visible": "CSS selector of something that appears only when it has worked"
  },
  "intentions": [
    {
      "id": "open-form",
      "do": "activate",
      "thought": "What the ghost says it is looking for, in its own voice.",
      "target": { "kind": "button", "en": ["^name of the button$"] },
      "doneWhen": { "present": { "kind": "field", "en": ["name of a field that appears next"] } }
    },
    {
      "id": "fill-field",
      "do": "type",
      "value": "Text to type",
      "thought": "What the ghost says as it types.",
      "target": { "kind": "field", "en": ["name of the field"] },
      "doneWhen": "success"
    }
  ]
}
```

What each part means:

- `id` is the file name without `.json`. `site` is a key from your config file's `sites`. Both use lowercase letters, digits and single hyphens.
- `goal` and `requirement` are shown in the dashboard. Write the requirement as `WHEN ... THE ... SHALL ...` so that Spec Coverage can show it.
- `successCheck.visible` is a CSS selector. The mission counts as done when it matches a visible element.
- Each intention is one action. `do` is `activate` (click or press Enter on a button, link or checkbox) or `type` (type `value` into a field). A `type` intention needs a `value`.
- `target` says what to look for by its accessible name, the name a screen reader would speak. `kind` is `button`, `link`, `field` or `checkbox`. `en` is a list of patterns that are matched without regard to case. Add `pa` or `hi` lists to match Punjabi or Hindi names.
- `doneWhen` says how the ghost knows the step worked. It is `"success"` (the success check matches), `{ "fieldValue": true }` (the field now holds text) or `{ "present": { ... } }` (something with that name has appeared). `present` also accepts `"kind": "any"`.
- `thought` is the sentence the dashboard shows for that step. Write it as the ghost would say it.
- `{{runStamp}}` in a `value` or in `successCheck` becomes a unique time stamp for each run.
- `{{futureExpiry}}` in a `value` becomes a card expiry date two years after the month of the run, as `MM/YY` (for example `11/28` for a run in November 2026), so a saved mission never expires. `pay-bill.json` uses it.
- In your config file, `allowedTerms` lists words that Bebe's check for untranslated text should leave out, such as your brand name.

A ghost that cannot find a target on your site gives up at that step. That is a result, not an error: the run is saved and the dashboard shows where it stopped. Check a mission by running it and reading the run, never by loosening a pattern until the ghost passes.

See `pay-bill.json` for a longer example with Punjabi and Hindi patterns, and `write-note.json` for one that signs in first.
