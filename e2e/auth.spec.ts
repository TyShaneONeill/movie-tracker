import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('auth state persists from global setup', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Navigate to profile tab - should NOT show guest sign-in prompt
    await page.getByRole('tab', { name: 'Profile' }).click();

    // When authenticated, profile shows settings button (only for logged-in users)
    await expect(page.getByLabel('Settings')).toBeVisible({ timeout: 10_000 });

    // Verify no guest sign-in prompt is shown
    await expect(page.getByText(/Sign in to see your collection/i)).not.toBeVisible();
  });
});
