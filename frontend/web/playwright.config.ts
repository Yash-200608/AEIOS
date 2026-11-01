import { defineConfig, devices } from '@playwright/test';

// Browser suite for the motion phase. Uses the system Chrome (channel 'chrome'), so no browser download is needed.
// Every spec imports `test` from ./tests/e2e/support, which seeds the cached Open-Meteo run and blocks open-meteo.com:
// the free daily quota is never consumed by tests.
const BASE_URL = 'http://127.0.0.1:5174';
const touch = { isMobile: true, hasTouch: true } as const;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 90_000, // the first test also pays for Vite's cold dependency optimisation
  expect: { timeout: 7_500 },
  use: {
    baseURL: BASE_URL,
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1440, height: 900 } } },
    { name: 'laptop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 800 } } },
    { name: 'tablet', use: { channel: 'chrome', viewport: { width: 768, height: 1024 }, ...touch } },
    { name: 'phone-390', use: { channel: 'chrome', viewport: { width: 390, height: 844 }, ...touch } },
    { name: 'phone-360', use: { channel: 'chrome', viewport: { width: 360, height: 800 }, ...touch } },
  ],
});
