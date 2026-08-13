/**
 * Ticket Scan v2 — save persistence reconciliation (#813, follow-up to #812/#814).
 *
 * `addMovieToLibrary`'s upsert can resolve in the JS layer without the Postgres
 * write ever landing, so `Promise.allSettled` fulfilling is a claim, not proof.
 * These tests pin the same contract #814 pinned for the Letterboxd import:
 * verify against a status-scoped batch read, treat any chunk error as the whole
 * batch being unverifiable, and rebuild `savedMovies` (the First Take wizard's
 * input) from what actually persisted.
 */

// scan-save's photo-upload path imports expo-file-system/legacy, which isn't in
// jest's transform allowlist.
jest.mock('expo-file-system/legacy', () => ({}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    storage: { from: jest.fn() },
  },
}));

jest.mock('@/lib/movie-service', () => ({
  addMovieToLibrary: jest.fn(),
  updateJourney: jest.fn(),
  getMovieByTmdbId: jest.fn(),
}));

jest.mock('@/lib/query-invalidation', () => ({
  invalidateUserMovieQueries: jest.fn(),
}));

import { saveTicketsToJourney } from '@/lib/scan-save';
import { addMovieToLibrary, updateJourney } from '@/lib/movie-service';
import { supabase } from '@/lib/supabase';
import { captureMessage } from '@/lib/sentry';
import { makeProcessedTicket, makeTMDBMatch, makeTMDBMovie, mockSupabaseQuery } from '../fixtures';
import type { ProcessedTicket } from '@/lib/ticket-processor';

const mockAddMovieToLibrary = addMovieToLibrary as jest.Mock;
const mockUpdateJourney = updateJourney as jest.Mock;
const mockFrom = supabase.from as jest.Mock;
const mockCaptureMessage = captureMessage as jest.Mock;

const USER = { id: 'user-abc-123' };

const queryClient = { invalidateQueries: jest.fn() } as any;
const triggerAchievementCheck = jest.fn();

function makeMatchedTicket(tmdbId: number, title = `Movie ${tmdbId}`): ProcessedTicket {
  return makeProcessedTicket({
    movieTitle: title,
    barcodeData: null,
    ticketPhotoUri: null,
    tmdbMatch: makeTMDBMatch({ movie: makeTMDBMovie({ id: tmdbId, title }) as any }),
  });
}

/**
 * Route supabase.from() by table: theater_visits inserts always succeed, and the
 * user_movies reconciliation selects come off the supplied queue in order.
 */
function routeFrom(reconcileChains: Record<string, unknown>[]) {
  let next = 0;
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_movies') {
      return reconcileChains[next++] ?? mockSupabaseQuery({ data: [], error: null });
    }
    return mockSupabaseQuery({ data: null, error: null });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateJourney.mockResolvedValue({});
  mockAddMovieToLibrary.mockImplementation(async (_userId: string, movie: { id: number }) => ({
    id: `journey-${movie.id}`,
  }));
});

describe('saveTicketsToJourney — persistence reconciliation', () => {
  it('queries with the exact user/status/tmdb_id filters the save wrote', async () => {
    const tickets = [makeMatchedTicket(1), makeMatchedTicket(2)];
    const reconcileChain = mockSupabaseQuery({ data: [{ tmdb_id: 1 }, { tmdb_id: 2 }], error: null });
    routeFrom([reconcileChain]);

    await saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck);

    expect(mockFrom).toHaveBeenCalledWith('user_movies');
    expect(reconcileChain.select).toHaveBeenCalledWith('tmdb_id');
    expect(reconcileChain.eq).toHaveBeenCalledWith('user_id', USER.id);
    expect(reconcileChain.eq).toHaveBeenCalledWith('status', 'watched');
    expect(reconcileChain.in).toHaveBeenCalledWith('tmdb_id', [1, 2]);
  });

  it('downgrades a resolved save whose row never persisted, and drops it from savedMovies', async () => {
    const tickets = [makeMatchedTicket(1, 'Persisted'), makeMatchedTicket(2, 'Vanished')];
    // Both addMovieToLibrary calls resolve, but only tmdb_id 1 is really there.
    routeFrom([mockSupabaseQuery({ data: [{ tmdb_id: 1 }], error: null })]);

    const result = await saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck);

    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.persistenceFailed).toBe(1);
    expect(result.attempted).toBe(2);
    // The First Take wizard must not prompt for a movie that isn't in the library.
    expect(result.savedMovies.map((m) => m.tmdbId)).toEqual([1]);
    expect(result.firstMovieTmdbId).toBe(1);

    expect(mockCaptureMessage).toHaveBeenCalledWith('scan-save-reconciliation-mismatch', {
      claimed: 2,
      claimedDistinct: 2,
      persisted: 1,
    });
  });

  it('leaves counts untouched — and stays silent — when every save reconciles', async () => {
    const tickets = [makeMatchedTicket(1), makeMatchedTicket(2)];
    routeFrom([mockSupabaseQuery({ data: [{ tmdb_id: 1 }, { tmdb_id: 2 }], error: null })]);

    const result = await saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck);

    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.persistenceFailed).toBe(0);
    expect(result.savedMovies.map((m) => m.tmdbId)).toEqual([1, 2]);
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(
      'scan-save-reconciliation-mismatch',
      expect.anything()
    );
  });

  it('does not downgrade anything when the reconciliation read itself errors', async () => {
    const tickets = [makeMatchedTicket(1), makeMatchedTicket(2)];
    routeFrom([mockSupabaseQuery({ data: null, error: { message: 'gateway timeout' } })]);

    const result = await saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck);

    // Can't verify != didn't persist — keep trusting the resolutions.
    expect(result.succeeded).toBe(2);
    expect(result.persistenceFailed).toBe(0);
    expect(result.savedMovies).toHaveLength(2);
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(
      'scan-save-reconciliation-mismatch',
      expect.anything()
    );
  });

  it('chunks the .in() filter at 200 ids and unions the chunk responses', async () => {
    const TICKET_COUNT = 250;
    const tickets = Array.from({ length: TICKET_COUNT }, (_, i) => makeMatchedTicket(i + 1));
    const firstChunkIds = Array.from({ length: 200 }, (_, i) => i + 1);
    const secondChunkIds = Array.from({ length: 50 }, (_, i) => i + 201);
    const firstChunk = mockSupabaseQuery({
      data: firstChunkIds.map((id) => ({ tmdb_id: id })),
      error: null,
    });
    const secondChunk = mockSupabaseQuery({
      data: secondChunkIds.map((id) => ({ tmdb_id: id })),
      error: null,
    });
    routeFrom([firstChunk, secondChunk]);

    const result = await saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck);

    expect(firstChunk.in).toHaveBeenCalledWith('tmdb_id', firstChunkIds);
    expect(secondChunk.in).toHaveBeenCalledWith('tmdb_id', secondChunkIds);
    expect(result.succeeded).toBe(TICKET_COUNT);
    expect(result.persistenceFailed).toBe(0);
  });

  it('short-circuits on a first-chunk error — the second chunk is never queried', async () => {
    const TICKET_COUNT = 250;
    const tickets = Array.from({ length: TICKET_COUNT }, (_, i) => makeMatchedTicket(i + 1));
    const secondChunk = mockSupabaseQuery({
      data: Array.from({ length: 50 }, (_, i) => ({ tmdb_id: i + 201 })),
      error: null,
    });
    routeFrom([
      mockSupabaseQuery({ data: null, error: { message: 'gateway timeout' } }),
      secondChunk,
    ]);

    const result = await saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck);

    // The batch is already unverifiable, so the remaining read is wasted work.
    expect(mockFrom.mock.calls.filter(([table]) => table === 'user_movies')).toHaveLength(1);
    expect(secondChunk.in).not.toHaveBeenCalled();
    expect(result.succeeded).toBe(TICKET_COUNT);
    expect(result.persistenceFailed).toBe(0);
  });

  it('treats any chunk erroring as the whole batch being unverifiable — no partial downgrades', async () => {
    const TICKET_COUNT = 250;
    const tickets = Array.from({ length: TICKET_COUNT }, (_, i) => makeMatchedTicket(i + 1));
    // The first chunk alone would look like a mass failure; the second erroring
    // must void the whole verification rather than act on that partial read.
    routeFrom([
      mockSupabaseQuery({ data: [{ tmdb_id: 1 }], error: null }),
      mockSupabaseQuery({ data: null, error: { message: 'gateway timeout' } }),
    ]);

    const result = await saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck);

    expect(result.succeeded).toBe(TICKET_COUNT);
    expect(result.persistenceFailed).toBe(0);
    expect(mockCaptureMessage).not.toHaveBeenCalledWith(
      'scan-save-reconciliation-mismatch',
      expect.anything()
    );
  });

  it('still throws the all-failed error when nothing persisted', async () => {
    const tickets = [makeMatchedTicket(1), makeMatchedTicket(2)];
    // Both resolve; neither is found. That is an all-failed batch, so the
    // existing early-throw contract holds and the caller keeps the review step.
    routeFrom([mockSupabaseQuery({ data: [], error: null })]);

    await expect(
      saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck)
    ).rejects.toThrow('All movies failed to save');

    // Nothing landed, so no achievement check and no cache bust.
    expect(triggerAchievementCheck).not.toHaveBeenCalled();
  });

  it('still throws the all-failed error when every save rejected outright', async () => {
    const tickets = [makeMatchedTicket(1), makeMatchedTicket(2)];
    mockAddMovieToLibrary.mockRejectedValue(new Error('network down'));
    routeFrom([]);

    await expect(
      saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck)
    ).rejects.toThrow('All movies failed to save');

    // Nothing was claimed, so there is nothing to reconcile.
    expect(mockFrom).not.toHaveBeenCalledWith('user_movies');
  });

  it('counts a partly-rejected batch as rejected + unpersisted', async () => {
    const tickets = [makeMatchedTicket(1), makeMatchedTicket(2), makeMatchedTicket(3)];
    mockAddMovieToLibrary.mockImplementation(async (_userId: string, movie: { id: number }) => {
      if (movie.id === 3) throw new Error('network down');
      return { id: `journey-${movie.id}` };
    });
    // Of the two that resolved, only tmdb_id 1 actually persisted.
    routeFrom([mockSupabaseQuery({ data: [{ tmdb_id: 1 }], error: null })]);

    const result = await saveTicketsToJourney(tickets, USER, queryClient, triggerAchievementCheck);

    expect(result.succeeded).toBe(1);
    expect(result.persistenceFailed).toBe(1);
    expect(result.failed).toBe(2); // one rejected + one unpersisted
    expect(result.savedMovies.map((m) => m.tmdbId)).toEqual([1]);
    // Only claims are reconciled — the rejected ticket is never queried.
    expect(mockCaptureMessage).toHaveBeenCalledWith('scan-save-reconciliation-mismatch', {
      claimed: 2,
      claimedDistinct: 2,
      persisted: 1,
    });
  });

  it('skips reconciliation entirely when no ticket has a TMDB match', async () => {
    const result = await saveTicketsToJourney(
      [makeProcessedTicket({ tmdbMatch: null })],
      USER,
      queryClient,
      triggerAchievementCheck
    );

    expect(result).toEqual({
      succeeded: 0,
      failed: 0,
      persistenceFailed: 0,
      attempted: 0,
      firstMovieTmdbId: null,
      savedMovies: [],
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
