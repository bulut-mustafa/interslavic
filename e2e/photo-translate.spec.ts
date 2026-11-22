import { test, expect } from '@playwright/test';
import { iosKeyboard, mockApi, watchErrors } from './helpers';
import { addTypedText, layersWhen, openFixture, openTool, sheet, tapEmpty, tool } from './photo-helpers';

type Body = { lines: string[]; lang: string; orthography: string };

test.describe('Photo: translate to Interslavic', () => {
  test('the Translate sheet: language and script chips, Translate sends them, the layer changes, Restore original brings it back', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const api = await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Good morning');
    await openTool(page, 'Translate');
    await expect(sheet(page)).toHaveAttribute('aria-label', 'Translate to Interslavic');
    const langs = sheet(page).getByRole('radiogroup', { name: 'Language of the text' });
    const scripts = sheet(page).getByRole('radiogroup', { name: 'Interslavic script' });
    await expect(langs.getByRole('radio')).toHaveText(['English', 'Russian', 'Ukrainian']);
    await expect(scripts.getByRole('radio')).toHaveText(['Latin', 'Cyrillic']);
    await expect(langs.getByRole('radio', { name: 'English' })).toHaveAttribute('aria-checked', 'true'); // Latin letters: English
    await expect(scripts.getByRole('radio', { name: 'Latin' })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet(page).getByRole('button', { name: /Restore original/ })).toHaveCount(0); // nothing translated yet
    await sheet(page).getByRole('button', { name: /^Translate$/ }).click();
    await expect.poll(() => api.batch.length).toBe(1);
    expect(api.batch[0]).toMatchObject({ lines: ['Good morning'], lang: 'en', orthography: 'standard' } satisfies Body);
    let layers = await layersWhen(page, (l) => l[0]?.text === 'Dobro jutro');
    expect(layers[0]!.original).toBe('Good morning');
    await expect(sheet(page).getByRole('status').filter({ hasText: /Translated 1 line/ })).toBeVisible();
    // Restore original
    await sheet(page).getByRole('button', { name: /Restore original/ }).click();
    layers = await layersWhen(page, (l) => l[0]?.text === 'Good morning');
    expect(layers[0]!.original).toBeUndefined();
    await expect(sheet(page).getByRole('button', { name: /Restore original/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('another language and script change the request, and a second run starts from the original words', async ({ page }) => {
    const api = await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Good morning');
    await openTool(page, 'Translate');
    await sheet(page).getByRole('radio', { name: 'Russian' }).click();
    await sheet(page).getByRole('radio', { name: 'Cyrillic' }).click();
    await expect(sheet(page).getByRole('radio', { name: 'Cyrillic' })).toHaveAttribute('aria-checked', 'true');
    await sheet(page).getByRole('button', { name: /^Translate$/ }).click();
    await expect.poll(() => api.batch.length).toBe(1);
    expect(api.batch[0]).toMatchObject({ lang: 'ru', orthography: 'cyrillic' });
    await layersWhen(page, (l) => l[0]?.text === 'Dobro jutro');
    await sheet(page).getByRole('radio', { name: 'English' }).click();
    await sheet(page).getByRole('radio', { name: 'Latin' }).click();
    await sheet(page).getByRole('button', { name: /^Translate$/ }).click();
    await expect.poll(() => api.batch.length).toBe(2);
    expect(api.batch[1], 'the second run translates the original, not the first translation').toMatchObject({ lines: ['Good morning'], lang: 'en', orthography: 'standard' });
  });

  test('the Translate button in the keyboard bar translates what is being typed', async ({ page }) => {
    const api = await mockApi(page);
    await openFixture(page, 'sign.png');
    await openTool(page, 'Add');
    await sheet(page).getByRole('button', { name: 'Text', exact: true }).click();
    await tool(page, 'Edit').click();
    await page.locator('.canvas-typing').fill('my friend');
    await iosKeyboard(page, 300);
    await page.getByRole('toolbar', { name: 'Text tools' }).getByRole('button', { name: 'Translate' }).click();
    await expect.poll(() => api.batch.length).toBe(1);
    expect((api.batch[0] as Body).lines).toEqual(['my friend']);
    await layersWhen(page, (l) => l[0]?.text === 'moj prijatelj');
  });

  test('offline: a plain message is shown and the text is kept', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await mockApi(page, { fail: true });
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Good morning');
    await openTool(page, 'Translate');
    await sheet(page).getByRole('button', { name: /^Translate$/ }).click();
    const alert = sheet(page).getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Could not reach the translator');
    await expect(alert).not.toContainText(/TypeError|Load failed|NetworkError/);
    await expect(sheet(page).getByRole('button', { name: /^Translate$/ }), 'can try again').toBeEnabled();
    const layers = await layersWhen(page, (l) => l.length === 1);
    expect(layers[0]!.text).toBe('Good morning');
    expect(layers[0]!.original).toBeUndefined();
    expect(errors).toEqual([]);
  });

  test('Live Text translate makes a layer over the picture\'s words; Restore original removes it again', async ({ page }) => {
    const api = await mockApi(page);
    await openFixture(page, 'sign.png');
    await openTool(page, 'Text');
    await expect(sheet(page).locator('.pp-text')).toContainText('Text found', { timeout: 40_000 });
    await sheet(page).getByRole('button', { name: /Select all text/ }).click();
    await page.getByRole('toolbar', { name: 'Selected text' }).getByRole('button', { name: 'Translate' }).click();
    await expect.poll(() => api.batch.length).toBe(1);
    expect((api.batch[0] as Body).lines).toHaveLength(2);
    const layers = await layersWhen(page, (l) => l.length === 2);
    expect(layers.every((l) => l.erase && l.original !== undefined), 'each replaces the picture\'s own lettering').toBe(true);
    // select a replaced line, open More: Restore original
    await expect(tool(page, 'More')).toBeVisible();
    await openTool(page, 'More');
    await sheet(page).getByRole('button', { name: 'Restore original' }).click();
    await layersWhen(page, (l) => l.length === 0);
  });

  test('Translate all text: translates every text layer of the page at once', async ({ page }) => {
    const api = await mockApi(page);
    await openFixture(page, 'sign.png');
    await addTypedText(page, 'Good morning');
    await tapEmpty(page);
    await expect(tool(page, 'Add')).toBeVisible();
    await addTypedText(page, 'my friend');
    await tapEmpty(page);
    await expect(tool(page, 'Add')).toBeVisible();
    await layersWhen(page, (l) => l.length === 2);
    await openTool(page, 'Text');
    await sheet(page).getByRole('button', { name: /Translate all text/ }).click();
    await expect(sheet(page)).toHaveAttribute('aria-label', 'Translate to Interslavic');
    await sheet(page).getByRole('button', { name: /^Translate$/ }).click();
    await expect.poll(() => api.batch.length).toBe(1);
    expect((api.batch[0] as Body).lines.sort()).toEqual(['Good morning', 'my friend']);
    const layers = await layersWhen(page, (l) => l.length === 2 && l.every((x) => x.original !== undefined));
    expect(layers.map((l) => l.text).sort()).toEqual(['Dobro jutro', 'moj prijatelj']);
  });
});
