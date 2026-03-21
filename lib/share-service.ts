import { RefObject } from 'react';
import { Platform } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

const REVIEW_URL_BASE = 'https://pocketstubs.com/review';

/**
 * Capture a ViewShot ref as a temporary PNG file
 */
export async function captureReviewCard(
  viewShotRef: RefObject<ViewShot | null>
): Promise<string> {
  if (!viewShotRef.current?.capture) {
    throw new Error('ViewShot ref not available');
  }

  const uri = await viewShotRef.current.capture();
  return uri;
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
