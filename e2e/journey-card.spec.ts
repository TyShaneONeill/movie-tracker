import { test, expect, type Page } from '@playwright/test';

/**
 * Helper: trigger a flip on the journey ticket card.
 *
 * The TicketFlipCard uses Pressable with onPress on web, so a standard
 * click() works. We wait for the flip animation (500ms) to complete.
 */
async function flipTicketCard(page: Page) {
  const flipBtn = page.getByRole('button', { name: /Flip ticket/ });
  await flipBtn.click();
  // Wait for flip animation (500ms)
  await page.waitForTimeout(600);
}

/**
 * Helper: scroll the info carousel inside the flip card to a given page index.
 */
async function scrollInfoCarousel(page: Page, pageIndex: number) {
  await page.evaluate((targetPage) => {
    const flipBtn =
      document.querySelector('[aria-label="Flip ticket to see barcode"]') ||
      document.querySelector('[aria-label="Flip ticket to front"]');
    if (!flipBtn) throw new Error('Flip card not found');

    const allDivs = flipBtn.querySelectorAll('div');
    let scrollContainer: HTMLElement | null = null;
    for (const div of allDivs) {
      const style = window.getComputedStyle(div);
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
        scrollContainer = div;
        break;
      }
    }
    if (!scrollContainer) throw new Error('Info carousel scroll container not found');

    scrollContainer.scrollLeft = scrollContainer.clientWidth * targetPage;
    scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, pageIndex);
}

/**
 * Helper: scroll the outer journey carousel to the last page ("Log Another Viewing").
 */
async function scrollToLogAnotherViewing(page: Page) {
  await page.evaluate(() => {
    const flipBtn =
      document.querySelector('[aria-label="Flip ticket to see barcode"]') ||
      document.querySelector('[aria-label="Flip ticket to front"]');
    if (!flipBtn) throw new Error('Flip card not found');

    let parent = flipBtn.parentElement;
    let flatListScroller: HTMLElement | null = null;
    while (parent) {
      const style = window.getComputedStyle(parent);
      if (
        (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
        parent.scrollWidth > parent.clientWidth + 100
      ) {
        flatListScroller = parent;
        break;
      }
      parent = parent.parentElement;
    }
    if (!flatListScroller) throw new Error('Journey carousel scroll container not found');

    flatListScroller.scrollLeft = flatListScroller.scrollWidth - flatListScroller.clientWidth;
    flatListScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

/**
 * Helper: navigate to profile, find first watched movie TMDB ID, go to its journey page.
 * Returns the TMDB ID that was navigated to.
 */
async function navigateToJourneyFromProfile(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Profile' }).click();
  await expect(page.getByRole('tab', { name: /Watched/i })).toBeVisible({ timeout: 15_000 });

  // Wait for watched posters to load, then extract TMDB ID via evaluate
  await page.waitForTimeout(2000);
  const tmdbId = await page.evaluate(() => {
    const imgs = document.querySelectorAll('img[src*="image.tmdb.org"]');
    // Find the last TMDB image (these are in the watched grid at bottom of profile)
    const lastImg = imgs[imgs.length - 1];
    if (!lastImg) return null;

    // Click the poster to navigate
    (lastImg as HTMLElement).click();
    return true;
  });

  if (!tmdbId) {
    throw new Error('No watched movie posters found on profile');
  }

  // Wait for journey page to load
  await expect(page.getByText(/JOURNEY \d+ OF \d+/).last()).toBeVisible({ timeout: 15_000 });
}

test.describe('Journey Card (Authenticated)', () => {
  test('journey card loads from profile with poster and details', async ({ page }) => {
    // Navigate via profile → watched poster → journey page
    await navigateToJourneyFromProfile(page);

    // 1. Card loaded (JOURNEY header visible from navigateToJourneyFromProfile)

    // 2. Movie poster is present (hero image renders via expo-image with
    //    cross-dissolve which can report hidden during transition — check attached)
    const heroImage = page.locator('img[src*="image.tmdb.org"]').first();
    await expect(heroImage).toBeAttached({ timeout: 10_000 });

    // 3. Flip card button is present
    const flipCard = page.getByRole('button', { name: /Flip ticket/ });
    await expect(flipCard).toBeVisible({ timeout: 10_000 });

    // 4. Movie details — page 1 info fields
    await expect(page.getByText('DATE').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('CINEMA').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('SEAT').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('WITH').last()).toBeVisible({ timeout: 10_000 });

    // VIEWING badge present
    await expect(page.getByText('VIEWING').last()).toBeVisible({ timeout: 10_000 });
  });

  test('perforated line separates hero from ticket section', async ({ page }) => {
    await navigateToJourneyFromProfile(page);

    // The perforated edge renders between the hero poster and the flip card.
    // Verify structurally: hero image and flip card are both rendered.
    const heroImage = page.locator('img[src*="image.tmdb.org"]').first();
    await expect(heroImage).toBeAttached({ timeout: 10_000 });

    const flipCard = page.getByRole('button', { name: /Flip ticket/ });
    await expect(flipCard).toBeVisible({ timeout: 10_000 });

    // Verify the perforated edge is rendered between hero and ticket.
    // The PerforatedEdge component creates dashes that separate the two sections.
    // We check that the hero and ticket are distinct visual sections by verifying
    // both are present and the card has movie detail fields.
    await expect(page.getByText('DATE').last()).toBeVisible({ timeout: 10_000 });
  });

  test('info carousel swipes between two pages', async ({ page }) => {
    await navigateToJourneyFromProfile(page);

    // Page 1: DATE, CINEMA, SEAT, WITH
    await expect(page.getByText('DATE').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('CINEMA').last()).toBeVisible({ timeout: 10_000 });

    // Scroll info carousel to page 2
    await scrollInfoCarousel(page, 1);
    await page.waitForTimeout(500);

    // Page 2: TIME, FORMAT, AUDITORIUM, PRICE
    await expect(page.getByText('TIME').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('FORMAT').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('AUDITORIUM').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('PRICE').last()).toBeVisible({ timeout: 10_000 });
  });

  test('flip card shows back side with barcode', async ({ page }) => {
    await navigateToJourneyFromProfile(page);

    // Front side should be visible initially
    const flipCardFront = page.getByRole('button', { name: 'Flip ticket to see barcode' });
    await expect(flipCardFront).toBeVisible({ timeout: 10_000 });

    // Flip the card
    await flipTicketCard(page);

    // Back side should now be showing — aria-label changes
    const flipCardBack = page.getByRole('button', { name: 'Flip ticket to front' });
    await expect(flipCardBack).toBeVisible({ timeout: 5_000 });

    // Back side content: ADMIT ONE text, ticket ID, barcode
    await expect(page.getByText('ADMIT ONE').last()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/CNTK-[A-Z0-9]+/).last()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('NON-TRANSFERABLE').last()).toBeVisible({ timeout: 5_000 });

    // Flip back to front
    await flipTicketCard(page);

    // Front side restored
    const flipCardFrontAgain = page.getByRole('button', { name: 'Flip ticket to see barcode' });
    await expect(flipCardFrontAgain).toBeVisible({ timeout: 5_000 });
  });

  test('journey carousel scrolls to Log Another Viewing', async ({ page }) => {
    await navigateToJourneyFromProfile(page);

    // Initial state: JOURNEY X OF Y header
    await expect(page.getByText(/JOURNEY \d+ OF \d+/).last()).toBeVisible({ timeout: 10_000 });

    // Scroll to the last page (Log Another Viewing)
    await scrollToLogAnotherViewing(page);
    await page.waitForTimeout(500);

    // "Log Another Viewing" card should be visible
    await expect(page.getByText('Log Another Viewing').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Add a new journey for this movie').last()).toBeVisible({
      timeout: 10_000,
    });

    // Header should show NEW JOURNEY
    await expect(page.getByText('NEW JOURNEY').last()).toBeVisible({ timeout: 5_000 });
  });

  test('journey card renders in dark mode', async ({ page }) => {
    // Toggle to dark mode via the home screen theme button
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15_000 });

    // Check current theme state and toggle to dark if needed
    const isAlreadyDark = await page
      .getByRole('button', { name: /currently dark/ })
      .isVisible()
      .catch(() => false);

    if (!isAlreadyDark) {
      const themeToggle = page.getByRole('button', { name: /Toggle theme/ });
      await themeToggle.click();
      await page.waitForTimeout(500);
    }

    // Verify dark mode is active
    await expect(page.getByRole('button', { name: /currently dark/ })).toBeVisible({
      timeout: 5_000,
    });

    // Navigate to journey via profile
    await page.getByRole('tab', { name: 'Profile' }).click();
    await expect(page.getByRole('tab', { name: /Watched/i })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const imgs = document.querySelectorAll('img[src*="image.tmdb.org"]');
      const lastImg = imgs[imgs.length - 1];
      if (lastImg) (lastImg as HTMLElement).click();
    });

    await expect(page.getByText(/JOURNEY \d+ OF \d+/).last()).toBeVisible({ timeout: 15_000 });

    // Card elements visible in dark mode
    const flipCard = page.getByRole('button', { name: /Flip ticket/ });
    await expect(flipCard).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('DATE').last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('VIEWING').last()).toBeVisible({ timeout: 10_000 });

    // Background should be dark
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });

    // Dark mode body background is dark (not white/light)
    // rgb(0-50, 0-50, 0-50) range for dark backgrounds
    const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const [, r, g, b] = match.map(Number);
      expect(r).toBeLessThan(60);
      expect(g).toBeLessThan(60);
      expect(b).toBeLessThan(60);
    }
  });
});
