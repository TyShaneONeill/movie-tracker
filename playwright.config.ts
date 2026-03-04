import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: !CI,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'html',

  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },

  projects: [
    { name: 'setup', testMatch: /global-setup\.ts/ },
    {
      name: 'unauthenticated',
      testMatch: /\/(home|search|movie-detail|multi-source-ratings)\.spec\.ts$/,
    },
    {
      name: 'authenticated',
      testMatch: /\/(auth|profile|dark-mode|journey-card|movie-actions)\.spec\.ts$/,
      dependencies: ['setup'],
      use: { storageState: 'e2e/.auth/user.json' },
    },
  ],

  webServer: {
    command: CI
      ? 'npx expo export --platform web && npx serve dist -s -l 8081'
      : 'npx expo start --web --port 8081',
    port: 8081,
    reuseExistingServer: !CI,
    timeout: CI ? 180_000 : 120_000,
  },
});
