/**
 * Ticket Scan v2 — pure stub-field derivation for `JourneyCard`.
 *
 * The card's fixed-height stub shows at most three priority fields
 * (Date · place-or-format · With) and a watch-context tag on the poster.
 * Labels are data-driven off `location_type` (the watch-context column:
 * theater / home / airplane / outdoor) — never hard-coded theater wording.
 */

import type { UserMovie } from '@/lib/database.types';

/** Poster tag label — mirrors v1's `getLocationBadgeText` mapping. */
export function getWatchContextLabel(locationType: string | null): string {
  switch (locationType?.toLowerCase()) {
    case 'theater':
      return 'THEATRICAL RUN';
    case 'home':
      return 'HOME VIEWING';
    case 'airplane':
      return 'IN-FLIGHT';
    case 'outdoor':
      return 'OUTDOOR CINEMA';
    default:
      return 'VIEWING';
  }
}

/** Label for the "where" stub field, by watch context. */
export function getPlaceFieldLabel(locationType: string | null): string {
  switch (locationType?.toLowerCase()) {
    case 'theater':
      return 'Cinema';
    case 'home':
      return 'Service';
    case 'airplane':
      return 'Airline';
    default:
      return 'Location';
  }
}

export function formatStubDate(dateString: string | null): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Middle stub field: the context place (Cinema / Service / Airline) when one is
 * set, else Format as the fallback, else omitted entirely (never "N/A").
 */
export function buildPlaceField(
  journey: Pick<UserMovie, 'location_type' | 'location_name' | 'theater_chain' | 'watch_format'>,
): { label: string; value: string } | null {
  const place = journey.location_name?.trim() || journey.theater_chain?.trim() || null;
  if (place) return { label: getPlaceFieldLabel(journey.location_type), value: place };
  if (journey.watch_format) return { label: 'Format', value: journey.watch_format.toUpperCase() };
  return null;
}
