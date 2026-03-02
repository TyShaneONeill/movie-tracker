import { test as setup, expect } from '@playwright/test';

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL ?? 'g@g.g';
  const password = process.env.E2E_TEST_PASSWORD ?? 'gggggg';

  await page.goto('/signin');
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByText('Sign In', { exact: true }).click();

  // Wait for redirect to home after successful login
  await expect(page.getByText('CineTrak').first()).toBeVisible({ timeout: 30_000 });

  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
