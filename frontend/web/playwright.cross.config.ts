import { defineConfig, devices } from '@playwright/test';

// Cross-engine run (Phase 2B, Stage 3): the same specs on Playwright's Firefox and WebKit builds.
// These are automated ENGINE tests. Playwright WebKit on Windows is not Safari, and the "iphone" project is WebKit with an iPhone
// viewport and touch emulation, not iOS Safari on a device. Run: npx playwright test -c playwright.cross.config.ts
// Uses the same dev server and the same seeded, Open-Meteo-blocked support fixture as the Chrome suite.
const BASE_URL = 'http://127.0.0.1:5174';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: [
    'overview.spec.ts',
    'reduced-motion.spec.ts',
    'step1-column.spec.ts',
    'step2-reveal.spec.ts',
    'step3-focus-nav.spec.ts',
    'views.spec.ts',
    'globe.spec.ts',
    'scroll-takeover.spec.ts',
    'scroll-motion.spec.ts',
    'motion-lab.spec.ts',
    'a11y-audit.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000,
  expect: { timeout: 7_500 },
  use: { baseURL: BASE_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox-narrow', use: { ...devices['Desktop Firefox'], viewport: { width: 390, height: 844 } } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit-iphone-emulated', use: { ...devices['iPhone 13'] } },
  ],
});
