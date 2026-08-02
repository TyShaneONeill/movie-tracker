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

/**
 * A scanned date older than this reads as a mis-parsed year rather than a late
 * scan. Counted in days rather than calendar months on purpose: subtracting six
 * months from the 31st lands on a day that month doesn't have, which `Date.UTC`
 * silently rolls forward into the next month and shifts the cutoff.
 */
const STALE_PAST_DAYS = 183; // ~6 months
/** Tickets bought for tomorrow are normal; further out is not. */
const FUTURE_GRACE_DAYS = 1;
/**
 * Slack on the release-date comparison. TMDB carries one primary release date,
 * but a film opens on different days in different territories (UK and AU
 * regularly a few days ahead of a US primary date) and preview screenings run
 * earlier still. A week absorbs that skew while leaving the failure this check
 * exists for — a year guessed wrong — nowhere to hide.
 */
const BEFORE_RELEASE_GRACE_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/** Marker written into `processingErrors` so the reason survives to the VM. */
const DATE_FLAG_PREFIX = 'date-implausible:';

const DATE_IMPLAUSIBILITY_REASONS: readonly DateImplausibilityReason[] = [
  'before_release',
  'stale_past',
  'future',
  'unparseable',
];

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
  if (releaseDay != null && ticketDay < releaseDay - BEFORE_RELEASE_GRACE_DAYS * MS_PER_DAY) {
    return 'before_release';
  }

  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (ticketDay < today - STALE_PAST_DAYS * MS_PER_DAY) return 'stale_past';

  const daysAhead = Math.round((ticketDay - today) / MS_PER_DAY);
  if (daysAhead > FUTURE_GRACE_DAYS) return 'future';

  return null;
}

/** Encode an implausibility as a processing error the review lane already reacts to. */
export function dateImplausibilityError(reason: DateImplausibilityReason): string {
  return `${DATE_FLAG_PREFIX}${reason}`;
}

/**
 * Recover the typed reason from a ticket's processing errors, if one is present.
 * An unrecognised code reads as no date flag rather than being trusted through
 * to the card, which indexes its copy by reason.
 */
export function readDateImplausibility(errors: string[]): DateImplausibilityReason | null {
  for (const error of errors) {
    if (!error.startsWith(DATE_FLAG_PREFIX)) continue;
    const raw = error.slice(DATE_FLAG_PREFIX.length);
    if ((DATE_IMPLAUSIBILITY_REASONS as readonly string[]).includes(raw)) {
      return raw as DateImplausibilityReason;
    }
  }
  return null;
}

/** Match confidence as the 0–100 percent the threshold is expressed in. */
function matchConfidencePct(ticket: ProcessedTicket): number {
  return ticket.tmdbMatch ? Math.round(ticket.tmdbMatch.confidence * 100) : 0;
}

/**
 * Why a ticket is in review, so the card can name the actual problem instead of
 * always pointing at the title match. Null unless the status is `review`.
 *
 * An unsure match outranks a date flag: a wrong movie inheriting a later release
 * date is the most common way a date ends up looking pre-release, so the date is
 * the symptom and the match is the bug. Naming the date there would send the
 * user to fix the one field that isn't wrong while a wrong film gets written
 * into their journey.
 */
export function deriveReviewReason(ticket: ProcessedTicket): TicketReviewReason | null {
  if (deriveStatus(ticket) !== 'review') return null;
  if (matchConfidencePct(ticket) < MATCH_CONFIDENCE_THRESHOLD) return 'match_confidence';
  return readDateImplausibility(ticket.processingErrors) ?? 'match_confidence';
}

/**
 * The processing errors a ticket should carry after an explicit user save:
 * the soft flags are confirmed away, but the date is re-judged against what was
 * actually saved (and whichever movie is now matched) rather than taken on
 * trust. Tapping Save cannot launder a date that is still wrong.
 */
function dateErrorsAfterSave(date: string | null, releaseDate?: string | null): string[] {
  const reason = getDateImplausibility(date, releaseDate);
  return reason ? [dateImplausibilityError(reason)] : [];
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
 * `tmdbMatch` is replaced at full confidence, which flips a `failed`/`review`
 * ticket toward `matched`. Saving a ticket flagged for an unsure MATCH is itself
 * an explicit confirmation of that match, so it too goes to full confidence — a
 * ticket flagged only for its DATE does not, since confirming a date says
 * nothing about whether the movie is right. A `failed` ticket with no match is
 * left untouched so it stays blocked until a movie is picked.
 *
 * Soft processing errors clear on save, but the date flag is re-derived from the
 * saved date rather than wiped, so a date that is still implausible stays amber
 * instead of being dismissed by tapping Save.
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
  const wasInReview = ticket.tmdbMatch != null && deriveStatus(ticket) === 'review';

  if (changedMovie) {
    const tmdbMatch: TMDBMatch = {
      movie,
      confidence: 1,
      matchedTitle: movie.title,
      originalTitle: ticket.movieTitle || '',
    };
    next.tmdbMatch = tmdbMatch;
  } else if (deriveReviewReason(ticket) === 'match_confidence') {
    // Confirm-match: the user opened Edit on a ticket flagged for an unsure
    // match and saved, which confirms it. Only this reason is a confirmation of
    // the MATCH — a date-flagged ticket says nothing about whether the movie is
    // right, so its confidence is left exactly where the matcher put it.
    next.tmdbMatch = { ...ticket.tmdbMatch!, confidence: 1 };
  }

  if (changedMovie || wasInReview) {
    // A new movie brings a new release date, and a confirmed review still has to
    // survive re-judging. Either way the date is checked against what was saved.
    next.processingErrors = dateErrorsAfterSave(next.date, next.tmdbMatch?.movie.release_date);
  }

  return next;
}
