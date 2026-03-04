import { test, expect } from '@playwright/test';

test.describe('Movie Detail', () => {
  test('displays movie information for Inception', async ({ page }) => {
    await page.goto('/movie/27205');

    // Title — use last() to skip hidden RN Web duplicate
    await expect(page.getByText('Inception', { exact: true }).last()).toBeVisible({ timeout: 20_000 });

    // Release year appears in metadata line e.g. "2010 • 2h 28m"
    await expect(page.getByText('2010', { exact: false }).last()).toBeVisible({ timeout: 15_000 });

    // Star rating e.g. "★ 8.4"
    await expect(page.getByText(/★\s*\d+\.\d/).last()).toBeVisible({ timeout: 15_000 });

    // At least one genre — use exact match to avoid picking up text like "Action • 0.0"
    await expect(page.getByText('Action', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // Synopsis — try both known phrases
    await expect(
      page.getByText(/planted during the dream state/i)
        .or(page.getByText(/subconscious/i))
    ).toBeVisible({ timeout: 15_000 });

    // Director
    await expect(page.getByText('Christopher Nolan').last()).toBeVisible({ timeout: 15_000 });

    // Cast section header and lead actor
    await expect(page.getByText('Top Cast').last()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Leonardo DiCaprio').last()).toBeVisible({ timeout: 15_000 });

    // Status action buttons
    await expect(page.getByText('WATCHLIST').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('WATCHING').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('WATCHED').last()).toBeVisible({ timeout: 10_000 });

    // Where to Watch — soft assertion, availability is region-dependent
    await expect.soft(page.getByText('Where to Watch').last()).toBeVisible({ timeout: 10_000 });
  });
});
