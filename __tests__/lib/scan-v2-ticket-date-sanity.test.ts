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

/** ISO date `days` away from `from` (negative = in the past). */
function isoOffset(from: Date, days: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
    expect(getDateImplausibility('2025-12-01', null, NOW)).toBe('stale_past');
    expect(getDateImplausibility(isoOffset(NOW, -184), null, NOW)).toBe('stale_past');
  });

  it('accepts a date exactly at the 6-month edge', () => {
    expect(getDateImplausibility(isoOffset(NOW, -183), null, NOW)).toBeNull();
  });

  it('does not let a month-end clock roll the stale cutoff forward', () => {
    // Regression: the cutoff used to be Date.UTC(y, m - 6, d), so on the 31st it
    // asked for a day the target month doesn't have (Aug 31 → "Feb 31") and got
    // silently rolled into March, over-flagging early-March dates.
    const monthEnd = new Date(2026, 7, 31); // 2026-08-31
    expect(getDateImplausibility('2026-03-02', null, monthEnd)).toBeNull();
    expect(getDateImplausibility(isoOffset(monthEnd, -183), null, monthEnd)).toBeNull();
    expect(getDateImplausibility(isoOffset(monthEnd, -184), null, monthEnd)).toBe('stale_past');
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

  it('tolerates a week of international-release skew', () => {
    // TMDB carries one primary release date; UK/AU openings and preview
    // screenings legitimately run a few days ahead of it.
    expect(getDateImplausibility('2026-07-14', RELEASE, NOW)).toBeNull(); // 3 days early
    expect(getDateImplausibility('2026-07-10', RELEASE, NOW)).toBeNull(); // exactly 7, the edge
    expect(getDateImplausibility('2026-07-09', RELEASE, NOW)).toBe('before_release'); // 8 days
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

  it('rejects an unrecognised reason code rather than passing it through', () => {
    // The card indexes its copy by reason — an unknown code must read as "no
    // date flag" so it falls back to the match-confidence copy instead of
    // looking up undefined.
    expect(readDateImplausibility(['date-implausible:whatever'])).toBeNull();
    expect(readDateImplausibility(['date-implausible:'])).toBeNull();
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

  it('names the unsure match ahead of the date it dragged in', () => {
    // A wrong movie inherits a later release date, which is the most common way
    // a date ends up looking pre-release. The match is the bug; the date is the
    // symptom. Naming the date would point the user at the one field that isn't
    // wrong while a wrong film gets written into their journey.
    const ticket = makeProcessedTicket({
      tmdbMatch: makeTMDBMatch({ confidence: 0.6, movie: makeTMDBMovie({ release_date: RELEASE }) as any }),
      processingErrors: [dateImplausibilityError('before_release')],
    });
    expect(deriveReviewReason(ticket)).toBe('match_confidence');
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

describe('saving a flagged ticket re-judges the date instead of wiping it', () => {
  // applyTicketEdits re-derives against the real clock, so these dates are built
  // relative to today rather than pinned to NOW.
  const TODAY = new Date();
  const RECENT_RELEASE = isoOffset(TODAY, -30);
  const goodDate = isoOffset(TODAY, -3);

  const flaggedTicket = (date: string, confidence = 0.99) =>
    makeProcessedTicket({
      date,
      tmdbMatch: makeTMDBMatch({
        confidence,
        movie: makeTMDBMovie({ release_date: RECENT_RELEASE }) as any,
      }),
      processingErrors: [dateImplausibilityError('before_release')],
    });

  it('clears the flag when the user actually corrects the date', () => {
    const flagged = flaggedTicket('2020-07-20');
    expect(deriveStatus(flagged)).toBe('review');

    // The user fixes the year in the (now year-navigable) date picker and saves.
    const saved = applyTicketEdits(flagged, { ...seedEditForm(flagged), dateISO: goodDate }, null);

    expect(saved.date).toBe(goodDate);
    expect(saved.processingErrors).toEqual([]);
    expect(deriveStatus(saved)).toBe('matched');
    expect(deriveReviewReason(saved)).toBeNull();
  });

  it('KEEPS the flag when the user saves without fixing the date', () => {
    const flagged = flaggedTicket('2020-07-20');
    const saved = applyTicketEdits(flagged, seedEditForm(flagged), null);

    expect(deriveStatus(saved)).toBe('review');
    expect(deriveReviewReason(saved)).toBe('before_release');
  });

  it('does not launder match confidence on a date-flagged ticket', () => {
    // Confirming a date says nothing about whether the movie is right, so the
    // matcher's own confidence must survive the save untouched.
    const flagged = flaggedTicket('2020-07-20', 0.9);
    const saved = applyTicketEdits(flagged, { ...seedEditForm(flagged), dateISO: goodDate }, null);
    expect(saved.tmdbMatch?.confidence).toBe(0.9);
  });

  it('still promotes an unsure match to confirmed when THAT was the reason', () => {
    const unsure = makeProcessedTicket({
      date: goodDate,
      tmdbMatch: makeTMDBMatch({ confidence: 0.6, movie: makeTMDBMovie({ release_date: RECENT_RELEASE }) as any }),
    });
    expect(deriveReviewReason(unsure)).toBe('match_confidence');

    const saved = applyTicketEdits(unsure, seedEditForm(unsure), null);
    expect(saved.tmdbMatch?.confidence).toBe(1);
    expect(deriveStatus(saved)).toBe('matched');
  });

  it('re-judges the date against a newly picked movie', () => {
    // A different movie brings a different release date, so a date that was fine
    // for the old match can contradict the new one.
    const ok = makeProcessedTicket({
      date: goodDate,
      tmdbMatch: makeTMDBMatch({ confidence: 0.6, movie: makeTMDBMovie({ release_date: RECENT_RELEASE }) as any }),
    });
    const laterMovie = makeTMDBMovie({ id: 999, release_date: isoOffset(TODAY, 10) }) as any;

    const saved = applyTicketEdits(ok, seedEditForm(ok), laterMovie);

    expect(saved.tmdbMatch?.movie.id).toBe(999);
    expect(saved.tmdbMatch?.confidence).toBe(1);
    expect(deriveReviewReason(saved)).toBe('before_release');
  });

  it('leaves an unmatched ticket blocked and untouched', () => {
    const failed = makeProcessedTicket({ tmdbMatch: null, processingErrors: ['No TMDB match found'] });
    const saved = applyTicketEdits(failed, seedEditForm(failed), null);

    expect(deriveStatus(saved)).toBe('failed');
    expect(saved.processingErrors).toEqual(['No TMDB match found']);
  });
});
