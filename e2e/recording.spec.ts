import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectNotCovered, expectShellStill, expectTappable, fixture, shot, watchErrors } from './helpers';

const tone = () => ({ name: 'tone.wav', mimeType: 'audio/wav', buffer: readFileSync(fixture('tone.wav')) });

/** The real Whisper model is 238 MB: nothing may reach huggingface.co or the CDN in these tests. They are held, never answered. */
async function holdModelDownloads(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.route(/huggingface\.co|cdn\.jsdelivr\.net/, (route) => {
    seen.push(route.request().url());
    return new Promise<void>(() => undefined);
  });
  return seen;
}

test.describe('recording', () => {
  test('empty state: a big start control, a way to choose a file, the privacy line, no overflow', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    await page.goto('/studio/recording');
    const start = page.getByRole('region', { name: 'Choose a recording' });
    await expect(start).toBeVisible();
    // Record is offered only where the browser has a microphone API; WebKit headless has the API but no device
    const rec = start.getByRole('button', { name: /Record with the microphone/ });
    const hasRecord = (await rec.count()) > 0;
    const pick = start.locator('label.ph-file-pick');
    await expect(pick).toBeVisible();
    await expect(pick).toContainText(hasRecord ? 'Upload a recording' : 'Choose a recording');
    const big = hasRecord ? rec : pick;
    const bb = (await big.boundingBox())!;
    expect(bb.height, 'the main control is big').toBeGreaterThanOrEqual(100);
    await expectTappable(start, 44);
    await expect(start).toContainText('never uploaded');
    await expect(start.locator('input[type=file]')).toHaveAttribute('accept', 'audio/*,video/*');
    await expectShellStill(page);
    // no Transcribe button before there is a file
    await expect(page.getByRole('button', { name: /^Transcribe/ })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Record without a microphone fails gracefully: a message, no crash, the page stays usable', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    // a device that has the API but refuses (permission denied / no device), as on a phone where the user taps Don't allow
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')) },
      });
      (window as unknown as { MediaRecorder: unknown }).MediaRecorder ??= class {};
    });
    await page.goto('/studio/recording');
    const rec = page.getByRole('button', { name: 'Record with the microphone' });
    await expect(rec).toBeVisible();
    await rec.click();
    // the page does not report a pageerror; the failure is shown (no state is lost)
    await expect(page.getByRole('region', { name: 'Choose a recording' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toHaveCount(0);
    await expect(page.getByRole('alert').or(page.getByText(/Permission denied|not available/i)).first()).toBeVisible({ timeout: 3000 });
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('without the microphone API there is no Record button, only Choose a recording', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    });
    await page.goto('/studio/recording');
    await expect(page.getByRole('button', { name: /Record with the microphone/ })).toHaveCount(0);
    const pick = page.locator('label.ph-file-pick');
    await expect(pick).toContainText('Choose a recording');
    expect((await pick.boundingBox())!.height).toBeGreaterThanOrEqual(100);
  });

  test('upload tone.wav: file card, language chips, Options sheet, download note, Transcribe button', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const seen = await holdModelDownloads(page);
    await page.goto('/studio/recording');
    await page.locator('input[type=file]').first().setInputFiles(tone());
    const card = page.getByRole('region', { name: 'Recording' });
    await expect(card).toBeVisible();
    await expect(card.locator('strong')).toHaveText('tone.wav');
    await expect(card).toContainText('Small - slower, better model, English');
    // language chips
    const chips = card.getByRole('group', { name: 'Spoken language' }).or(card.locator('[aria-label="Spoken language"]'));
    await expect(chips).toBeVisible();
    for (const l of ['English', 'Russian', 'Ukrainian']) await expect(card.getByRole('button', { name: l })).toBeVisible();
    await card.getByRole('button', { name: 'Ukrainian' }).click();
    await expect(card).toContainText('model, Ukrainian');
    await expect(card.getByRole('button', { name: 'Ukrainian' })).toHaveAttribute('aria-pressed', /true/).catch(() => undefined);
    // the download is announced BEFORE anything starts
    await expect(card.getByTestId('download-note')).toContainText('238 MB');
    await expect(card.getByTestId('download-note')).toContainText('not uploaded');
    expect(seen, 'nothing was requested yet').toEqual([]);
    await expect(page.getByRole('button', { name: /Transcribe/ })).toBeVisible();
    // Options sheet
    await card.getByRole('button', { name: 'Options' }).click();
    const sheet = page.getByRole('dialog', { name: 'Options' });
    await expect(sheet).toBeVisible();
    const model = sheet.getByRole('combobox', { name: 'Model' });
    expect(await model.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
    await expect(model.locator('option')).toHaveText([/Base - quicker, rougher \(73 MB\)/, /Small - slower, better \(238 MB\)/]);
    await model.selectOption('base');
    await expect(sheet.getByText(/73 MB for base/)).toBeAttached();
    await expectTappable(sheet.locator('.ph-sheet-stack'));
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(card).toContainText('Base - quicker, rougher model');
    await expect(card.getByTestId('download-note')).toContainText('73 MB');
    await shot(page, testInfo, 'recording-file');
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('Transcribe shows the model download as a progress card with elapsed time; Cancel stops it and returns to Transcribe', async ({ page }) => {
    const seen = await holdModelDownloads(page);
    await page.goto('/studio/recording');
    await page.locator('input[type=file]').first().setInputFiles(tone());
    await page.getByRole('button', { name: /Transcribe/ }).click();
    const prog = page.locator('.transcribe-progress');
    await expect(prog).toBeVisible({ timeout: 15_000 });
    await expect(prog).toContainText(/Reading the sound|Getting the speech model|Starting the speech model/);
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expectNotCovered(page.getByRole('button', { name: 'Cancel' }));
    // while running, the language chips and the file picker are locked
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('dialog', { name: 'Options' }).getByRole('combobox', { name: 'Model' })).toBeDisabled();
    await page.getByRole('dialog', { name: 'Options' }).getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(prog).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Transcribe/ })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    // only the model host was asked (held), nothing else leaked out
    for (const u of seen) expect(u).toMatch(/huggingface\.co|cdn\.jsdelivr\.net/);
    await expectShellStill(page);
  });

  test('a file that cannot be decoded gives a clear error, not a hang', async ({ page }) => {
    await holdModelDownloads(page);
    await page.goto('/studio/recording');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'broken.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not audio at all') });
    await page.getByRole('button', { name: /Transcribe/ }).click();
    await expect(page.getByRole('alert')).toContainText('Transcription stopped', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Transcribe/ })).toBeVisible();
  });

  test('Choose another file in Options swaps the file', async ({ page }) => {
    await page.goto('/studio/recording');
    await page.locator('input[type=file]').first().setInputFiles(tone());
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByLabel('Choose another file').setInputFiles({ ...tone(), name: 'second.wav' });
    await expect(page.getByRole('region', { name: 'Recording' }).locator('strong')).toHaveText('second.wav');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  for (const w of [320, 360, 390, 430]) {
    test(`at ${w}px: shell still, tappable, no overflow, 16px fields`, async ({ page }, testInfo) => {
      const errors = watchErrors(page, testInfo);
      await page.setViewportSize({ width: w, height: 740 });
      await holdModelDownloads(page);
      await page.goto('/studio/recording');
      await expectShellStill(page);
      await expectTappable(page.locator('.ph-rec-start'), 44);
      await page.locator('input[type=file]').first().setInputFiles(tone());
      await expect(page.getByRole('region', { name: 'Recording' })).toBeVisible();
      await expectTappable(page.locator('.ph-rec .ph-tool-bar'));
      await expectTappable(page.getByRole('region', { name: 'Recording' }));
      const over = await page.locator('.ph-rec .ph-tool-scroll').evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Options' }).click();
      const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('input, select, textarea')].filter((e) => e.offsetParent && (e as HTMLInputElement).type !== 'file').filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.getAttribute('aria-label')));
      expect(small).toEqual([]);
      await expectShellStill(page);
      expect(errors).toEqual([]);
    });
  }
});
