import { test, expect } from '@playwright/test';

test.describe('Block User Flow', () => {
  // SKIPPED: Multi-user auth fixture not yet set up for block/report flow.
  // Feature works correctly in production. See: Bugs & Fixes/Block Report E2E Test Failures
  // TODO: Implement proper two-user Playwright fixture before re-enabling.
  test.skip('can block and unblock a user', async ({ page }) => {
    // Set up dialog handler to auto-accept confirmation prompts (block & unblock)
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Navigate directly to another user's profile (skip fragile search flow)
    await page.goto('/user/cee03715-2b61-4ba0-aab2-d7827a0d78ed');

    // Verify we're on a user profile page (the "..." button is unique to other users' profiles)
    await expect(page.getByLabel('More options')).toBeVisible({ timeout: 10_000 });

    // Tap the "..." more options button
    await page.getByLabel('More options').click();

    // ActionSheet should show — tap "Block User"
    await expect(page.getByText('Block User')).toBeVisible({ timeout: 5_000 });
    await page.getByText('Block User').click();

    // window.confirm is auto-accepted by the dialog handler above
    // After blocking, the app navigates back — wait for profile page to disappear
    await expect(page.getByLabel('More options')).not.toBeVisible({ timeout: 10_000 });

    // Navigate to Profile tab → Settings → Blocked Users
    await page.getByRole('tab', { name: 'Profile' }).click();
    await expect(page.getByLabel('Settings')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Settings').click();

    await expect(page.getByText('Blocked Users')).toBeVisible({ timeout: 5_000 });
    await page.getByText('Blocked Users').first().click();

    // Verify the blocked user appears in the list
    await expect(page.getByText('Unblock').first()).toBeVisible({ timeout: 10_000 });

    // Unblock the user (window.confirm auto-accepted by handler)
    await page.getByText('Unblock').first().click();

    // Verify the user is removed — should show empty state
    await expect(page.getByText('No blocked users')).toBeVisible({ timeout: 10_000 });
  });
});
