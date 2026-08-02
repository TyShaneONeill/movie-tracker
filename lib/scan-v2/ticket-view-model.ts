/**
 * Ticket Scan v2 — presentation view-model.
 *
 * Maps a `ProcessedTicket` (from `use-scan-ticket`) into the prototype's ticket
 * shape: a 3-tier `status`, a 0–100 `confidence`, and a `fields` bag that omits
 * every null/empty value (the design's hard rule: never render "N/A" — omit and
 * reflow). The original `ProcessedTicket` is kept on `ticket` so the save path
 * (`lib/scan-save.ts`) operates on the unchanged source record.
 */

import type { ProcessedTicket, TMDBMatch } from '@/lib/ticket-processor';
import type { TMDBMovie } from '@/lib/tmdb.types';

export type TicketStatus = 'matched' | 'review' | 'failed';

export interface TicketMovieVM {
  tmdbId: number;
  title: string;
  posterPath: string | null;
}

export interface TicketFieldsVM {
  theater?: string;
  date?: string;
  time?: string;
  seatLabel?: string;
  format?: string;
  rated?: string;
  price?: string;
  auditorium?: string;
}

export interface TicketVM {
  id: string;
  status: TicketStatus;
  confidence: number; // 0–100
  movie: TicketMovieVM | null;
  fields: TicketFieldsVM;
  /** Why this ticket reads as `review` (null for matched/failed). */
  reviewReason: TicketReviewReason | null;
}

/** A scanned ticket paired with a stable id for list keys + mutations. */
export interface ScanTicketItem {
  id: string;
  ticket: ProcessedTicket;
}

// Confidence at/above this (percent) reads as a clean "matched"; below it the
// card asks the user for a glance ("review"). Mirrors the prototype's 85% split.
const MATCH_CONFIDENCE_THRESHOLD = 85;

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

let idCounter = 0;

/** Generate a stable id for a freshly captured ticket. */
export function nextScanTicketId(): string {
  idCounter += 1;
  return `scan-${Date.now().toString(36)}-${idCounter}`;
}

/** Wrap raw scanned tickets with stable ids. */
export function toScanTicketItems(tickets: ProcessedTicket[]): ScanTicketItem[] {
  return tickets.map((ticket) => ({ id: nextScanTicketId(), ticket }));
}

function formatTicketDate(date: string | null): string | undefined {
  if (!date) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return date;
  const month = MONTHS[parseInt(match[2], 10) - 1];
  if (!month) return date;
  return `${month} ${parseInt(match[3], 10)}, ${match[1]}`;
}

function formatPrice(amount: number | null, currency: string): string | undefined {
  if (amount == null) return undefined;
  const value = amount.toFixed(2);
  if (currency === 'USD' || !currency) return `$${value}`;
  return `${value} ${currency}`;
}

function buildSeatLabel(row: string | null, seat: string | null): string | undefined {
  if (row && seat) return `Row ${row}, Seat ${seat}`;
  if (seat) return `Seat ${seat}`;
  if (row) return `Row ${row}`;
  return undefined;
}

// ============================================================================
// Scanned-date plausibility (#784)
// ============================================================================

/**
 * Why a scanned date can't be trusted, most-certain first.
 *
 * `before_release` is the only hard contradiction — a ticket cannot predate its
 * film — and it is what catches the failure this check exists for: Wallet passes
 * print no year, so the extractor is asked to infer one and sometimes guesses a
 * year years off. Note it deliberately does NOT fire on re-releases and
 * anniversary screenings, which sit long AFTER release, not before it. The
 * remaining reasons are soft heuristics.
 */
export type DateImplausibilityReason =
  | 'before_release'
  | 'stale_past'
  | 'future'
  | 'unparseable';

/** Everything that can put a ticket in the amber `review` lane. */
export type TicketReviewReason = DateImplausibilityReason | 'match_confidence';

/** A scanned date older than this reads as a mis-parsed year rather than a late scan. */
const STALE_PAST_MONTHS = 6;
/** Tickets bought for tomorrow are normal; further out is not. */
const FUTURE_GRACE_DAYS = 1;

/** Marker written into `processingErrors` so the reason survives to the VM. */
const DATE_FLAG_PREFIX = 'date-implausible:';

/** Parse `YYYY-MM-DD` to a UTC-midnight epoch, rejecting non-calendar dates. */
function toUTCDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  const ms = Date.UTC(y, m, d);
  const back = new Date(ms);
  // Rejects overflow like 2026-02-31, which Date.UTC silently rolls forward.
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

/**
 * Judge a scanned ticket date against the matched movie's release date and the
 * current day. Returns null when the date is absent (nothing to flag) or looks
 * fine. Date-only UTC arithmetic throughout, so DST can't shift a verdict.
 */
export function getDateImplausibility(
  parsedDate: string | null | undefined,
  movieReleaseDate?: string | null,
  now: Date = new Date()
): DateImplausibilityReason | null {
  if (!parsedDate || !parsedDate.trim()) return null;

  const ticketDay = toUTCDay(parsedDate);
  if (ticketDay == null) return 'unparseable';

  // A movie with no release_date (TMDB gap, or no match at all) simply skips the
  // hard check rather than failing it.
  const releaseDay = movieReleaseDate ? toUTCDay(movieReleaseDate) : null;
  if (releaseDay != null && ticketDay < releaseDay) return 'before_release';

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const staleCutoff = Date.UTC(now.getFullYear(), now.getMonth() - STALE_PAST_MONTHS, now.getDate());
  if (ticketDay < staleCutoff) return 'stale_past';

  const daysAhead = Math.round((ticketDay - today) / 86_400_000);
  if (daysAhead > FUTURE_GRACE_DAYS) return 'future';

  return null;
}

/** Encode an implausibility as a processing error the review lane already reacts to. */
export function dateImplausibilityError(reason: DateImplausibilityReason): string {
  return `${DATE_FLAG_PREFIX}${reason}`;
}

/** Recover the typed reason from a ticket's processing errors, if one is present. */
export function readDateImplausibility(errors: string[]): DateImplausibilityReason | null {
  const hit = errors.find((e) => e.startsWith(DATE_FLAG_PREFIX));
  return hit ? (hit.slice(DATE_FLAG_PREFIX.length) as DateImplausibilityReason) : null;
}

/**
 * Why a ticket is in review, so the card can name the actual problem instead of
 * always pointing at the title match. Null unless the status is `review`.
 */
export function deriveReviewReason(ticket: ProcessedTicket): TicketReviewReason | null {
  if (deriveStatus(ticket) !== 'review') return null;
  return readDateImplausibility(ticket.processingErrors) ?? 'match_confidence';
}

/** Derive the 3-tier status for a processed ticket. */
export function deriveStatus(ticket: ProcessedTicket): TicketStatus {
  if (!ticket.tmdbMatch) return 'failed';
  const confidence = Math.round(ticket.tmdbMatch.confidence * 100);
  if (ticket.processingErrors.length > 0 || confidence < MATCH_CONFIDENCE_THRESHOLD) {
    return 'review';
  }
  return 'matched';
}

/** Map a scanned ticket item into its presentation view-model. */
export function toTicketVM(item: ScanTicketItem): TicketVM {
  const { ticket } = item;
  const status = deriveStatus(ticket);
  const confidence = ticket.tmdbMatch
    ? Math.round(ticket.tmdbMatch.confidence * 100)
    : 0;

  const movie: TicketMovieVM | null = ticket.tmdbMatch
    ? {
        tmdbId: ticket.tmdbMatch.movie.id,
        title: ticket.tmdbMatch.movie.title,
        posterPath: ticket.tmdbMatch.movie.poster_path,
      }
    : null;

  // Only-present fields — omit anything null/empty so the layout reflows.
  const fields: TicketFieldsVM = {};
  const theater = ticket.theaterName || ticket.theaterChain;
  if (theater) fields.theater = theater;
  const date = formatTicketDate(ticket.date);
  if (date) fields.date = date;
  if (ticket.showtime) fields.time = ticket.showtime;
  const seatLabel = buildSeatLabel(ticket.seatRow, ticket.seatNumber);
  if (seatLabel) fields.seatLabel = seatLabel;
  if (ticket.format) fields.format = ticket.format;
  if (ticket.mpaaRating) fields.rated = ticket.mpaaRating;
  const price = formatPrice(ticket.priceAmount, ticket.priceCurrency);
  if (price) fields.price = price;
  if (ticket.auditorium) fields.auditorium = ticket.auditorium;

  return { id: item.id, status, confidence, movie, fields, reviewReason: deriveReviewReason(ticket) };
}

// ============================================================================
// Edit Ticket — form <-> ProcessedTicket mapping (PR 2)
// ============================================================================

/**
 * Flat, edit-friendly form shape for the Edit Ticket sheet. Mirrors the
 * prototype's `fields` bag but keeps the raw editable values (split seat
 * row/seat, ISO date, raw price text) rather than the display-formatted strings
 * the read-only VM exposes. The Edit sheet seeds from `seedEditForm`, mutates
 * this locally, and writes back via `applyTicketEdits`.
 */
export interface TicketEditForm {
  theater: string;
  /** ISO `YYYY-MM-DD` (or '' when unset) — formatted for display at render. */
  dateISO: string;
  /** Showtime label, e.g. `7:30 PM`. */
  time: string;
  rated: string;
  auditorium: string;
  row: string;
  seat: string;
  /** Raw price text as typed, e.g. `$12.00`. */
  price: string;
  format: string;
  type: string;
}

/** Seed an edit form from the underlying processed ticket. */
export function seedEditForm(ticket: ProcessedTicket): TicketEditForm {
  return {
    theater: ticket.theaterName || ticket.theaterChain || '',
    dateISO: ticket.date || '',
    time: ticket.showtime || '',
    rated: ticket.mpaaRating || '',
    auditorium: ticket.auditorium || '',
    row: ticket.seatRow || '',
    seat: ticket.seatNumber || '',
    price: ticket.priceAmount != null ? `$${ticket.priceAmount.toFixed(2)}` : '',
    format: ticket.format || '',
    type: ticket.ticketType || '',
  };
}

/** Render an ISO `YYYY-MM-DD` as the design's `Mon D, YYYY` (or '' when unset). */
export function formatEditDate(iso: string): string {
  return formatTicketDate(iso || null) ?? '';
}

function parsePriceText(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

/**
 * Fold the edited form (and optional new movie) back into a ProcessedTicket so
 * the flow can re-derive its VM. A movie change clears the block-on-unknown:
 * `tmdbMatch` is replaced at full confidence and processing errors are dropped,
 * which flips a `failed`/`review` ticket to `matched`. Saving a `review`-status
 * ticket (one that already has a match, just low-confidence / flagged) is itself
 * an explicit confirmation, so it is likewise promoted to `matched`. A `failed`
 * ticket with no match is left untouched so it stays blocked until a movie is
 * picked.
 */
export function applyTicketEdits(
  ticket: ProcessedTicket,
  form: TicketEditForm,
  movie: TMDBMovie | null
): ProcessedTicket {
  const theater = form.theater.trim();
  const next: ProcessedTicket = {
    ...ticket,
    theaterName: theater || null,
    // theaterChain is a separate AI classification (AMC/Regal/…) that this form
    // does NOT edit — carry it through untouched so editing a ticket never drops
    // the chain (it's persisted distinctly as user_movies.theater_chain).
    theaterChain: ticket.theaterChain,
    showtime: form.time.trim() || null,
    date: form.dateISO.trim() || null,
    seatRow: form.row.trim() || null,
    seatNumber: form.seat.trim() || null,
    ticketType: form.type.trim() || null,
    priceAmount: parsePriceText(form.price),
    priceCurrency: ticket.priceCurrency || 'USD',
    format: form.format.trim() || null,
    auditorium: form.auditorium.trim() || null,
    mpaaRating: form.rated.trim() || null,
    wasModified: true,
  };

  const changedMovie = movie != null && movie.id !== ticket.tmdbMatch?.movie.id;
  if (changedMovie) {
    const tmdbMatch: TMDBMatch = {
      movie,
      confidence: 1,
      matchedTitle: movie.title,
      originalTitle: ticket.movieTitle || '',
    };
    next.tmdbMatch = tmdbMatch;
    next.processingErrors = [];
  } else if (ticket.tmdbMatch && deriveStatus(ticket) === 'review') {
    // Confirm-match: the user opened Edit on a review-status ticket and saved,
    // which confirms the existing match. Bump to full confidence and clear the
    // soft processing errors that forced the review so it re-derives as matched.
    next.tmdbMatch = { ...ticket.tmdbMatch, confidence: 1 };
    next.processingErrors = [];
  }

  return next;
}
