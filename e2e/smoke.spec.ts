import { test, expect } from '@playwright/test';
import { expectShellStill, mockApi, watchErrors } from './helpers';

test('the site opens on a phone without errors, in the phone layout', async ({ page }, testInfo) => {
  const errors = watchErrors(page, testInfo);
  await mockApi(page);
  await page.goto('/');
  await expect(page.locator('.ph-app')).toBeVisible();
  await expectShellStill(page);
  expect(errors).toEqual([]);
});
