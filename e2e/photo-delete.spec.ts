import { test, expect, type Page } from '@playwright/test';
import { mockApi, watchErrors, fixture } from './helpers';
import { addTypedText, layersWhen, openFixture, openTool, savedPages, sheet, tapEmpty, tool } from './photo-helpers';

const undo = (page: Page) => page.getByRole('button', { name: 'Undo' });
const redo = (page: Page) => page.getByRole('button', { name: 'Redo' });

async function threeTexts(page: Page): Promise<void> {
  await openFixture(page, 'sign.png');
  for (const t of ['Alpha', 'Bravo', 'Charlie']) {
    await addTypedText(page, t);
    await tapEmpty(page);
  }
  await layersWhen(page, (l) => l.length === 3);
}

test.describe('Photo: deleting', () => {
  test('floating bar Delete removes the selected layer; undo brings it back, redo removes it again', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Hello');
    const bar = page.getByRole('toolbar', { name: 'Selection' });
    await bar.getByRole('button', { name: 'Delete' }).click();
    await layersWhen(page, (l) => l.length === 0);
    await expect(bar).toHaveCount(0);
    await expect(tool(page, 'Add')).toBeVisible();
    await undo(page).click();
    const back = await layersWhen(page, (l) => l.length === 1);
    expect(back[0]!.text).toBe('Hello');
    await redo(page).click();
    await layersWhen(page, (l) => l.length === 0);
    expect(errors).toEqual([]);
  });

  test('More > Delete removes it and the sheet closes; undo restores', async ({ page }) => {
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Hello');
    await openTool(page, 'More');
    await sheet(page).getByRole('button', { name: 'Delete' }).click();
    await expect(sheet(page)).toBeHidden();
    await layersWhen(page, (l) => l.length === 0);
    await undo(page).click();
    await layersWhen(page, (l) => l.length === 1 && l[0]!.text === 'Hello');
  });

  test('Layers sheet: one action bar acts on the chosen row only; undo and redo work', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await threeTexts(page);
    await openTool(page, 'Layers');
    const dlg = sheet(page);
    // nothing chosen yet: one bar, no per-row buttons
    await expect(dlg.getByRole('toolbar')).toHaveCount(1);
    await expect(dlg.getByRole('button', { name: /^Delete / })).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Bravo', exact: true }).click();
    await expect(dlg.getByRole('toolbar')).toHaveCount(1);
    await expect(dlg.getByRole('toolbar')).toHaveAttribute('aria-label', 'Actions for Bravo');
    await expect(dlg.getByRole('button', { name: /^Delete / }), 'only one Delete in the sheet').toHaveCount(1);
    await expect(dlg.getByRole('button', { name: 'Delete Bravo' })).toBeVisible();
    await expect(dlg.getByRole('button', { name: /^Move .* up$/ })).toHaveCount(1);
    await dlg.getByRole('button', { name: 'Delete Bravo' }).click();
    const left = await layersWhen(page, (l) => l.length === 2);
    expect(left.map((l) => l.text).sort()).toEqual(['Alpha', 'Charlie']);
    // the bar moved on to a neighbour, still one bar
    await expect(dlg.getByRole('toolbar')).toHaveCount(1);
    await expect(dlg.getByRole('button', { name: /^Delete / })).toHaveCount(1);
    // undo (top bar is outside the sheet)
    await undo(page).click();
    const again = await layersWhen(page, (l) => l.length === 3);
    expect(again.map((l) => l.text).sort()).toEqual(['Alpha', 'Bravo', 'Charlie']);
    await redo(page).click();
    await layersWhen(page, (l) => l.length === 2);
    expect(errors).toEqual([]);
  });

  test('deleting every layer from the Layers sheet leaves a usable editor', async ({ page }) => {
    await mockApi(page);
    await threeTexts(page);
    await openTool(page, 'Layers');
    const dlg = sheet(page);
    await dlg.getByRole('button', { name: 'Charlie', exact: true }).click();
    for (let i = 0; i < 3; i++) await dlg.getByRole('button', { name: /^Delete / }).click();
    await layersWhen(page, (l) => l.length === 0);
    await expect(dlg.getByText('No layers yet')).toBeVisible();
    await expect(dlg.getByRole('button', { name: /^Delete / })).toHaveCount(0);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(tool(page, 'Add')).toBeVisible();
    // still usable: add text again, undo all the way back to three layers
    await addTypedText(page, 'New');
    await layersWhen(page, (l) => l.length === 1 && l[0]!.text === 'New');
    for (let i = 0; i < 40 && (await undo(page).isEnabled()); i++) {
      await undo(page).click();
      const n = (await savedPages(page))[0]!.layers.length;
      if (n === 3) break;
    }
    await layersWhen(page, (l) => l.length === 3);
  });

  test('Pages sheet: add, duplicate, move and delete act on the chosen page through one action bar', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Hello');
    await page.getByRole('button', { name: /^Pages: 1 of 1/ }).click();
    const dlg = sheet(page);
    await expect(dlg).toHaveAttribute('aria-label', 'Pages');
    await expect(dlg.getByRole('toolbar')).toHaveCount(1);
    await expect(dlg.getByRole('toolbar')).toHaveAttribute('aria-label', 'Actions for page 1');
    // add a page: the grid stays up and the new page is the chosen one
    await dlg.getByLabel('Add pages').setInputFiles(fixture('noise.png'));
    await expect(dlg.getByRole('button', { name: /^Page 2:/ })).toBeVisible();
    await expect(dlg.getByRole('toolbar')).toHaveAttribute('aria-label', 'Actions for page 2');
    await expect.poll(async () => (await savedPages(page)).length).toBe(2);
    await expect(dlg.getByRole('toolbar')).toHaveCount(1);
    await expect(dlg.getByRole('button', { name: /^Delete page/ })).toHaveCount(1);
    // duplicate page 2 -> 3 pages
    await dlg.getByRole('button', { name: 'Duplicate page 2' }).click();
    await expect.poll(async () => (await savedPages(page)).length).toBe(3);
    await expect(dlg.getByRole('button', { name: /^Page \d:/ })).toHaveCount(3);
    // choose page 1 (the edited one): move it later, the bar follows the page
    await dlg.getByRole('button', { name: /^Page 1:/ }).click();
    await expect(dlg.getByRole('toolbar')).toHaveAttribute('aria-label', 'Actions for page 1');
    await expect(dlg.getByRole('button', { name: 'Move page 1 earlier' })).toBeDisabled();
    const firstName = (await savedPages(page))[0]!.id;
    await dlg.getByRole('button', { name: 'Move page 1 later' }).click();
    await expect.poll(async () => (await savedPages(page))[1]!.id).toBe(firstName);
    await expect(dlg.getByRole('toolbar')).toHaveAttribute('aria-label', 'Actions for page 2');
    // delete the edited page: asks first; Keep keeps it, Remove removes it and nothing else
    await dlg.getByRole('button', { name: 'Delete page 2' }).click();
    const ask = dlg.getByRole('alertdialog');
    await expect(ask).toContainText('changes that will be lost');
    await ask.getByRole('button', { name: 'Keep' }).click();
    expect((await savedPages(page)).length).toBe(3);
    await dlg.getByRole('button', { name: 'Delete page 2' }).click();
    await dlg.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
    await expect.poll(async () => (await savedPages(page)).length).toBe(2);
    const rest = await savedPages(page);
    expect(rest.map((p) => p.id)).not.toContain(firstName);
    await expect(dlg.getByRole('toolbar')).toHaveCount(1);
    // delete an unedited page: no question
    await dlg.getByRole('button', { name: /^Delete page/ }).click();
    await expect.poll(async () => (await savedPages(page)).length).toBe(1);
    await expect(dlg.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(tool(page, 'Add')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Pages: 1 of 1/ })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
