// The commands on Home's "Haunt your own site" card. They are the same lines as the README's
// "Haunt your own site" section, and each was run against a local copy of Lantern Bills with
// --out pointing at a folder outside the repository before it was published here.

export const OWN_SITE_COMMANDS: readonly string[] = [
  'cd engine',
  'npm install',
  'npx playwright install chromium',
  'npm run haunt -- run --ghost listener --mission my-mission --url http://localhost:3000 --site my-site --config ../my-haunt/haunt.config.json --missions ../my-haunt/missions --out ../my-haunt/runs',
];

export const OWN_SITE_BLOCK = OWN_SITE_COMMANDS.join('\n');
