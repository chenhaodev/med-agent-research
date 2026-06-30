/* Phase 0 end-to-end: index.html -> submit -> report.html streams from the API.
   Proves the real pages call the live mock backend: facets populate the drawer,
   submitting creates a report, and the report page renders every block type
   from the SSE stream with zero console errors. */
import { test, expect, type ConsoleMessage } from '@playwright/test';

/* Make the suite hermetic: stub the external Google Fonts CDN so tests don't
   depend on the network (and "zero console errors" measures only our own code,
   not flaky third-party resource loads). The pages degrade to system fonts. */
test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
});

/* Collect console errors + page errors across a test. Each console entry is
   tagged with the resource URL it came from so we can ignore the one benign
   case: the browser logs a network error for the long-lived SSE /events request
   when the server closes the stream after the final `done` event. Everything
   else (including any failure on a regular API call) is treated as a real error. */
function trackErrors(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const url = msg.location()?.url || '';
      errors.push(`${msg.text()} @ ${url}`);
    }
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

// Benign: EventSource close, or a network error on the SSE /events endpoint.
const IGNORABLE = /EventSource|\/events(\b|\?|\s|$)|net::ERR_ABORTED/i;
function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !IGNORABLE.test(e));
}

test('drawer catalogs are populated from GET /facets', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/index.html');

  await page.locator('#ps-filter-open').click();
  await expect(page.locator('#ps-drawer')).toHaveClass(/is-open/);

  // Sub-labels reflect the live facet counts (23 fields, sources, study designs).
  await expect(page.locator('[data-count-for="fieldsOfStudy"]')).toContainText('fields of study');
  await expect(page.locator('[data-count-for="fieldsOfStudy"]')).toContainText('23');

  // Country catalog has many tags, sourced from /facets (not the old 3 hardcoded).
  const countryTags = page.locator('.ps-fos[data-facet="countries"] .ps-tag');
  expect(await countryTags.count()).toBeGreaterThan(50);

  expect(realErrors(errors)).toEqual([]);
});

test('search submit creates a report and streams it into report.html', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/index.html');

  await page.locator('#ps-input').fill('effectiveness of mobile health interventions');
  await page.locator('.ps-searchbox .ps-go').click();

  // Lands on the report page with a real reportId in the URL.
  await page.waitForURL(/report\.html\?reportId=rep_/);

  // Headline streams in from GET /reports/{id}.
  await expect(page.locator('.rr-title')).toContainText('mobile health', { timeout: 15_000 });

  // The body renders every figure type the stream emits.
  await expect(page.locator('.rr-meter__bar')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.rr-funnel')).toBeVisible();
  await expect(page.locator('.rr-table').first()).toBeVisible();
  await expect(page.locator('.rr-figure--chart svg')).toBeVisible();
  await expect(page.locator('.rr-cite').first()).toBeVisible();
  await expect(page.locator('.rr-acc-btn').first()).toBeVisible();

  // References come from the real list (50), not the deleted placeholders.
  await expect(page.locator('.rr-refs__count')).toHaveText('50', { timeout: 15_000 });
  expect(await page.locator('.rr-ref').count()).toBe(50);

  // The "Show all 50 references" toggle is driven by the real list.
  const toggle = page.locator('#rr-refs-toggle');
  await expect(toggle).toContainText('Show all 50 references');

  // The streaming status indicator hides once complete.
  await expect(page.locator('.rrv-status')).toBeHidden({ timeout: 15_000 });

  expect(realErrors(errors)).toEqual([]);
});

test('a citation marker shows its tooltip on hover', async ({ page }) => {
  await page.goto('/index.html');
  await page.locator('#ps-input').fill('mobile health');
  await page.locator('.ps-searchbox .ps-go').click();
  await page.waitForURL(/report\.html\?reportId=/);

  const cite = page.locator('.rr-cite').first();
  await expect(cite).toBeVisible({ timeout: 15_000 });
  await cite.hover();
  await expect(page.locator('.rr-tooltip.is-visible')).toBeVisible();
});

test('report.html with no reportId renders the static fallback', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/report.html');

  await expect(page.locator('.rr-title')).toContainText('research topic');
  // The static sample shows 3 references and no streaming status.
  await expect(page.locator('.rr-refs__count')).toHaveText('3');
  await expect(page.locator('.rrv-status')).toHaveCount(0);

  expect(realErrors(errors)).toEqual([]);
});
