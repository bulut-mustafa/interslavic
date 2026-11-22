import { test, expect, type Page, type Locator } from '@playwright/test';
import { expectNotCovered, expectShellStill, expectTappable, iosKeyboard, mockApi, shot, watchErrors } from './helpers';

const LONG_Q = 'Zdravo, moj dragi prijatelju, kako ti jest dnes, kogda sunce sija nad velikym gradom i vsi ljudi idu po ulicam k svojim domam, a ja čekam tebe tu već dolgo vremeny. '.repeat(3);
const LONG_A = 'Odgovor je dolgy i imaje mnogo slov, tak že tekst mora byti viděn cělo i ne sme byti odrezan v poli. '.repeat(3);

async function openEdit(page: Page): Promise<Locator> {
  await mockApi(page);
  await page.goto('/studio/worksheets');
  await expect(page.getByRole('article', { name: 'Worksheet preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Edit worksheet' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Sheet settings')).toBeVisible();
  await page.waitForTimeout(400);
  return sheet;
}

/** scrollHeight vs clientHeight of every textarea inside the sheet. */
async function clipped(sheet: Locator): Promise<string[]> {
  return sheet.evaluate((el) =>
    [...el.querySelectorAll('textarea')]
      .filter((t) => t.offsetParent !== null)
      .filter((t) => t.scrollHeight > t.clientHeight + 1)
      .map((t) => `${t.getAttribute('aria-label')}: scroll ${t.scrollHeight} > client ${t.clientHeight}`),
  );
}

const body = (sheet: Locator) => sheet.locator('.ph-sheet-body');

async function addQuestion(page: Page, sheet: Locator, label: string): Promise<void> {
  await sheet.getByRole('button', { name: 'Add question' }).click();
  await sheet.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
}

test.describe('worksheets', () => {
  test('preview paper, tall Edit sheet, settings card and one typed card per question', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const sheet = await openEdit(page);
    const vh = page.viewportSize()!.height;
    const box = (await sheet.boundingBox())!;
    expect(box.height, 'Edit opens tall (>= 75% of the screen)').toBeGreaterThan(vh * 0.75);
    await expect(sheet.getByRole('region', { name: 'Sheet settings' })).toBeVisible();
    // settings fold open: title field, answer key switch
    await sheet.getByRole('button', { name: /Sheet settings/ }).click();
    await expect(sheet.getByRole('textbox', { name: 'Worksheet title' })).toBeVisible();
    await expect(sheet.getByRole('switch', { name: 'Add an answer key on a new page' })).toHaveAttribute('aria-checked', 'true');
    // section fields
    await expect(sheet.getByRole('textbox', { name: /^Title of section/ }).first()).toBeVisible();
    await expect(sheet.getByRole('textbox', { name: /^Instruction for section/ }).first()).toBeVisible();
    // a card per question with a type label
    const cards = sheet.locator('article.wse-card');
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < await cards.count(); i++) {
      await expect(cards.nth(i).locator('.wse-kind')).toHaveText(/^(Fill in the blank|Multiple choice|Translate|Table)$/);
    }
    expect(await clipped(sheet)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('very long text grows the textareas: nothing scrolls inside a box, nothing is cut off', async ({ page }) => {
    const sheet = await openEdit(page);
    await addQuestion(page, sheet, 'Fill in the blank');
    const card = sheet.locator('article.wse-card[data-kind="fill"]').last();
    const q = card.getByRole('textbox', { name: /^Question \d+$/ });
    const a = card.getByRole('textbox', { name: /^Answer to question \d+$/ });
    await q.scrollIntoViewIfNeeded();
    const h0 = (await q.boundingBox())!.height;
    await q.fill(LONG_Q);
    await a.fill(LONG_A);
    expect((await q.boundingBox())!.height, 'the question box grew').toBeGreaterThan(h0 * 2);
    expect(await clipped(sheet), 'text cut off in a box').toEqual([]);
    // the sheet body scrolls (content taller than the body)
    const m = await body(sheet).evaluate((b) => ({ s: b.scrollHeight, c: b.clientHeight, o: getComputedStyle(b).overflowY }));
    expect(m.s).toBeGreaterThan(m.c);
    expect(m.o).toBe('auto');
    // wrapped text visible: the box right edge inside the sheet
    const qb = (await q.boundingBox())!;
    expect(qb.x + qb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    // shrink again
    await q.fill('Kratko');
    await expect.poll(async () => (await q.boundingBox())!.height).toBeLessThan(h0 * 2);
    expect(await clipped(sheet)).toEqual([]);
  });

  test('typing 60 characters one by one keeps focus and never moves the sheet', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const sheet = await openEdit(page);
    await addQuestion(page, sheet, 'Fill in the blank');
    const q = sheet.locator('article.wse-card[data-kind="fill"]').last().getByRole('textbox', { name: /^Answer to question \d+$/ });
    await q.scrollIntoViewIfNeeded();
    await q.click();
    await page.evaluate(() => {
      const w = window as unknown as { __tag: Element; __tops: number[]; __iv: number };
      w.__tag = document.activeElement!;
      w.__tag.setAttribute('data-probe', '1');
      w.__tops = [];
      const b = document.querySelector('.ph-sheet-body')!;
      w.__iv = window.setInterval(() => w.__tops.push(b.scrollTop), 50);
    });
    const top0 = await body(sheet).evaluate((b) => b.scrollTop);
    // Baseline: the same key presses into a bare textarea, so a loaded machine does not fail the test.
    await page.evaluate(() => {
      const t = document.createElement('textarea');
      t.id = 'zz-baseline';
      t.style.cssText = 'position:fixed;left:0;top:0;width:50px;height:20px;opacity:0.01;z-index:99999';
      document.body.appendChild(t);
      t.focus();
    });
    const base: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = Date.now();
      await page.keyboard.type('x');
      base.push(Date.now() - t);
    }
    await page.evaluate(() => document.getElementById('zz-baseline')!.remove());
    await q.focus();
    const baseMean = base.reduce((x, y) => x + y, 0) / base.length;
    const lat: number[] = [];
    const text = 'abcdefghij klmnopqrst uvwxyz0123 456789abcd efghijklmn opqrstuvwx';
    for (const ch of text.slice(0, 60)) {
      const t = Date.now();
      await page.keyboard.type(ch);
      lat.push(Date.now() - t);
      const same = await page.evaluate(() => document.activeElement?.getAttribute('data-probe'));
      expect(same, 'focus moved to another element (remount)').toBe('1');
    }
    const tops = await page.evaluate(() => {
      const w = window as unknown as { __tops: number[]; __iv: number };
      clearInterval(w.__iv);
      return w.__tops;
    });
    expect(Math.max(...tops) - Math.min(...tops, top0), `sheet scrollTop jumped: ${tops.join(',')}`).toBeLessThanOrEqual(2);
    const mean = lat.reduce((x, y) => x + y, 0) / lat.length;
    expect(mean, `mean per key ${mean.toFixed(1)}ms vs bare textarea ${baseMean.toFixed(1)}ms`).toBeLessThan(Math.max(50, baseMean * 2.5 + 25));
    await expect(q).toHaveValue(/abcdefghij klmnopqrst/);
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('with the keyboard up: a hidden field scrolls into view at most once, a visible one not at all', async ({ page }) => {
    const sheet = await openEdit(page);
    for (let i = 0; i < 3; i++) await addQuestion(page, sheet, 'Fill in the blank');
    await sheet.getByRole('textbox', { name: 'Title of section Exercises' }).first().scrollIntoViewIfNeeded().catch(() => undefined);
    await iosKeyboard(page, 300);
    await expect(page.locator('html')).toHaveClass(/ph-kb-open/);
    await expectShellStill(page);
    // the Add bar is hidden while the keyboard is up
    await expect(sheet.locator('.wse-bar')).toBeHidden();
    const fields = sheet.locator('textarea.wse-input:visible');
    const n = await fields.count();
    expect(n).toBeGreaterThan(4);
    // pick a field below the visible area
    const target = fields.nth(n - 1);
    await target.evaluate((el) => {
      const b = el.closest('.ph-sheet-body')!;
      b.scrollTop = 0;
    });
    const visible = async () =>
      target.evaluate((el) => {
        const b = el.closest('.ph-sheet-body')!.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
      });
    // sample scrollTop changes after tapping
    await page.evaluate(() => {
      const w = window as unknown as { __log: number[]; __iv: number };
      const b = document.querySelector('.ph-sheet-body') as HTMLElement;
      w.__log = [b.scrollTop];
      w.__iv = window.setInterval(() => {
        if (b.scrollTop !== w.__log[w.__log.length - 1]) w.__log.push(b.scrollTop);
      }, 16);
    });
    const hiddenBefore = !(await visible());
    expect(hiddenBefore, 'precondition: the field starts out of view').toBe(true);
    await target.evaluate((el) => (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'instant' as ScrollBehavior }));
    if (hiddenBefore) await target.evaluate((el) => (el.closest('.ph-sheet-body') as HTMLElement).scrollTo(0, 0));
    await page.evaluate(() => {
      const w = window as unknown as { __log: number[] };
      w.__log.length = 1;
      w.__log[0] = (document.querySelector('.ph-sheet-body') as HTMLElement).scrollTop;
    });
    await target.focus();
    await page.waitForTimeout(900);
    const log = await page.evaluate(() => (window as unknown as { __log: number[] }).__log);
    expect(await visible(), 'focused field is visible above the keyboard').toBe(true);
    // each re-centering counts as one change; the app does one at 120 and one at 420 ms at most, settling to one position
    const distinct = new Set(log.slice(1));
    expect(distinct.size, `scrollTop path ${log.join(',')}`).toBeLessThanOrEqual(2);
    await page.evaluate(() => clearInterval((window as unknown as { __iv: number }).__iv));
    // tapping the same (already visible) field again does not move the sheet
    const before = await body(sheet).evaluate((b) => b.scrollTop);
    await target.focus();
    await page.waitForTimeout(700);
    const after = await body(sheet).evaluate((b) => b.scrollTop);
    expect(Math.abs(after - before), 'a visible field must not scroll').toBeLessThanOrEqual(1);
    await expectShellStill(page);
    await iosKeyboard(page, 0);
    await expect(sheet.locator('.wse-bar')).toBeVisible();
  });

  test('typing long text with the keyboard up: focus stays, the caret stays on screen, the sheet does not jump', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const sheet = await openEdit(page);
    await addQuestion(page, sheet, 'Fill in the blank');
    await iosKeyboard(page, 300);
    const a = sheet.locator('article.wse-card[data-kind="fill"]').last().getByRole('textbox', { name: /^Answer to question \d+$/ });
    await a.focus();
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const w = window as unknown as { __tag: Element; __tops: number[]; __iv: number };
      w.__tag = document.activeElement!;
      w.__tag.setAttribute('data-probe', '1');
      const b = document.querySelector('.ph-sheet-body')!;
      w.__tops = [b.scrollTop];
      w.__iv = window.setInterval(() => w.__tops.push(b.scrollTop), 50);
    });
    const words = 'rěka voda mnogo slov tut pišemo dolgy tekst koji mora byti viděn cělo '.repeat(2);
    for (const ch of words) {
      await page.keyboard.type(ch);
    }
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const w = window as unknown as { __tops: number[]; __iv: number };
      clearInterval(w.__iv);
      const t = document.activeElement as HTMLTextAreaElement;
      const b = document.querySelector('.ph-sheet-body')!.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      return { tops: w.__tops, probe: t.getAttribute('data-probe'), clipped: t.scrollHeight > t.clientHeight + 1, inView: tr.bottom <= b.bottom + 1 && tr.top >= b.top - 1, rows: Math.round(tr.height) };
    });
    expect(r.probe, 'focus left the field').toBe('1');
    expect(r.clipped, 'text cut off in the box').toBe(false);
    expect(r.rows, 'the box grew to several lines').toBeGreaterThan(80);
    // the sheet may follow the growing box downward, but never jumps up
    for (let i = 1; i < r.tops.length; i++) expect(r.tops[i]!, `scrollTop went backwards: ${r.tops.join(',')}`).toBeGreaterThanOrEqual(r.tops[i - 1]! - 1);
    await expectShellStill(page);
    expect(errors).toEqual([]);
  });

  test('multiple choice: radios, add, remove, Enter, editing the correct text keeps it correct', async ({ page }) => {
    const sheet = await openEdit(page);
    await addQuestion(page, sheet, 'Multiple choice');
    const card = sheet.locator('article.wse-card[data-kind="choice"]').last();
    await expect(card).toBeVisible();
    await expect(card.getByRole('radiogroup')).toBeVisible();
    // new question starts with at least 2 choices; fill them
    let opts = card.locator('textarea[aria-label^="Choice "]');
    const start = await opts.count();
    expect(start).toBeGreaterThanOrEqual(2);
    await expect(card.getByRole('status')).toContainText('No correct answer');
    await opts.nth(0).fill('jabłko');
    await opts.nth(1).fill('hruška');
    const radio1 = card.getByRole('radio', { name: 'Choice 2 is the correct answer' });
    // tap the circle (the label around it is the tap area)
    await radio1.locator('xpath=ancestor::label').click();
    await expect(radio1).toBeChecked();
    await expect(card.getByRole('status')).toHaveText('Correct answer: hruška');
    // the circle's tap area is large enough
    const lb = (await radio1.locator('xpath=ancestor::label').boundingBox())!;
    expect(Math.min(lb.width, lb.height)).toBeGreaterThanOrEqual(40);
    // editing the correct choice's text keeps it correct
    await opts.nth(1).fill('hruška zrěla');
    await expect(radio1).toBeChecked();
    await expect(card.getByRole('status')).toHaveText('Correct answer: hruška zrěla');
    // Enter adds the next choice and focuses it
    await opts.nth(1).focus();
    await page.keyboard.press('Enter');
    opts = card.locator('textarea[aria-label^="Choice "]');
    await expect(opts).toHaveCount(start + 1);
    await expect(opts.nth(start)).toBeFocused();
    // add choice button
    await card.getByRole('button', { name: 'Add choice' }).click();
    await expect(opts).toHaveCount(start + 2);
    // remove down to 2: remove buttons disabled at 2
    const removes = card.getByRole('button', { name: /^Remove choice/ });
    while ((await opts.count()) > 2) {
      await removes.last().click();
    }
    await expect(opts).toHaveCount(2);
    for (let i = 0; i < 2; i++) await expect(removes.nth(i)).toBeDisabled();
    // add one and remove the correct one: marker cleared
    await card.getByRole('button', { name: 'Add choice' }).click();
    await opts.nth(2).fill('slivka');
    await removes.nth(1).click();
    await expect(card.getByRole('status')).toContainText('No correct answer');
    await expect(card.getByRole('radio', { checked: true })).toHaveCount(0);
  });

  test('fill in the blank: Insert a blank adds ___ at the caret', async ({ page }) => {
    const sheet = await openEdit(page);
    await addQuestion(page, sheet, 'Fill in the blank');
    const card = sheet.locator('article.wse-card[data-kind="fill"]').last();
    const q = card.getByRole('textbox', { name: /^Question \d+$/ });
    await q.fill('Dajte knigu.');
    await q.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(6, 6);
    });
    await card.getByRole('button', { name: /Insert a blank/ }).click();
    await expect(q).toHaveValue('Dajte ___knigu.');
    await expect(card.locator('.wse-blank').first()).toBeVisible();
  });

  test('Add question: every kind from the sticky bar; the new card gets the focus', async ({ page }) => {
    const sheet = await openEdit(page);
    for (const [label, kind] of [
      ['Fill in the blank', 'fill'],
      ['Multiple choice', 'choice'],
      ['Translate', 'phrase'],
    ] as const) {
      const before = await sheet.locator(`article.wse-card[data-kind="${kind}"]`).count();
      await sheet.getByRole('button', { name: 'Add question' }).click();
      await expect(sheet.getByRole('menu', { name: 'Kind of question' })).toBeVisible();
      await sheet.getByRole('menuitem', { name: new RegExp(`^${label}`) }).click();
      await expect(sheet.locator(`article.wse-card[data-kind="${kind}"]`)).toHaveCount(before + 1);
      await expect(sheet.getByRole('menu')).toHaveCount(0);
      const last = sheet.locator(`article.wse-card[data-kind="${kind}"]`).last();
      await expect(last.getByText('Yours')).toBeVisible();
      await expect(last.locator('textarea').first()).toBeFocused();
    }
  });

  test('the sticky Add bar sits flush at the bottom of the sheet', async ({ page }) => {
    const sheet = await openEdit(page);
    const bar = sheet.locator('.wse-bar');
    await expect(bar).toBeVisible();
    const sb = (await sheet.boundingBox())!;
    const bb = (await bar.boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(Math.abs(bb.y + bb.height - Math.min(sb.y + sb.height, vh)), 'bar bottom flush with the sheet bottom').toBeLessThanOrEqual(2);
    await expectNotCovered(sheet.getByRole('button', { name: 'Add question' }));
    await body(sheet).evaluate((b) => (b.scrollTop = b.scrollHeight));
    const bb2 = (await bar.boundingBox())!;
    expect(Math.abs(bb2.y + bb2.height - Math.min(sb.y + sb.height, vh))).toBeLessThanOrEqual(2);
    // no card peeks out below the bar: the lowest pixel row of the bar is the sheet bottom
    const under = await bar.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 8, r.bottom - 2);
      return hit?.closest('.wse-bar') ? 'bar' : (hit?.className ?? 'none');
    });
    expect(under).toBe('bar');
  });

  test('card actions: 44px, 2x2 grid, not covered; delete shows Undo and Undo restores in place', async ({ page }) => {
    const sheet = await openEdit(page);
    const card = sheet.locator('article.wse-card').nth(1);
    await card.scrollIntoViewIfNeeded();
    const actions = card.locator('.wse-actions');
    const btns = actions.getByRole('button');
    const names = ['Move question', 'Duplicate', 'Delete'];
    expect(await btns.count()).toBeGreaterThanOrEqual(4);
    const rects = [];
    for (let i = 0; i < 4; i++) {
      const b = btns.nth(i);
      const r = (await b.boundingBox())!;
      rects.push(r);
      expect(r.height, `button ${i} height`).toBeGreaterThanOrEqual(43.5);
      expect(r.width).toBeGreaterThanOrEqual(43.5);
    }
    expect(names.length).toBe(3);
    // 2x2: two distinct rows, two distinct columns
    expect(new Set(rects.map((r) => Math.round(r.y))).size, 'two rows').toBe(2);
    expect(new Set(rects.map((r) => Math.round(r.x))).size, 'two columns').toBe(2);
    await expectNotCovered(btns.nth(3));
    await expectNotCovered(btns.nth(0));
    await expectTappable(actions, 44);
    // delete -> toast, undo -> same position
    const before = await sheet.locator('article.wse-card').evaluateAll((a) => a.map((x) => x.querySelector('.wse-input')?.getAttribute('aria-label') + '|' + (x as HTMLElement).dataset.kind));
    const n = before.length;
    const second = card.getByRole('textbox').first();
    const secondVal = await second.inputValue();
    await card.getByRole('button', { name: /^Delete question/ }).click();
    await expect(sheet.locator('article.wse-card')).toHaveCount(n - 1);
    const toast = sheet.locator('.wse-toast');
    await expect(toast).toBeVisible();
    await expectNotCovered(toast.getByRole('button', { name: 'Undo' }));
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(sheet.locator('article.wse-card')).toHaveCount(n);
    await expect(sheet.locator('article.wse-card').nth(1).getByRole('textbox').first()).toHaveValue(secondVal);
    await expect(toast).toBeHidden();
  });

  test('Up, Down and Copy work; Yours and Put back on a changed ready-made question', async ({ page }) => {
    const sheet = await openEdit(page);
    const cards = sheet.locator('article.wse-card');
    const first = cards.nth(0);
    const firstText = await first.getByRole('textbox').first().inputValue();
    await expect(first.getByRole('button', { name: /^Move question \d+ earlier/ })).toBeDisabled();
    await first.getByRole('button', { name: /^Move question \d+ later/ }).click();
    await expect(cards.nth(1).getByRole('textbox').first()).toHaveValue(firstText);
    await expect(cards.nth(1).getByRole('button', { name: /earlier/ })).toBeEnabled();
    // Copy
    const n = await cards.count();
    await cards.nth(1).getByRole('button', { name: /^Duplicate question/ }).click();
    await expect(cards).toHaveCount(n + 1);
    // change a ready-made one -> Yours + Put back
    const target = cards.nth(0);
    await expect(target.getByText('Yours')).toHaveCount(0);
    const field = target.getByRole('textbox').first();
    const orig = await field.inputValue();
    await field.fill(orig + ' (moj)');
    await expect(target.getByText('Yours')).toBeVisible();
    const put = target.getByRole('button', { name: /Put question \d+ back/ });
    await expect(put).toBeVisible();
    await put.click();
    await expect(target.getByRole('textbox').first()).toHaveValue(orig);
    await expect(target.getByText('Yours')).toHaveCount(0);
  });

  test('edits show in the paper preview and survive a reload; Start over asks first; Topics chip; print present', async ({ page }) => {
    const sheet = await openEdit(page);
    await sheet.getByRole('button', { name: /Sheet settings/ }).click();
    await sheet.getByRole('textbox', { name: 'Worksheet title' }).fill('Moj test');
    const q = sheet.getByRole('textbox', { name: /^Question \d+$/ }).first();
    await q.fill('Moje pytanje ___ tut.');
    await expect(page.getByRole('article', { name: 'Worksheet preview' }).getByRole('heading', { name: 'Moj test' }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('article', { name: 'Worksheet preview' })).toContainText('Moje pytanje');
    await page.waitForTimeout(500);
    const stored = await page.evaluate(() => localStorage.getItem('interslavic-worksheet-v1'));
    expect(stored).toContain('Moje pytanje');
    expect(stored).toContain('Moj test');
    await page.reload();
    await expect(page.getByRole('article', { name: 'Worksheet preview' })).toContainText('Moje pytanje');
    await expect(page.getByRole('button', { name: /Print or save PDF/ })).toBeEnabled();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const s2 = page.getByRole('dialog', { name: 'Edit worksheet' });
    await expect(s2.getByRole('textbox', { name: /^Question \d+$/ }).first()).toHaveValue('Moje pytanje ___ tut.');
    // Topics chip
    await s2.getByRole('button', { name: 'Topics' }).click();
    await expect(s2.getByRole('button', { name: 'Select everything' })).toBeVisible();
    await s2.getByRole('button', { name: 'Questions' }).click();
    // Start over asks confirmation
    await s2.getByRole('button', { name: /Sheet settings/ }).click();
    await s2.getByRole('button', { name: 'Start over' }).click();
    await expect(s2.getByRole('button', { name: 'Discard my changes' })).toBeVisible();
    await s2.getByRole('button', { name: 'Keep them' }).click();
    await expect(s2.getByRole('button', { name: 'Start over' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('interslavic-worksheet-v1'))).toContain('Moje pytanje');
    await s2.getByRole('button', { name: 'Start over' }).click();
    await s2.getByRole('button', { name: 'Discard my changes' }).click();
    await expect(s2.getByRole('textbox', { name: /^Question \d+$/ }).first()).not.toHaveValue('Moje pytanje ___ tut.');
  });

  test('empty worksheet shows the note card with Pick topics', async ({ page }) => {
    await mockApi(page);
    await page.goto('/studio/worksheets');
    await page.evaluate(() => localStorage.setItem('interslavic-worksheet-v1', JSON.stringify({ draft: { patches: {}, removed: [], custom: [], extra: [], sectionText: {}, order: {} }, title: 'x', key: true, selection: { exercises: [], tables: [], phrases: [] } })));
    await page.reload();
    await expect(page.getByText('Nothing on the worksheet yet')).toBeVisible();
    await expect(page.getByRole('button', { name: /Print or save PDF/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Pick topics' }).click();
    await expect(page.getByRole('dialog', { name: 'Edit worksheet' }).getByRole('button', { name: 'Select everything' })).toBeVisible();
  });

  test('all text controls are at least 16px and nothing overflows', async ({ page }, testInfo) => {
    const errors = watchErrors(page, testInfo);
    const sheet = await openEdit(page);
    await sheet.getByRole('button', { name: /Sheet settings/ }).click();
    await addQuestion(page, sheet, 'Multiple choice');
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('input:not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea')]
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ l: e.getAttribute('aria-label'), f: parseFloat(getComputedStyle(e).fontSize) }))
        .filter((x) => x.f < 16),
    );
    expect(small).toEqual([]);
    await expectShellStill(page);
    const overflow = await sheet.evaluate((s) => s.querySelector('.ph-sheet-body')!.scrollWidth - s.querySelector('.ph-sheet-body')!.clientWidth);
    expect(overflow, 'sheet body scrolls sideways').toBeLessThanOrEqual(1);
    await shot(page, testInfo, 'worksheets-edit');
    expect(errors).toEqual([]);
  });

  for (const w of [320, 360, 390, 430]) {
    test(`at ${w}px wide: shell still, controls tappable, no overflow`, async ({ page }, testInfo) => {
      const errors = watchErrors(page, testInfo);
      await page.setViewportSize({ width: w, height: 760 });
      const sheet = await openEdit(page);
      await expectShellStill(page);
      await expectTappable(page.locator('.ph-ws .ph-tool-bar'));
      const card = sheet.locator('article.wse-card').first();
      await card.scrollIntoViewIfNeeded();
      await expectTappable(card.locator('.wse-actions'), 44);
      await expectTappable(sheet.locator('.ph-sheet-head'));
      const over = await sheet.evaluate((s) => {
        const b = s.querySelector('.ph-sheet-body')!;
        const bad = [...b.querySelectorAll<HTMLElement>('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && e.offsetParent).map((e) => e.className).slice(0, 5);
        return { sw: b.scrollWidth - b.clientWidth, bad };
      });
      expect(over.sw).toBeLessThanOrEqual(1);
      expect(over.bad).toEqual([]);
      expect(await clipped(sheet)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('article', { name: 'Worksheet preview' })).toBeVisible();
      await expectTappable(page.locator('.ph-ws .ph-tool-bar'));
      expect(errors).toEqual([]);
    });
  }
});
