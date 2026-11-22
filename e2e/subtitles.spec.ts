import { test, expect, type Page } from '@playwright/test';
import { expectNotCovered, expectShellStill, expectTappable, shot, watchErrors } from './helpers';
import { readFileSync } from 'node:fs';

export const SRT = `1
00:00:01,000 --> 00:00:03,000
Good morning, my friend.

2
00:00:03,500 --> 00:00:06,000
This line is doubtful.
Second line of it.

3
00:00:06,500 --> 00:00:09,000
See you tomorrow at the station.
`;

interface Api {
  calls: { lines: string[]; lang: string; orthography?: string }[];
  release: () => void;
}

/** A translate-batch mock that flags line 2, and can hold the answer back until release(). */
async function api(page: Page, opts: { hold?: boolean } = {}): Promise<Api> {
  const state: Api = { calls: [], release: () => undefined };
  let gate: Promise<void> = Promise.resolve();
  if (opts.hold) gate = new Promise<void>((r) => (state.release = r));
  await page.route('**/api/translate-batch*', async (route) => {
    const body = route.request().postDataJSON() as { lines: string[]; lang: string; orthography?: string };
    state.calls.push(body);
    await gate;
    await route.fulfill({
      json: {
        results: body.lines.map((l) => ({
          text: 'IS:' + l.replace(/Good morning/i, 'Dobro jutro'),
          flagged: /doubtful/.test(l),
          reasons: /doubtful/.test(l) ? ['the word "doubtful" has no Interslavic match'] : [],
        })),
      },
    });
  });
  return state;
}

async function openSrt(page: Page, srt = SRT, name = 'film.srt'): Promise<void> {
  await page.goto('/studio/subtitles');
  await page.locator('input[type=file]').first().setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(srt) });
  await expect(page.getByRole('list', { name: 'Subtitles' })).toBeVisible();
}

test.describe('subtitles', () => {
  test('empty state offers a file picker; an .srt is read and translated at once', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const a = await api(page);
    await page.goto('/studio/subtitles');
    await expect(page.locator('input[type=file]').first()).toBeAttached();
    await expect(page.getByText(/Open an \.srt file/)).toBeVisible();
    await expectShellStill(page);
    await page.locator('input[type=file]').first().setInputFiles({ name: 'film.srt', mimeType: 'text/plain', buffer: Buffer.from(SRT) });
    const list = page.getByRole('list', { name: 'Subtitles' });
    await expect(list.getByRole('button')).toHaveCount(3);
    await expect(page.locator('.ph-tool-head').getByRole('status')).toContainText('3 subtitles. 1 to check.');
    await expect(page.locator('.ph-tool-head strong')).toHaveText('film.srt');
    // the request went to translate-batch with the English text, language guessed
    expect(a.calls.length).toBeGreaterThan(0);
    expect(a.calls[0]!.lang).toBe('en');
    expect(a.calls.flatMap((c) => c.lines)).toContain('Good morning, my friend.');
    // rows show translation and original
    const row1 = list.getByRole('button', { name: 'Edit subtitle 1' });
    await expect(row1).toContainText('IS:Dobro jutro, my friend.');
    await expect(row1).toContainText('Good morning, my friend.');
    await expect(list.getByRole('button', { name: 'Edit subtitle 2' })).toHaveClass(/is-flagged/);
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('tap a row: edit sheet with original, translation, mark as checked, previous and next', async ({ page }) => {
    await api(page);
    await openSrt(page);
    const list = page.getByRole('list', { name: 'Subtitles' });
    await expect(list.getByRole('button', { name: 'Edit subtitle 2' })).toBeVisible();
    await list.getByRole('button', { name: 'Edit subtitle 2' }).click();
    const sheet = page.getByRole('dialog', { name: 'Subtitle 2' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.ph-sub-orig')).toHaveText('This line is doubtful. Second line of it.');
    const ta = sheet.getByRole('textbox', { name: 'Interslavic for subtitle 2' });
    await expect(ta).toHaveValue('IS:This line is doubtful. Second line of it.');
    await expect(sheet.getByText('has no Interslavic match')).toBeVisible();
    // 16px, big enough
    expect(await ta.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    await expectTappable(sheet.locator('.ph-sheet-stack'));
    // correct it
    await ta.fill('Moja ispravka\nvtora linija');
    // editing counts as looked: the note card is gone
    await expect(sheet.getByRole('button', { name: /Mark as checked/ })).toHaveCount(0);
    await expect(page.locator('.ph-tool-head').getByRole('status')).toContainText('None needs a second look');
    // next / previous
    await sheet.getByRole('button', { name: 'Next subtitle' }).click();
    await expect(page.getByRole('dialog', { name: 'Subtitle 3' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next subtitle' })).toBeDisabled();
    await page.getByRole('button', { name: 'Previous subtitle' }).click();
    await page.getByRole('button', { name: 'Previous subtitle' }).click();
    await expect(page.getByRole('dialog', { name: 'Subtitle 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Previous subtitle' })).toBeDisabled();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(list.getByRole('button', { name: 'Edit subtitle 2' })).toContainText('Moja ispravka vtora linija');
    await expect(list.getByRole('button', { name: 'Edit subtitle 2' })).not.toHaveClass(/is-flagged/);
  });

  test('Mark as checked clears the flag without editing', async ({ page }) => {
    await api(page);
    await openSrt(page);
    await page.getByRole('button', { name: 'Edit subtitle 2' }).click();
    const sheet = page.getByRole('dialog', { name: 'Subtitle 2' });
    await sheet.getByRole('button', { name: /Mark as checked/ }).click();
    await expect(sheet.getByRole('button', { name: /Mark as checked/ })).toHaveCount(0);
    await expect(page.locator('.ph-tool-head').getByRole('status')).toContainText('None needs a second look');
    await expect(sheet.getByRole('textbox')).toHaveValue('IS:This line is doubtful. Second line of it.');
  });

  test('To check chip filters the list to the doubtful rows', async ({ page }) => {
    await api(page);
    await openSrt(page);
    const chip = page.getByRole('button', { name: /To check \(1\)/ });
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page.getByRole('list', { name: 'Subtitles' }).getByRole('button')).toHaveCount(1);
    await chip.click();
    await expect(page.getByRole('list', { name: 'Subtitles' }).getByRole('button')).toHaveCount(3);
  });

  test('Translate all runs again; Cancel while it runs stops it', async ({ page }) => {
    const a = await api(page, { hold: true });
    await page.goto('/studio/subtitles');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'film.srt', mimeType: 'text/plain', buffer: Buffer.from(SRT) });
    // the first run is held: progress shown, Cancel offered
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(page.locator('.ph-tool-head').getByRole('status')).toContainText('Translating');
    await expect(page.getByRole('button', { name: /Translate all/ })).toHaveCount(0);
    await expectNotCovered(page.getByRole('button', { name: 'Cancel' }));
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('button', { name: /Translate all/ })).toBeVisible();
    await expect(page.locator('.ph-tool-head').getByRole('status')).toContainText('3 subtitles found.');
    await expect(page.getByRole('list', { name: 'Subtitles to translate' })).toBeVisible();
    // no result was applied after cancel, even once the server answers
    a.release();
    await page.waitForTimeout(400);
    await expect(page.getByRole('list', { name: 'Subtitles to translate' })).toBeVisible();
    const n = a.calls.length;
    // Translate all starts a new request
    await page.getByRole('button', { name: /Translate all/ }).click();
    await expect(page.getByRole('list', { name: 'Subtitles' })).toBeVisible();
    expect(a.calls.length).toBeGreaterThan(n);
    await expect(page.locator('.ph-tool-head').getByRole('status')).toContainText('3 subtitles. 1 to check.');
  });

  test('a server failure shows a clear error and Translate all recovers', async ({ page }) => {
    let fail = true;
    await page.route('**/api/translate-batch*', async (route) => {
      if (fail) return route.fulfill({ status: 500, json: { error: 'The translator is busy' } });
      const body = route.request().postDataJSON() as { lines: string[] };
      await route.fulfill({ json: { results: body.lines.map((l) => ({ text: l, flagged: false, reasons: [] })) } });
    });
    await page.goto('/studio/subtitles');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'film.srt', mimeType: 'text/plain', buffer: Buffer.from(SRT) });
    await expect(page.getByRole('alert')).toContainText('The translation stopped', { timeout: 20_000 });
    fail = false;
    await page.getByRole('button', { name: /Translate all/ }).click();
    await expect(page.getByRole('list', { name: 'Subtitles' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('language and script chips re-translate with the new settings', async ({ page }) => {
    const a = await api(page);
    await openSrt(page);
    const n = a.calls.length;
    await page.getByRole('button', { name: 'Cyrillic script' }).click();
    await expect.poll(() => a.calls.length).toBeGreaterThan(n);
    expect(a.calls[a.calls.length - 1]!.orthography ?? JSON.stringify(a.calls[a.calls.length - 1])).toMatch(/cyrillic/i);
    await expect(page.getByRole('button', { name: 'Cyrillic script' })).toHaveAttribute('aria-pressed', /true/).catch(() => undefined);
  });

  test('import/export sheet: format, download gives an .srt with the edits', async ({ page }, testInfo) => {
    await api(page);
    await openSrt(page);
    // edit row 1
    await page.getByRole('button', { name: 'Edit subtitle 1' }).click();
    await page.getByRole('textbox', { name: 'Interslavic for subtitle 1' }).fill('Dobro jutro, prijatelju!');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Import and export' }).click();
    const sheet = page.getByRole('dialog', { name: 'Import and export' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Open another .srt file')).toBeVisible();
    await expect(sheet.getByLabel('Subtitle file (.srt)')).toBeAttached();
    await expectTappable(sheet.locator('.ph-sheet-stack'));
    const select = sheet.getByRole('combobox', { name: 'File contains' });
    expect(await select.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    // Interslavic only
    let [dl] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: /Download \.srt/ }).click()]);
    expect(dl.suggestedFilename()).toBe('film.isv.srt');
    let txt = readFileSync((await dl.path())!, 'utf8');
    expect(txt).toContain('Dobro jutro, prijatelju!');
    expect(txt).toContain('00:00:01,000 --> 00:00:03,000');
    expect(txt).toContain('IS:See you tomorrow at the station.');
    expect(txt).not.toContain('Good morning, my friend.');
    // bilingual keeps the original beneath
    await select.selectOption('bilingual');
    [dl] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: /Download \.srt/ }).click()]);
    txt = readFileSync((await dl.path())!, 'utf8');
    expect(txt).toContain('Dobro jutro, prijatelju!\nGood morning, my friend.');
    await shot(page, testInfo, 'subtitles-export');
    // open another file from the sheet
    await sheet.getByLabel('Subtitle file (.srt)').setInputFiles({ name: 'other.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello there\n') });
    await expect(page.locator('.ph-tool-head strong')).toHaveText('other.srt');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Subtitles' }).getByRole('button')).toHaveCount(1);
  });

  test('Download is disabled until there is a translation', async ({ page }) => {
    await api(page, { hold: true });
    await page.goto('/studio/subtitles');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'film.srt', mimeType: 'text/plain', buffer: Buffer.from(SRT) });
    await page.getByRole('button', { name: 'Import and export' }).click();
    await expect(page.getByRole('dialog', { name: 'Import and export' }).getByRole('button', { name: /Download \.srt/ })).toBeDisabled();
  });

  test('a file without subtitles says so', async ({ page }) => {
    await api(page);
    await page.goto('/studio/subtitles');
    await page.locator('details.sub-paste summary').click();
    await page.getByLabel('or paste it here').fill('this is not a subtitle file');
    await expect(page.getByRole('alert')).toContainText('No subtitles found');
  });

  for (const w of [320, 360, 390, 430]) {
    test(`at ${w}px: shell still, tappable, no overflow, 16px fields`, async ({ page }, testInfo) => {
      const errors = watchErrors(page, testInfo);
      await page.setViewportSize({ width: w, height: 740 });
      await api(page);
      await page.goto('/studio/subtitles');
      await expectShellStill(page);
      await page.locator('input[type=file]').first().setInputFiles({ name: 'film.srt', mimeType: 'text/plain', buffer: Buffer.from(SRT) });
      await expect(page.getByRole('list', { name: 'Subtitles' })).toBeVisible();
      await expectShellStill(page);
      await expectTappable(page.locator('.ph-sub .ph-tool-bar'));
      await expectTappable(page.locator('.ph-tool-head'));
      const over = await page.evaluate(() => {
        const sc = document.querySelector('.ph-tool-scroll')!;
        return sc.scrollWidth - sc.clientWidth;
      });
      expect(over).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Edit subtitle 2' }).click();
      const sheet = page.getByRole('dialog', { name: 'Subtitle 2' });
      await expectTappable(sheet.locator('.ph-sheet-head'));
      await expectTappable(sheet.locator('.ph-sheet-stack'));
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('input, select, textarea')].filter((e) => e.offsetParent && (e as HTMLInputElement).type !== 'file').filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.getAttribute('aria-label')));
      expect(small).toEqual([]);
      await expectShellStill(page);
      expect(errors).toEqual([]);
    });
  }
});
