import { test, expect } from '@playwright/test';
import { seedBlockedUser, cleanBlockedUser } from './helpers/supabase-admin';

// Dev test user that exists in the DB with a profile row.
// Used as the "blocked" target — seeded directly, not blocked via UI.
const BLOCKED_USER_ID =
  process.env.DEV_USER_IDS ?? 'cee03715-2b61-4ba0-aab2-d7827a0d78ed';

test.describe('Block User Flow', () => {
  test.beforeEach(async () => {
    await seedBlockedUser(BLOCKED_USER_ID);
  });

  test.afterEach(async () => {
    // Clean up in case the unblock via UI didn't run (test failure mid-way)
    await cleanBlockedUser(BLOCKED_USER_ID);
  });

  test('can view and unblock a user from Settings > Blocked Users', async ({ page }) => {
    // Accept the window.confirm unblock dialog automatically
    page.on('dialog', (dialog) => dialog.accept());

    // Navigate directly to the blocked users settings page
    await page.goto('/settings/blocked-users');

    // Wait for the screen to load — header title
    await expect(page.getByText('Blocked Users').last()).toBeVisible({ timeout: 15_000 });

    // The seeded blocked user should appear with an Unblock button
    await expect(page.getByText('Unblock').last()).toBeVisible({ timeout: 10_000 });

    // Tap Unblock — triggers window.confirm (auto-accepted above)
    await page.getByText('Unblock').last().click();

    // After unblocking, the list should show the empty state
    await expect(page.getByText('No blocked users').last()).toBeVisible({ timeout: 10_000 });
  });
});
