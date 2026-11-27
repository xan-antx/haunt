import { expect, test } from '@playwright/test';

// UI-19: in forced-colours mode only the current page's menu item carries a bar. The others keep
// a transparent border, which forced colours would otherwise paint in a system colour.

test.use({ forcedColors: 'active', viewport: { width: 1536, height: 864 } });

test('forced colours mark only the current page in the menu', async ({ page }) => {
  await page.goto('/haunt/#/graveyard');
  await expect(page.locator('main h1')).toBeVisible();
  const bars = await page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label="Main"] a')].map((a) => ({
      name: a.textContent ?? '',
      current: a.getAttribute('aria-current') === 'page',
      color: getComputedStyle(a).borderBottomColor,
    })),
  );
  expect(bars.length).toBe(5);
  const current = bars.filter((b) => b.current);
  expect(current).toHaveLength(1);
  expect(current[0]!.name).toContain('Graveyard');
  // Every other item's bar is the page background, so it is the only one that stands out.
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  for (const other of bars.filter((b) => !b.current)) expect(other.color, other.name).toBe(background);
  expect(current[0]!.color).not.toBe(background);
});
