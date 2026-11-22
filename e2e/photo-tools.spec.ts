import { test, expect } from '@playwright/test';
import { drag, expectNotCovered, expectShellStill, expectTappable, mockApi, watchErrors, fixture } from './helpers';
import { addTypedText, canvasMap, gotoPhoto, layersWhen, openFixture, openTool, savedPages, sheet, strip, tool } from './photo-helpers';

test.describe('Photo: crop, adjust, background, download, pages, persistence', () => {
  test('Crop: Apply is always visible and not covered; dragging a handle then Apply crops; undo restores; Cancel changes nothing', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    const m0 = await canvasMap(page);
    // Cancel first
    await tool(page, 'Crop').click();
    const dlg = page.getByRole('dialog', { name: 'Crop and rotate' });
    await expect(dlg).toBeVisible();
    await expect(strip(page)).toHaveCount(0);
    const apply = dlg.getByRole('button', { name: 'Apply' });
    const cancel = dlg.getByRole('button', { name: 'Cancel' });
    await expect(apply).toBeVisible();
    await expectNotCovered(apply);
    await expectNotCovered(cancel);
    await expectTappable(dlg.locator('.ph-sheet-head'));
    const before = JSON.stringify((await savedPages(page))[0]!.base);
    await cancel.click();
    await expect(dlg).toHaveCount(0);
    await expect(strip(page)).toBeVisible();
    expect(JSON.stringify((await savedPages(page))[0]!.base), 'Cancel leaves the picture alone').toBe(before);
    expect((await canvasMap(page)).w).toBe(m0.w);
    // Apply after dragging the bottom-right handle in
    await tool(page, 'Crop').click();
    await expect(apply).toBeVisible();
    const h = page.locator('.crop-h[data-handle="se"]');
    const hb = (await h.boundingBox())!;
    expect(hb.width).toBeGreaterThanOrEqual(44);
    await expectNotCovered(apply);
    const sizeBefore = await page.locator('.crop-size').innerText();
    await drag(page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }, { x: hb.x + hb.width / 2 - 90, y: hb.y + hb.height / 2 - 50 });
    await expect.poll(() => page.locator('.crop-size').innerText()).not.toBe(sizeBefore);
    await apply.click();
    await expect(dlg).toHaveCount(0);
    await expect.poll(async () => (await canvasMap(page)).w, { message: 'the picture got smaller' }).toBeLessThan(m0.w);
    await expect.poll(async () => JSON.stringify((await savedPages(page))[0]!.base)).not.toBe(before);
    await expectShellStill(page);
    // undo brings the full picture back
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(async () => (await canvasMap(page)).w).toBe(m0.w);
    expect(errors).toEqual([]);
  });

  test('Adjust: sliders change their value; dragging a slider neither drags the sheet nor zooms the page', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await openTool(page, 'Adjust');
    const dlg = sheet(page);
    await page.waitForTimeout(500); // the sheet has slid in
    const slider = dlg.getByRole('slider').first();
    await expect(slider).toBeVisible();
    const out = slider.locator('xpath=following-sibling::output');
    const v0 = await slider.inputValue();
    const sheetBox0 = (await dlg.boundingBox())!;
    const k0 = (await canvasMap(page)).k;
    await slider.scrollIntoViewIfNeeded();
    const sb = (await slider.boundingBox())!;
    // a real press-drag-release on the slider thumb
    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb.x + sb.width * 0.85, sb.y + sb.height / 2 + 30, { steps: 8 });
    await page.mouse.up();
    const v1 = await slider.inputValue();
    expect(Number(v1), 'value moved').toBeGreaterThan(Number(v0) + 10);
    await expect(out).toHaveText(new RegExp(`${v1}`));
    const sheetBox1 = (await dlg.boundingBox())!;
    expect(sheetBox1.y, 'sheet did not move').toBeCloseTo(sheetBox0.y, 0);
    expect(sheetBox1.height).toBeCloseTo(sheetBox0.height, 0);
    await expect(dlg).toHaveAttribute('data-detent', '0');
    expect((await canvasMap(page)).k, 'no zoom').toBeCloseTo(k0, 5);
    await expectShellStill(page);
    // it counts as one edit in the history and the picture got it
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await expect.poll(async () => JSON.stringify((await savedPages(page))[0]!.record).includes('"adjust"')).toBe(true);
    // keyboard on a second slider
    const second = dlg.getByRole('slider').nth(1);
    const s0 = Number(await second.inputValue());
    await second.focus();
    await second.press('ArrowRight');
    await second.press('ArrowRight');
    expect(Number(await second.inputValue())).toBeGreaterThan(s0);
    // the controls fit a thumb
    await expectTappable(dlg.locator('.adj-top'));
    expect(errors).toEqual([]);
  });

  test('Background: the dialog opens with its consent text and Not now closes it; the model is never downloaded', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const downloads: string[] = [];
    page.on('request', (r) => {
      if (/huggingface|jsdelivr.*(ort|onnx)|\.onnx/i.test(r.url())) downloads.push(r.url());
    });
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await tool(page, 'Background').click();
    const dlg = page.getByRole('dialog', { name: 'Remove background' });
    await expect(dlg).toBeVisible();
    const group = dlg.getByRole('group', { name: 'Remove the background' });
    await expect(group).toBeVisible();
    await expect(group).toContainText('your picture is never uploaded');
    await expect(group.getByRole('button', { name: 'Download and remove the background' })).toBeVisible();
    await expectTappable(group, 40);
    await expectShellStill(page);
    await group.getByRole('button', { name: 'Not now' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(strip(page)).toBeVisible();
    // and closing with Done works too
    await tool(page, 'Background').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Download sheet: the format is remembered after reopening, the size estimate says "at most about", Cancel closes', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const dlg = page.getByRole('dialog', { name: 'Download' });
    await expect(dlg).toBeVisible();
    const formats = dlg.getByRole('radiogroup', { name: 'Format' });
    await expect(formats.getByRole('radio')).toHaveCount(4);
    await expect(dlg.locator('.export-summary')).toContainText('at most about');
    await expect(dlg.locator('.export-summary')).toContainText('PNG');
    await expectTappable(dlg.locator('.export-actions'));
    await expectNotCovered(dlg.getByRole('button', { name: 'Download', exact: true }));
    await formats.getByRole('radio', { name: /JPG/i }).click();
    await expect(dlg.locator('.export-summary')).toContainText('JPG');
    await expect(dlg.locator('.export-summary')).toContainText('at most about');
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('interslavic-photo-export-format'))).toBe('jpeg');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Download' }).getByRole('radio', { name: /JPG/i })).toBeChecked();
    await expect(page.getByRole('dialog', { name: 'Download' }).locator('.export-summary')).toContainText('JPG');
    // a real file comes out
    const [file] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('dialog', { name: 'Download' }).getByRole('button', { name: 'Download', exact: true }).click()]);
    expect(file.suggestedFilename()).toMatch(/\.jpe?g$/i);
    expect(errors).toEqual([]);
  });

  test('several pages: thumbnails in the page row, tapping them opens the Pages sheet where a page can be shown', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await gotoPhoto(page);
    await page.getByLabel('Photo', { exact: true }).setInputFiles([fixture('sign.png'), fixture('noise.png'), fixture('big-photo.jpg')]);
    await expect(strip(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.pp-thumb')).toHaveCount(3);
    await expect(page.locator('.pp-thumb.is-current')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Pages: \d of 3/ })).toBeVisible();
    await page.getByRole('button', { name: 'Pages (3)' }).click();
    const dlg = sheet(page);
    await expect(dlg).toHaveAttribute('aria-label', 'Pages');
    await expect(dlg.getByRole('button', { name: /^Page \d:/ })).toHaveCount(3);
    await dlg.getByRole('button', { name: /^Page 2:/ }).click();
    await expect(dlg.getByRole('button', { name: /^Page 2:/ })).toHaveAttribute('aria-current', 'page');
    await dlg.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Pages: 2 of 3' })).toHaveText('2 / 3');
    await expect(page.locator('.pp-thumb.is-current')).toHaveCount(1);
    await expect(page.locator('.pp-thumb').nth(1)).toHaveClass(/is-current/);
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('a reload restores the pages, the layers and the edits', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await gotoPhoto(page);
    await page.getByLabel('Photo', { exact: true }).setInputFiles([fixture('sign.png'), fixture('noise.png')]);
    await expect(strip(page)).toBeVisible({ timeout: 20_000 });
    await addTypedText(page, 'Remember me');
    await openTool(page, 'Colour');
    await sheet(page).getByRole('button', { name: 'Colour #e0245e' }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    // several files at once: the last one picked is the page shown
    await expect(page.getByRole('button', { name: 'Pages: 2 of 2' })).toBeVisible();
    await layersWhen(page, (l) => l.length === 1 && l[0]!.style!.color === '#e0245e' && l[0]!.text === 'Remember me', 1);
    await expect.poll(async () => (await savedPages(page)).length).toBe(2);
    // let the reading of the picture finish: a reload in the middle aborts its download, which is the browser's doing and not the app's
    await expect(page.locator('.pp-pill')).toHaveCount(0, { timeout: 60_000 });
    await page.waitForTimeout(600);
    errors.length = 0;
    await page.reload();
    await expect(page.locator('.ph-photo-empty')).toHaveCount(0);
    await expect(strip(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Pages: 2 of 2' }), 'the page that was open comes back').toBeVisible();
    await expect(page.locator('.pp-thumb')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled(); // the history came back, not only the picture
    const pages = await savedPages(page);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.layers).toHaveLength(0);
    expect(pages[1]!.layers[0]!.text).toBe('Remember me');
    expect(pages[1]!.layers[0]!.style!.color).toBe('#e0245e');
    // and the text is really drawn and can be picked again
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('button', { name: 'Redo' }).click();
    await layersWhen(page, (l) => l.length === 1 && l[0]!.text === 'Remember me', 1);
    expect(errors).toEqual([]);
  });
});
