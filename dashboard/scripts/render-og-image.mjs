// Renders scripts/og-image.html to public/og-image.png (1200x630). Run it by hand when the picture changes:
//   node scripts/render-og-image.mjs
import { chromium } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(join(here, 'og-image.html')).href);
await page.screenshot({ path: join(here, '..', 'public', 'og-image.png') });
await browser.close();
console.log('Haunt: wrote public/og-image.png');
