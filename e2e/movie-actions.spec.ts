import { test, expect } from '@playwright/test';

test.describe('Movie Status Actions (Authenticated)', () => {
  test('full status lifecycle: watchlist → watching → watched → toggle off', async ({ page }) => {
    // Navigate to Inception movie detail page
    await page.goto('/movie/27205');

    // Wait for the status buttons to load (they appear after movie data + auth state resolve)
    await expect(
      page.getByRole('button', { name: 'WATCHLIST, not selected' }).last()
    ).toBeVisible({ timeout: 15_000 });

    // ── Step 1: Verify all buttons start as "not selected" ──
    await expect(
      page.getByRole('button', { name: 'WATCHLIST, not selected' }).last()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'WATCHING, not selected' }).last()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'WATCHED, not selected' }).last()
    ).toBeVisible();

    // ── Step 2: Tap WATCHLIST → becomes selected ──
    await page.getByRole('button', { name: 'WATCHLIST, not selected' }).last().click();

    await expect(
      page.getByRole('button', { name: 'WATCHLIST, selected' }).last()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: 'WATCHING, not selected' }).last()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'WATCHED, not selected' }).last()
    ).toBeVisible();

    // ── Step 3: Tap WATCHING → becomes selected, WATCHLIST deselects ──
    await page.getByRole('button', { name: 'WATCHING, not selected' }).last().click();

    await expect(
      page.getByRole('button', { name: 'WATCHING, selected' }).last()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: 'WATCHLIST, not selected' }).last()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'WATCHED, not selected' }).last()
    ).toBeVisible();

    // ── Step 4: Tap WATCHED → dismiss First Take modal if it appears ──
    await page.getByRole('button', { name: 'WATCHED, not selected' }).last().click();

    // First Take modal may appear — dismiss it by clicking the ✕ close button
    const closeButton = page.locator('text=✕');
    try {
      await closeButton.last().click({ timeout: 3_000 });
    } catch {
      // Modal didn't appear (user may already have a First Take or preference disabled)
    }

    await expect(
      page.getByRole('button', { name: 'WATCHED, selected' }).last()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: 'WATCHLIST, not selected' }).last()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'WATCHING, not selected' }).last()
    ).toBeVisible();

    // ── Step 5: Tap WATCHED again → toggle off (removes movie) ──
    // An alert dialog may appear if there's a First Take — auto-accept it
    page.on('dialog', (dialog) => dialog.accept());

    await page.getByRole('button', { name: 'WATCHED, selected' }).last().click();

    await expect(
      page.getByRole('button', { name: 'WATCHLIST, not selected' }).last()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: 'WATCHING, not selected' }).last()
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'WATCHED, not selected' }).last()
    ).toBeVisible();
  });
});
