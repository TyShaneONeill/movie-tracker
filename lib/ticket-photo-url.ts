/**
 * Ticket photo URL resolution.
 *
 * The `ticket-photos` storage bucket is private (owner-only) for privacy —
 * ticket stubs can leak a user's location. Photos are stored as public CDN URLs
 * (`getPublicUrl`) in `theater_visits.ticket_image_url` and
 * `user_movies.journey_photos[]`, but those 404 once the bucket is private.
 *
 * The display layer therefore mints short-lived signed URLs on the fly.
 * `createSignedUrl` works whether the bucket is public or private, so this is
 * safe to ship before the bucket flip.
 */

import { supabase } from '@/lib/supabase';
import { captureException } from '@/lib/sentry';

const TICKET_PHOTOS_BUCKET = 'ticket-photos';
const TICKET_PHOTOS_MARKER = '/ticket-photos/';
const SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Extract the storage object path for a ticket photo URL.
 *
 * Handles both the public-URL form
 * (`https://.../storage/v1/object/public/ticket-photos/<path>?...`) and an
 * already-bare object path. Returns `null` for any URL that isn't a ticket
 * photo (those don't need signing).
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
 * Resolve a stored journey photo URL to a displayable URL.
 *
 * Ticket-photos URLs are signed for short-lived access against the private
 * bucket. All other photos (journey-photos bucket, AI art, TMDB, local URIs)
 * pass through unchanged. On any signing error the original URL is returned so
 * display degrades gracefully rather than throwing.
 */
export async function resolveJourneyPhotoUrl(url: string): Promise<string> {
  const path = ticketPhotoPath(url);
  if (!path) return url;

  try {
    const { data, error } = await supabase.storage
      .from(TICKET_PHOTOS_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

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
