import { test, expect } from '@playwright/test';

test.describe('Dark Mode Toggle', () => {
  test('toggles dark mode on and off', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Navigate to Profile -> Settings
    await page.getByRole('tab', { name: 'Profile' }).click();
    await expect(page.getByLabel('Settings')).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Settings').click();

    // Wait for settings page
    await expect(page.getByText('Dark Mode').last()).toBeVisible({ timeout: 10_000 });

    // Get the dark mode switch (find within the row containing "Dark Mode" text)
    const darkModeSwitch = page.getByText('Dark Mode').last().locator('../..').getByRole('switch');
    await expect(darkModeSwitch).toBeVisible();

    // Get initial background color of the page body/root
    const getBackgroundColor = async () => {
      return page.evaluate(() => {
        const root = document.querySelector('[data-testid="settings"]') || document.body;
        return window.getComputedStyle(root).backgroundColor;
      });
    };

    const initialColor = await getBackgroundColor();

    // Toggle dark mode
    await darkModeSwitch.click();

    // Wait a moment for the theme transition
    await page.waitForTimeout(500);

    // Verify color changed
    const toggledColor = await getBackgroundColor();
    expect(toggledColor).not.toBe(initialColor);

    // Toggle back
    await darkModeSwitch.click();
    await page.waitForTimeout(500);

    // Verify color restored
    const restoredColor = await getBackgroundColor();
    expect(restoredColor).toBe(initialColor);
  });
});
