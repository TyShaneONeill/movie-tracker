import {
  checkPayloadSize,
  countTotalEpisodes,
  MAX_TOTAL_EPISODES_PER_CALL,
  MAX_TOTAL_MOVIES_PER_CALL,
  MAX_TOTAL_SHOWS_PER_CALL,
} from '../../../supabase/functions/import-tvtime/validation';

// The edge fn returns this 413 body to the client, which reslices on it. The
// shows cap (#691) is the new guard: a follows-heavy migrant with thousands of
// 0-episode shows passes the episode cap but must still be chunked.
function showsWithEpisodes(count: number, episodesEach: number) {
  return Array.from({ length: count }, () => ({
    episodes: Array.from({ length: episodesEach }, () => ({})),
  }));
}

describe('checkPayloadSize', () => {
  it('accepts a payload within every ceiling', () => {
    expect(checkPayloadSize(showsWithEpisodes(10, 5), [{}, {}])).toBeNull();
  });

  it('accepts exactly the shows ceiling (boundary is > cap)', () => {
    expect(checkPayloadSize(showsWithEpisodes(MAX_TOTAL_SHOWS_PER_CALL, 0), [])).toBeNull();
  });

  it('rejects one show over the shows ceiling even with zero episodes', () => {
    const body = checkPayloadSize(showsWithEpisodes(MAX_TOTAL_SHOWS_PER_CALL + 1, 0), []);
    expect(body).toEqual({
      error: 'chunk_too_large',
      maxEpisodes: MAX_TOTAL_EPISODES_PER_CALL,
      maxMovies: MAX_TOTAL_MOVIES_PER_CALL,
      maxShows: MAX_TOTAL_SHOWS_PER_CALL,
    });
  });

  it('still rejects over the episode ceiling', () => {
    // 10 shows, but their episodes sum past the cap.
    const shows = showsWithEpisodes(10, Math.ceil((MAX_TOTAL_EPISODES_PER_CALL + 10) / 10));
    expect(checkPayloadSize(shows, [])?.error).toBe('chunk_too_large');
  });

  it('still rejects over the movie ceiling', () => {
    const movies = Array.from({ length: MAX_TOTAL_MOVIES_PER_CALL + 1 }, () => ({}));
    expect(checkPayloadSize([], movies)?.error).toBe('chunk_too_large');
  });

  it('accepts exactly the movie ceiling', () => {
    const movies = Array.from({ length: MAX_TOTAL_MOVIES_PER_CALL }, () => ({}));
    expect(checkPayloadSize([], movies)).toBeNull();
  });
});

describe('countTotalEpisodes', () => {
  it('sums episode arrays and treats a missing/non-array episodes as 0', () => {
    expect(
      countTotalEpisodes([
        { episodes: [{}, {}] },
        { episodes: [] },
        {}, // no episodes key
        { episodes: 'nope' as unknown }, // non-array
      ]),
    ).toBe(2);
  });
});
