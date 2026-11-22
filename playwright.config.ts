import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests in real browsers: WebKit (Safari's engine) with iPhone profiles,
 * Chromium with an Android profile, and WebKit at desktop size. Run: npm run e2e
 * (first time: npx playwright install webkit chromium). The web app is served by Vite;
 * the translator API is mocked in the tests (see e2e/helpers.ts), so no parser is needed.
 * WebKit on a Mac is Safari's engine but not an iPhone: the on-screen keyboard is
 * emulated (iosKeyboard in helpers) and speed is a laptop's, not a phone's.
 */
export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: 3,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'e2e/report', open: 'never' }]],
  outputDir: 'e2e/results',
  use: { baseURL: 'http://127.0.0.1:5201', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npx vite packages/web --port 5201 --host 127.0.0.1 --strictPort', url: 'http://127.0.0.1:5201', reuseExistingServer: true, timeout: 60_000 },
  globalSetup: './e2e/global-setup.ts',
  projects: [
    { name: 'iphone-14', use: { ...devices['iPhone 14'] } },
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } }, grep: /@desktop/ },
  ],
});
