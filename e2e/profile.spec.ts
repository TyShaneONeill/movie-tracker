import { test, expect } from '@playwright/test';

test.describe('Profile & Tabs (Authenticated)', () => {
  test('profile tab shows user content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Navigate to Profile tab
    await page.getByRole('tab', { name: 'Profile' }).click();

    // Settings button visible = authenticated
    await expect(page.getByLabel('Settings')).toBeVisible({ timeout: 10_000 });

    // Profile should show content tabs (Watched, First Takes, Lists)
    await expect(page.getByRole('tab', { name: /Watched/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /First Takes/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Lists/i })).toBeVisible();
  });

  test('stats tab shows authenticated content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Navigate to Stats tab
    await page.getByRole('tab', { name: 'Stats' }).click();

    // Should NOT show guest prompt
    await expect(page.getByText(/Sign in/i)).not.toBeVisible({ timeout: 5000 });
  });

  test('scan tab shows authenticated content', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Navigate to Scan tab
    await page.getByRole('tab', { name: 'Scan' }).click();

    // Authenticated scan tab shows ticket UI with scan count
    await expect(page.getByText(/scan/i).last()).toBeVisible({ timeout: 10_000 });

    // Should NOT show guest prompt
    await expect(page.getByText(/Sign in to scan/i)).not.toBeVisible({ timeout: 5000 });
  });
});
