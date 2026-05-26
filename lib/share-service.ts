import { RefObject } from 'react';
import { Platform, Share } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';

const WEB_BASE = 'https://pocketstubs.com';
const REVIEW_URL_BASE = `${WEB_BASE}/review`;
const MOVIE_URL_BASE = `${WEB_BASE}/movie`;

/**
 * Capture a ViewShot ref as a temporary PNG file.
 * Generic helper — used by both review and discovery share flows.
 */
export async function captureCard(
  viewShotRef: RefObject<ViewShot | null>
): Promise<string> {
  if (!viewShotRef.current?.capture) {
    throw new Error('ViewShot ref not available');
  }

  const uri = await viewShotRef.current.capture();
  return uri;
}

/**
 * @deprecated Use captureCard. Kept as an alias to avoid breaking existing call sites.
 */
export async function captureReviewCard(
  viewShotRef: RefObject<ViewShot | null>
): Promise<string> {
  return captureCard(viewShotRef);
}

/**
 * Share a review with image + URL via native share sheet
 */
export async function shareReview(
  reviewId: string,
  imageUri: string,
  movieTitle: string
): Promise<void> {
  const reviewUrl = `${REVIEW_URL_BASE}/${reviewId}`;

  if (Platform.OS === 'web') {
    // Web: use navigator.share if available, else copy to clipboard
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Review of ${movieTitle} on PocketStubs`,
          url: reviewUrl,
        });
      } catch (e) {
        // User cancelled or not supported — fall back to clipboard
        await copyToClipboard(reviewUrl);
      }
    } else {
      await copyToClipboard(reviewUrl);
    }
    return;
  }

  // Native: share the image file via expo-sharing
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(imageUri, {
    mimeType: 'image/png',
    dialogTitle: `Share review of ${movieTitle}`,
  });
}

/**
 * Share just the review URL (no image capture needed)
 */
export async function shareReviewUrl(
  reviewId: string,
  movieTitle: string
): Promise<void> {
  const reviewUrl = `${REVIEW_URL_BASE}/${reviewId}`;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Review of ${movieTitle} on PocketStubs`,
          url: reviewUrl,
        });
        return;
      } catch {
        // Fall through to clipboard
      }
    }
    await copyToClipboard(reviewUrl);
    return;
  }

  // Native: use Sharing to share the URL as text
  // expo-sharing requires a file URI, so for URL-only sharing
  // on native, we create a temp file
  const tempPath = `${FileSystem.cacheDirectory}review-share.txt`;
  await FileSystem.writeAsStringAsync(tempPath, `Check out this review on PocketStubs: ${reviewUrl}`);
  await Sharing.shareAsync(tempPath, {
    mimeType: 'text/plain',
    dialogTitle: `Share review of ${movieTitle}`,
  });
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  }
}

/**
 * Share a movie discovery card: captures the off-screen DiscoveryMovieCard,
 * copies the URL to the clipboard (so users can paste it alongside the image),
 * then opens the native share sheet with the PNG.
 *
 * Per PRD: discovery cards contain only TMDB poster + title + "On PocketStubs"
 * tag + the share URL baked into the image. No user data.
 */
export async function shareMovieDiscovery(
  viewShotRef: RefObject<ViewShot | null>,
  tmdbId: number,
  title: string
): Promise<void> {
  const url = `${MOVIE_URL_BASE}/${tmdbId}`;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${title} on PocketStubs`,
          url,
        });
        return;
      } catch {
        // user cancelled or not supported — fall through to clipboard
      }
    }
    await copyToClipboard(url);
    return;
  }

  // Native: copy URL to clipboard first so users can paste alongside the image
  // (the share sheet only carries one item — see PRD line 182-184).
  try {
    await Clipboard.setStringAsync(url);
  } catch {
    // Clipboard failures shouldn't block the share itself.
  }

  const imageUri = await captureCard(viewShotRef);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(imageUri, {
    mimeType: 'image/png',
    dialogTitle: `Share ${title}`,
  });
}

/**
 * Share a movie or TV show page URL via native share sheet or web share
 */
export async function shareTitle(
  tmdbId: number,
  mediaType: 'movie' | 'tv_show',
  title: string
): Promise<void> {
  const path = mediaType === 'tv_show' ? 'tv' : 'movie';
  const url = `https://pocketstubs.com/${path}/${tmdbId}`;
  const message = `Check out ${title} on PocketStubs`;

  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: message, url });
        return;
      } catch {
        // user cancelled or not supported — fall through to clipboard
      }
    }
    await copyToClipboard(url);
    return;
  }

  // Native: pass url separately so iOS fetches OG tags for rich link preview
  // (Android ignores the url param and falls back to message only)
  try {
    await Share.share({ message, url });
  } catch {
    // user cancelled — not an error
  }
}
