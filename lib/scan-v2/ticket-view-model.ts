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

  return { id: item.id, status, confidence, movie, fields };
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
