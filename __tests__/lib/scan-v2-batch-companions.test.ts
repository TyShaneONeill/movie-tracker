/**
 * Ticket Scan v2 — batch-level companion tagging at the review step (#782 PR3b).
 *
 * The review step offers one flow-level "Who was there?" selection; on save the
 * serialized selection is applied to EVERY ticket in the batch via
 * `mapTicketToJourneyData`. These tests pin the serialization contract:
 * dedupe/trim by normalized name, empty selection -> null (never `[]`), and the
 * single-ticket batch behaving exactly like any other batch member.
 */

// scan-save's photo-upload path imports expo-file-system/legacy, which isn't in
// jest's transform allowlist — stub it; these tests only exercise pure mapping.
jest.mock('expo-file-system/legacy', () => ({}));
// Importing the real client starts an auth-refresh timer that outlives the run.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { buildBatchWatchedWith, mapTicketToJourneyData } from '@/lib/scan-save';
import { makeProcessedTicket } from '../fixtures';

describe('buildBatchWatchedWith', () => {
  it('serializes a selection preserving order and first display form', () => {
    expect(buildBatchWatchedWith(['Kelsie', 'Sam Rivera'])).toEqual(['Kelsie', 'Sam Rivera']);
  });

  it('dedupes by normalized name and trims whitespace', () => {
    expect(buildBatchWatchedWith(['Kelsie', ' kelsie ', 'KELSIE', 'Sam '])).toEqual([
      'Kelsie',
      'Sam',
    ]);
  });

  it('writes null for an empty selection — never an empty array', () => {
    expect(buildBatchWatchedWith([])).toBeNull();
    expect(buildBatchWatchedWith(['', '   '])).toBeNull();
  });
});

describe('mapTicketToJourneyData — batch companion apply', () => {
  it('applies the same watched_with to every ticket in the batch', () => {
    const batch = [
      makeProcessedTicket({ movieTitle: 'The Dark Knight' }),
      makeProcessedTicket({ movieTitle: 'Inception', seatRow: 'B', seatNumber: '4' }),
      makeProcessedTicket({ movieTitle: 'Dunkirk', showtime: '9:45 PM' }),
    ];
    const watchedWith = buildBatchWatchedWith(['Kelsie', 'Sam']);

    const journeys = batch.map((t) => mapTicketToJourneyData(t, watchedWith));

    for (const journey of journeys) {
      expect(journey.watched_with).toEqual(['Kelsie', 'Sam']);
    }
    // Per-ticket fields still map per ticket — the batch only shares companions.
    expect(journeys[0].seat_location).toBe('H-10');
    expect(journeys[1].seat_location).toBe('B-4');
    expect(journeys[2].watch_time).toBe('21:45');
  });

  it('writes null when the selection is empty', () => {
    const journey = mapTicketToJourneyData(makeProcessedTicket(), buildBatchWatchedWith([]));
    expect(journey.watched_with).toBeNull();
  });

  it('defaults to null when no selection is passed at all', () => {
    expect(mapTicketToJourneyData(makeProcessedTicket()).watched_with).toBeNull();
  });

  it('leaves a single-ticket batch otherwise unaffected', () => {
    const ticket = makeProcessedTicket();
    const withCompanions = mapTicketToJourneyData(ticket, buildBatchWatchedWith(['Kelsie']));
    const without = mapTicketToJourneyData(ticket, null);

    expect(withCompanions.watched_with).toEqual(['Kelsie']);
    expect(without.watched_with).toBeNull();
    // Every non-companion field is identical — tagging is purely additive.
    const strip = ({ watched_with: _watchedWith, ...rest }: typeof withCompanions) => rest;
    expect(strip(withCompanions)).toEqual(strip(without));
  });
});
