import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test('loads all section headers', async ({ page }) => {
    await page.goto('/');

    // Wait for home page to be ready via tab bar (unique accessible elements)
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // RN Web can render duplicate text nodes (hidden + visible).
    // Use .last() to target the visible instance.
    await expect(page.getByText('Trending Now').last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Now Playing').last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Coming Soon').last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Trending TV').last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Airing Today').last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Activity').last()).toBeVisible({ timeout: 15_000 });
  });

  test('tab navigation works', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Scan tab
    await page.getByRole('tab', { name: 'Scan' }).click();
    await expect(
      page.getByText(/sign in/i).last()
    ).toBeVisible({ timeout: 10_000 });

    // Stats tab
    await page.getByRole('tab', { name: 'Stats' }).click();
    await expect(
      page.getByText(/sign in/i).last()
    ).toBeVisible({ timeout: 10_000 });

    // Profile tab
    await page.getByRole('tab', { name: 'Profile' }).click();
    await expect(
      page.getByText(/sign in/i).last()
    ).toBeVisible({ timeout: 10_000 });

    // Back to Home tab
    await page.getByRole('tab', { name: 'Home' }).click();
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 10_000 });
  });
});
