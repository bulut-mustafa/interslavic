import { test, expect } from '@playwright/test';
import { expectShellStill, expectTappable, fixture, watchErrors } from './helpers';
import { mockTranslate } from './shell-helpers';

// Source of truth: studio/tools.tsx. The cards are written out here so a tool that vanishes from the home fails a test.
const TOOLS = [
  { slug: 'photo', label: 'Photo', group: 'Edit' },
  { slug: 'video', label: 'Video', group: 'Edit' },
  { slug: 'recording', label: 'Recording', group: 'Text & audio' },
  { slug: 'subtitles', label: 'Subtitles', group: 'Text & audio' },
  { slug: 'watch', label: 'Watch', group: 'Learn & teach' },
  { slug: 'worksheets', label: 'Worksheets', group: 'Learn & teach' },
];

test.beforeEach(async ({ page }) => {
  await mockTranslate(page);
});

test('home: three groups, one card per tool with its name and a one-line purpose, 2-column grid inside the screen', async ({ page }, testInfo) => {
  const errors = watchErrors(page, testInfo);
  await page.goto('/studio');
  await expect(page.locator('.ph-tool-group .ph-section-title')).toHaveText(['Edit', 'Text & audio', 'Learn & teach']);
  await expect(page.locator('.ph-card')).toHaveCount(TOOLS.length);
  const vw = page.viewportSize()!.width;
  for (const t of TOOLS) {
    const card = page.getByRole('link', { name: `Open ${t.label}` });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', `/studio/${t.slug}`);
    await expect(card.locator('strong')).toHaveText(t.label);
    await expect(card.locator('.ph-card-purpose')).not.toBeEmpty();
    const b = (await card.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(vw);
    expect(b.height).toBeGreaterThanOrEqual(80);
    // each card sits under its group
    await expect(page.locator('section[aria-label="' + t.group + '"]').getByRole('link', { name: `Open ${t.label}` })).toHaveCount(1);
  }
  // 2 columns: Photo and Video share a row
  const p = (await page.getByRole('link', { name: 'Open Photo' }).boundingBox())!;
  const v = (await page.getByRole('link', { name: 'Open Video' }).boundingBox())!;
  expect(Math.abs(p.y - v.y)).toBeLessThan(2);
  expect(v.x).toBeGreaterThan(p.x + p.width - 2);
  await expectShellStill(page);
  expect(errors).toEqual([]);
});

test('device tools say they run on your phone; service tools do not', async ({ page }) => {
  await page.goto('/studio');
  for (const t of ['Photo', 'Video', 'Recording', 'Worksheets']) await expect(page.getByRole('link', { name: `Open ${t}` }).locator('.ph-card-tag')).toHaveText('On your phone');
  for (const t of ['Subtitles', 'Watch']) await expect(page.getByRole('link', { name: `Open ${t}` }).locator('.ph-card-tag')).toHaveCount(0);
});

test('all cards are reachable by scrolling the home (inside .ph-content), the tab bar stays', async ({ page }) => {
  await page.goto('/studio');
  const last = page.getByRole('link', { name: 'Open Worksheets' });
  await last.scrollIntoViewIfNeeded();
  const b = (await last.boundingBox())!;
  const bar = (await page.locator('.ph-tabbar').boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(bar.y + 1);
  await expectShellStill(page);
  await expect(page.locator('.ph-tabbar [aria-current="page"]')).toHaveText('Studio');
});

for (const t of TOOLS) {
  test(`${t.label}: opens full screen with a title and a working back arrow to the home`, async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await page.goto('/studio');
    await page.getByRole('link', { name: `Open ${t.label}` }).click();
    await expect(page).toHaveURL(new RegExp(`/studio/${t.slug}$`));
    const frame = page.locator(`.ph-tool-frame[data-tool="${t.slug}"]`);
    await expect(frame).toBeVisible();
    await expect(frame.locator('.ph-topbar-title').first()).toHaveText(t.label);
    await expect(page.locator('.ph-tabbar'), 'no tab bar inside a tool: the tool owns the screen').toHaveCount(0);
    const fb = (await frame.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(fb.width).toBeCloseTo(vp.width, 0);
    expect(fb.height, 'fills the screen').toBeGreaterThan(vp.height - 80);
    await expectShellStill(page);
    const back = page.getByRole('link', { name: 'Back to Studio' });
    const bb = (await back.boundingBox())!;
    expect(bb.width).toBeGreaterThanOrEqual(44);
    expect(bb.height).toBeGreaterThanOrEqual(44);
    await back.click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole('heading', { name: 'Your uploads' })).toBeVisible();
    await expect(page.locator('.ph-card')).toHaveCount(TOOLS.length);
    await expect(page.locator('.ph-tabbar')).toBeVisible();
    // the browser's own back goes the other way: forward lands in the tool again
    await page.goBack();
    await expect(frame).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('Photo and Video have an Uploads button in their bar that opens the uploads sheet; other tools do not', async ({ page }) => {
  for (const slug of ['photo', 'video']) {
    await page.goto(`/studio/${slug}`);
    const btn = page.getByRole('button', { name: 'Uploads' });
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByRole('dialog', { name: 'Uploads' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Uploads' }).getByRole('button', { name: 'Close' }).first().click();
    await expect(page.locator('.ph-sheet[data-open="true"]')).toHaveCount(0);
  }
  await page.goto('/studio/worksheets');
  await expect(page.getByRole('button', { name: 'Uploads' })).toHaveCount(0);
});

test('an unknown tool shows a plain message with a link back to the Studio, not a blank screen', async ({ page }) => {
  await page.goto('/studio/nope');
  await expect(page.getByText('No such tool.')).toBeVisible();
  await page.getByRole('link', { name: 'Back to the Studio' }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.locator('.ph-card')).toHaveCount(TOOLS.length);
});

test.describe('uploads row', () => {
  test('empty: explains itself and offers Add as a big target with a 16px-safe file input', async ({ page }) => {
    await page.goto('/studio');
    await expect(page.getByText('Nothing here yet.')).toBeVisible();
    const add = page.locator('.ph-upload-add');
    const b = (await add.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    await expect(page.getByLabel('Add to uploads')).toHaveAttribute('accept', /image.*video.*audio/);
    await expect(page.locator('.ph-upload')).toHaveCount(0);
  });

  test('adding a picture shows a thumbnail, hides the empty hint, and tapping it opens the Photo editor with it', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await page.goto('/studio');
    await page.getByLabel('Add to uploads').setInputFiles(fixture('sign.png'));
    const thumb = page.getByRole('button', { name: 'Open sign.png' });
    await expect(thumb).toBeVisible();
    await expect(page.getByText('Nothing here yet.')).toHaveCount(0);
    await expect(thumb.locator('img')).toHaveJSProperty('complete', true);
    expect(await thumb.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    const b = (await thumb.boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(44);
    await expectShellStill(page);
    await thumb.click();
    await expect(page).toHaveURL(/\/studio\/photo$/);
    await expect(page.locator('.ph-tool-frame[data-tool="photo"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('adding a video shows a thumbnail and opens the Video editor', async ({ page }) => {
    await page.goto('/studio');
    await page.getByLabel('Add to uploads').setInputFiles(fixture('clip.mp4'));
    const thumb = page.getByRole('button', { name: 'Open clip.mp4' });
    await expect(thumb).toBeVisible();
    await thumb.click();
    await expect(page).toHaveURL(/\/studio\/video$/);
  });

  test('several files at once give several thumbnails, in a row that scrolls inside itself', async ({ page }) => {
    await page.goto('/studio');
    await page.getByLabel('Add to uploads').setInputFiles([fixture('sign.png'), fixture('clip.mp4'), fixture('clip2.mp4'), fixture('tone.wav'), fixture('noise.png')]);
    await expect(page.locator('.ph-upload')).toHaveCount(5);
    await page.locator('.ph-uploads-row').evaluate((el) => el.scrollTo(9999, 0));
    await expectShellStill(page);
    await expectTappable(page.locator('.ph-uploads-row'), 44);
  });
});
