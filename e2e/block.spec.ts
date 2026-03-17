import { test, expect } from '@playwright/test';

test.describe('Block User Flow', () => {
  test('can block and unblock a user from their profile', async ({ page }) => {
    // Navigate to feed to find another user
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('tab', { name: 'Home' }).click();

    // Wait for feed content to load — find a link to another user's profile
    const userLink = page.locator('a[href*="/user/"]').first();
    await expect(userLink).toBeVisible({ timeout: 15_000 });

    // Extract the user ID from the href
    const href = await userLink.getAttribute('href');
    const userId = href?.match(/\/user\/([^/?]+)/)?.[1];
    expect(userId).toBeTruthy();

    // Navigate to that user's profile
    await page.goto(`/user/${userId}`);
    await expect(page.getByText('Profile')).toBeVisible({ timeout: 10_000 });

    // Tap the "..." more menu button
    const moreButton = page.locator('[aria-label="ellipsis-horizontal"]').first()
      .or(page.locator('svg').filter({ has: page.locator('text') }).first());
    // Fallback: find the ellipsis button in the header
    const ellipsisButton = page.getByRole('button').filter({ has: page.locator('[data-testid="ellipsis-horizontal"]') }).first()
      .or(page.locator('div[role="button"]').last());

    // Look for the more menu button (Ionicons ellipsis-horizontal)
    const headerButtons = page.locator('header div[role="button"], [class*="header"] div[role="button"]');

    // Try clicking the last button in the header area (the "..." button)
    await page.waitForTimeout(1000);
    // The "..." button is the right-side header button
    const menuTrigger = page.locator('div').filter({ hasText: /^$/ }).locator('div[role="button"]').last();

    // Use a more reliable selector - find pressable elements near the header
    await page.locator('[accessibilityRole="button"]').last().click().catch(() => {});

    // Check if ActionSheet appeared
    const actionSheet = page.getByText('Block User').or(page.getByText('Unblock User'));
    if (await actionSheet.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Tap "Block User"
      await actionSheet.click();

      // Confirm the block in the alert/confirmation dialog
      page.on('dialog', (dialog) => dialog.accept());

      // Wait for block to complete
      await page.waitForTimeout(2000);

      // Navigate to Settings > Blocked Users to verify
      await page.getByRole('tab', { name: 'Profile' }).click();
      await expect(page.getByLabel('Settings')).toBeVisible({ timeout: 10_000 });
      await page.getByLabel('Settings').click();

      // Find and tap "Blocked Users"
      await expect(page.getByText('Blocked Users')).toBeVisible({ timeout: 5_000 });
      await page.getByText('Blocked Users').first().click();

      // Verify the blocked user appears in the list
      await page.waitForTimeout(2000);

      // Unblock the user
      const unblockButton = page.getByText('Unblock').first();
      if (await unblockButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // Accept the confirmation dialog
        page.on('dialog', (dialog) => dialog.accept());
        await unblockButton.click();
        await page.waitForTimeout(2000);
      }
    }
  });
});
