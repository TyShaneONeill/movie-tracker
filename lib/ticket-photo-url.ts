/**
 * Journey/ticket photo URL resolution.
 *
 * The `ticket-photos` and `journey-photos` storage buckets are private
 * (owner-only) for privacy — ticket stubs can leak a user's location and
 * journey photos are personal. Photos are stored as public CDN URLs
 * (`getPublicUrl`) in `theater_visits.ticket_image_url` and
 * `user_movies.journey_photos[]`, but those 404 once the bucket is private.
 *
 * The display layer therefore mints short-lived signed URLs on the fly.
 * `createSignedUrl` works whether the bucket is public or private, so this is
 * safe to ship before either bucket is flipped private.
 */

import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';

/**
 * Private, owner-only buckets whose public CDN URLs must be re-signed for
 * display. Both store objects under `<user_id>/...`.
 */
const PRIVATE_BUCKETS = ['ticket-photos', 'journey-photos'] as const;

const SIGNED_URL_TTL_SECONDS = 3600;

const TICKET_PHOTOS_MARKER = '/ticket-photos/';

/**
 * Extract the storage object path for a ticket photo URL.
 *
 * Handles both the public-URL form
 * (`https://.../storage/v1/object/public/ticket-photos/<path>?...`) and an
 * already-bare object path. Returns `null` for any URL that isn't a ticket
 * photo (those don't need signing).
 *
 * @deprecated Prefer the bucket-agnostic detection in `resolveJourneyPhotoUrl`.
 * Retained for backwards compatibility.
 */
export function ticketPhotoPath(url: string): string | null {
  const markerIndex = url.indexOf(TICKET_PHOTOS_MARKER);
  if (markerIndex === -1) return null;

  const afterMarker = url.slice(markerIndex + TICKET_PHOTOS_MARKER.length);
  // Strip any query string (CDN/cache params) from the object path.
  const path = afterMarker.split('?')[0];
  return path.length > 0 ? path : null;
}

/**
 * Detect which private bucket a stored photo URL references and extract the
 * object path within it.
 *
 * Handles both the public-URL form
 * (`https://.../storage/v1/object/public/<bucket>/<path>?...`) and an
 * already-bare path containing the `/<bucket>/` marker. Returns `null` for any
 * URL that isn't in a private bucket (TMDB, journey-art, local URIs, etc.) —
 * those don't need signing.
 */
function resolvePrivateBucketRef(
  url: string,
): { bucket: (typeof PRIVATE_BUCKETS)[number]; path: string } | null {
  for (const bucket of PRIVATE_BUCKETS) {
    const marker = `/${bucket}/`;
    const markerIndex = url.indexOf(marker);
    if (markerIndex === -1) continue;

    const afterMarker = url.slice(markerIndex + marker.length);
    // Strip any query string (CDN/cache params) from the object path.
    const path = afterMarker.split('?')[0];
    if (path.length > 0) return { bucket, path };
  }

  return null;
}

/**
 * Resolve a stored journey photo URL to a displayable URL.
 *
 * URLs in a private bucket (`ticket-photos`, `journey-photos`) are signed for
 * short-lived access. All other photos (AI art, TMDB, local URIs) pass through
 * unchanged. On any signing error the original URL is returned so display
 * degrades gracefully rather than throwing.
 */
export async function resolveJourneyPhotoUrl(url: string): Promise<string> {
  const ref = resolvePrivateBucketRef(url);
  if (!ref) return url;

  try {
    const { data, error } = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      if (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          context: 'resolve-journey-photo-url',
        });
      }
      return url;
    }

    return data.signedUrl;
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      context: 'resolve-journey-photo-url',
    });
    return url;
  }
}
