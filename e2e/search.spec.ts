import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test('finds movies by title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Open search via accessibility label
    await page.getByLabel('Search').last().click();

    // Type query into search input
    await page.getByPlaceholder('Movies, people, lists...').fill('Inception');

    // Wait for search results to appear
    await expect(
      page.getByText('Inception', { exact: false }).last()
    ).toBeVisible({ timeout: 15_000 });

    // At least one image rendered in results
    await expect(page.locator('img').last()).toBeVisible({ timeout: 10_000 });
  });
});
