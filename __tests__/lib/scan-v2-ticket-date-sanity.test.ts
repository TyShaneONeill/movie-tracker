import {
  getDateImplausibility,
  dateImplausibilityError,
  readDateImplausibility,
  deriveReviewReason,
  deriveStatus,
  applyTicketEdits,
  seedEditForm,
  toTicketVM,
  nextScanTicketId,
} from '@/lib/scan-v2/ticket-view-model';
import { makeProcessedTicket, makeTMDBMatch, makeTMDBMovie } from '../fixtures';

// Fixed reference clock so the past/future windows are deterministic.
const NOW = new Date(2026, 7, 1); // 2026-08-01, local
const RELEASE = '2026-07-17';

describe('getDateImplausibility', () => {
  it('does not flag a plausible recent date', () => {
    expect(getDateImplausibility('2026-07-20', RELEASE, NOW)).toBeNull();
  });

  it('flags a date before the movie was released', () => {
    // The #784 case: a Wallet pass with no printed year, year guessed as 2020.
    expect(getDateImplausibility('2020-07-20', RELEASE, NOW)).toBe('before_release');
  });

  it('prefers before_release over the softer age heuristic', () => {
    // 2020 is both pre-release AND >6mo old; the hard contradiction wins.
    expect(getDateImplausibility('2020-07-20', RELEASE, NOW)).not.toBe('stale_past');
  });

  it('flags a date more than 6 months in the past', () => {
    expect(getDateImplausibility('2026-01-31', null, NOW)).toBe('stale_past');
  });

  it('accepts a date exactly at the 6-month edge', () => {
    expect(getDateImplausibility('2026-02-01', null, NOW)).toBeNull();
  });

  it('flags a date more than a day in the future', () => {
    expect(getDateImplausibility('2026-08-05', RELEASE, NOW)).toBe('future');
  });

  it('accepts today and tomorrow (advance tickets are normal)', () => {
    expect(getDateImplausibility('2026-08-01', RELEASE, NOW)).toBeNull();
    expect(getDateImplausibility('2026-08-02', RELEASE, NOW)).toBeNull();
  });

  it('flags a date it cannot parse', () => {
    expect(getDateImplausibility('sometime in July', RELEASE, NOW)).toBe('unparseable');
    expect(getDateImplausibility('2026', RELEASE, NOW)).toBe('unparseable');
    // Date.UTC would silently roll this into March.
    expect(getDateImplausibility('2026-02-31', RELEASE, NOW)).toBe('unparseable');
  });

  it('returns null when there is no date to judge', () => {
    expect(getDateImplausibility(null, RELEASE, NOW)).toBeNull();
    expect(getDateImplausibility('', RELEASE, NOW)).toBeNull();
    expect(getDateImplausibility('   ', RELEASE, NOW)).toBeNull();
  });

  it('skips the release check when the match carries no release date', () => {
    // No release_date (TMDB gap, or no match at all) → fall through to the soft
    // rules rather than flagging.
    expect(getDateImplausibility('2026-07-20', undefined, NOW)).toBeNull();
    expect(getDateImplausibility('2026-07-20', null, NOW)).toBeNull();
    expect(getDateImplausibility('2026-07-20', '', NOW)).toBeNull();
    expect(getDateImplausibility('2026-07-20', 'not-a-date', NOW)).toBeNull();
  });

  it('does not flag a re-release watched decades after the movie came out', () => {
    // A 2026 anniversary screening of a 1999 film: long AFTER release, recent
    // enough not to be stale. The rule only fires on dates BEFORE release.
    expect(getDateImplausibility('2026-07-20', '1999-10-15', NOW)).toBeNull();
  });
});

describe('dateImplausibilityError / readDateImplausibility', () => {
  it('round-trips a reason through the processing-errors channel', () => {
    const encoded = dateImplausibilityError('before_release');
    expect(readDateImplausibility([encoded])).toBe('before_release');
    expect(readDateImplausibility(['Needs manual review', encoded])).toBe('before_release');
  });

  it('ignores unrelated processing errors', () => {
    expect(readDateImplausibility([])).toBeNull();
    expect(readDateImplausibility(['Needs manual review'])).toBeNull();
  });
});

describe('deriveReviewReason', () => {
  const match = makeTMDBMatch({ confidence: 0.99, movie: makeTMDBMovie({ release_date: RELEASE }) as any });

  it('names the date reason on a date-flagged ticket', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: match,
      processingErrors: [dateImplausibilityError('before_release')],
    });
    expect(deriveStatus(ticket)).toBe('review');
    expect(deriveReviewReason(ticket)).toBe('before_release');
  });

  it('falls back to match_confidence for the pre-existing review path', () => {
    const lowConfidence = makeProcessedTicket({ tmdbMatch: makeTMDBMatch({ confidence: 0.5 }) });
    expect(deriveReviewReason(lowConfidence)).toBe('match_confidence');

    const flaggedByEdge = makeProcessedTicket({
      tmdbMatch: match,
      processingErrors: ['Needs manual review'],
    });
    expect(deriveReviewReason(flaggedByEdge)).toBe('match_confidence');
  });

  it('is null when the ticket is not in review', () => {
    expect(deriveReviewReason(makeProcessedTicket({ tmdbMatch: match }))).toBeNull();
    expect(deriveReviewReason(makeProcessedTicket({ tmdbMatch: null }))).toBeNull();
  });

  it('threads the reason onto the view-model the card renders', () => {
    const ticket = makeProcessedTicket({
      tmdbMatch: match,
      processingErrors: [dateImplausibilityError('future')],
    });
    const vm = toTicketVM({ id: nextScanTicketId(), ticket });
    expect(vm.status).toBe('review');
    expect(vm.reviewReason).toBe('future');
  });
});

describe('correcting a flagged date clears the flag', () => {
  it('drops the date flag when the user edits and saves', () => {
    const match = makeTMDBMatch({ confidence: 0.99, movie: makeTMDBMovie({ release_date: RELEASE }) as any });
    const flagged = makeProcessedTicket({
      date: '2020-07-20',
      tmdbMatch: match,
      processingErrors: [dateImplausibilityError('before_release')],
    });
    expect(deriveStatus(flagged)).toBe('review');

    // The user fixes the year in the (now year-navigable) date picker and saves.
    const form = { ...seedEditForm(flagged), dateISO: '2026-07-20' };
    const saved = applyTicketEdits(flagged, form, null);

    expect(saved.date).toBe('2026-07-20');
    expect(saved.processingErrors).toEqual([]);
    expect(deriveStatus(saved)).toBe('matched');
    expect(deriveReviewReason(saved)).toBeNull();
    expect(getDateImplausibility(saved.date, RELEASE, NOW)).toBeNull();
  });
});
