import { test, expect, type Page } from '@playwright/test';
import { expectShellStill, expectTappable, iosKeyboard, mockApi, watchErrors } from './helpers';
import { addTypedText, openFixture, sheet, strip, tapEmpty, tool } from './photo-helpers';

/** No horizontal overflow, and nothing a person can see or tap sticks out of the screen sideways (parts inside a sideways scroller may). */
async function expectNoSidewaysOverflow(page: Page, rootSel: string, what: string): Promise<void> {
  const bad = await page.evaluate((rootSel) => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    const de = document.documentElement;
    if (de.scrollWidth > vw + 1) out.push(`document ${de.scrollWidth} > ${vw}`);
    const root = document.querySelector<HTMLElement>(rootSel);
    if (!root) return [`no ${rootSel}`];
    if (root.scrollWidth > root.clientWidth + 1) out.push(`${rootSel} scrolls sideways: ${root.scrollWidth} > ${root.clientWidth}`);
    for (const el of root.querySelectorAll<HTMLElement>('button, a, input, select, textarea, h2, h3, p, label, output, .pp-chip, span')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.top > innerHeight || r.bottom < 0) continue;
      let scroller = false;
      for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth) scroller = true;
      }
      if (scroller) continue;
      if (r.left < -0.5 || r.right > vw + 0.5) out.push(`${el.tagName}.${el.className} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24)}" ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
    }
    return out;
  }, rootSel);
  expect(bad, `${what}: sticks out sideways`).toEqual([]);
}

const SHEETS_WITH_TEXT = ['Translate', 'Font', 'Size', 'Colour', 'Effects', 'Position', 'Layers', 'More'];

for (const width of [320, 360, 390, 430]) {
  test(`layout at ${width}px: bar, strip and every sheet fit, are tappable and nothing is clipped`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await page.setViewportSize({ width, height: 700 });
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Hello');
    await expectShellStill(page);
    await expectNoSidewaysOverflow(page, '.pp', 'editor');
    await expectTappable(page.locator('.pp-bar'));
    await expectTappable(strip(page));
    const bar = (await page.locator('.pp-bar').boundingBox())!;
    expect(bar.x + bar.width).toBeLessThanOrEqual(width + 0.5);
    for (const b of await page.locator('.pp-bar button, .pp-bar a').all()) {
      const r = (await b.boundingBox())!;
      expect(r.x, 'top bar control left').toBeGreaterThanOrEqual(0);
      expect(r.x + r.width, `top bar control right at ${width}`).toBeLessThanOrEqual(width + 0.5);
    }
    // the floating bar and the picture stay inside the stage
    const stg = (await page.locator('.pp-stage').boundingBox())!;
    const fb = (await page.locator('.ph-fbar').boundingBox())!;
    expect(fb.x).toBeGreaterThanOrEqual(stg.x - 0.5);
    expect(fb.x + fb.width).toBeLessThanOrEqual(stg.x + stg.width + 0.5);
    expect(fb.y).toBeGreaterThanOrEqual(stg.y - 0.5);
    expect(fb.y + fb.height).toBeLessThanOrEqual(stg.y + stg.height + 0.5);
    for (const name of SHEETS_WITH_TEXT) {
      await tool(page, name).evaluate((e) => e.scrollIntoView({ inline: 'center', block: 'nearest' }));
      await tool(page, name).click();
      const dlg = sheet(page);
      await expect(dlg).toBeVisible();
      await page.waitForTimeout(350);
      await expectShellStill(page);
      await expectTappable(dlg, 40);
      await expectNoSidewaysOverflow(page, '.ph-sheet', `${name} sheet`);
      const done = dlg.getByRole('button', { name: 'Done' });
      const d = (await done.boundingBox())!;
      expect(d.x + d.width, `${name}: Done on screen`).toBeLessThanOrEqual(width + 0.5);
      await done.click();
      await expect(dlg).toHaveCount(0);
    }
    // project sheets
    await tapEmpty(page);
    for (const name of ['Add', 'Adjust', 'Text', 'Layers']) {
      await tool(page, name).click();
      await page.waitForTimeout(350);
      await expectTappable(sheet(page), 40);
      await expectNoSidewaysOverflow(page, '.ph-sheet', `${name} sheet`);
      await sheet(page).getByRole('button', { name: 'Done' }).click();
    }
    await expectNoSidewaysOverflow(page, '.pp', 'editor after sheets');
    expect(errors).toEqual([]);
  });
}

test('the keyboard bar fits and every button is tappable at 320px', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await openFixture(page, 'sign.png');
  await addTypedText(page, 'Hello');
  await tool(page, 'Edit').click();
  await iosKeyboard(page, 260);
  const kbar = page.getByRole('toolbar', { name: 'Text tools' });
  await expect(kbar).toBeVisible();
  await expectTappable(kbar);
  for (const n of ['Font', 'Size', 'Colour', 'Translate', 'Done']) {
    const r = (await kbar.getByRole('button', { name: n }).boundingBox())!;
    expect(r.x, `${n} left`).toBeGreaterThanOrEqual(0);
    expect(r.x + r.width, `${n} right (320 wide)`).toBeLessThanOrEqual(320);
  }
  const st = (await page.locator('.pp-stage').boundingBox())!;
  expect(st.height, 'stage keeps room on a small phone').toBeGreaterThan(120);
  const tb = (await page.locator('.canvas-typing').boundingBox())!;
  expect(tb.y + tb.height).toBeLessThanOrEqual(st.y + st.height + 1);
  await expectShellStill(page);
});

test('the empty state fits the screen and its controls are tappable', async ({ page }) => {
  await mockApi(page);
  await page.goto('/studio/photo');
  await expect(page.locator('.ph-photo-empty')).toBeVisible();
  await expectTappable(page.locator('.ph-photo-empty'));
  await expectNoSidewaysOverflow(page, '.ph-photo-empty', 'empty state');
  await expectShellStill(page);
});
