/**
 * Ticket Scan v2 — presentation view-model.
 *
 * Maps a `ProcessedTicket` (from `use-scan-ticket`) into the prototype's ticket
 * shape: a 3-tier `status`, a 0–100 `confidence`, and a `fields` bag that omits
 * every null/empty value (the design's hard rule: never render "N/A" — omit and
 * reflow). The original `ProcessedTicket` is kept on `ticket` so the save path
 * (`lib/scan-save.ts`) operates on the unchanged source record.
 */

import type { ProcessedTicket } from '@/lib/ticket-processor';

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
