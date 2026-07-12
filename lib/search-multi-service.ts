import { supabase } from './supabase';
import { searchMovies } from './movie-service';
import { searchTvShows } from './tv-show-service';
import type { SearchMultiResponse } from './tmdb.types';

/**
 * Runs the Search v2 title fan-out (movies + TV) in a single edge-fn call.
 *
 * `search-multi` consolidates the two per-keystroke requests the v2 client used
 * to make. It fails GRACEFULLY: if the edge fn errors or isn't deployed (e.g.
 * production before the fn ships), we fall back to the original fan-out
 * (search-movies title-mode + search-tv-shows in parallel) and assemble the
 * same shape, so the rescue behaviour never regresses. The person/actor and
 * app-user queries stay separate and are not part of this consolidation.
 */
export async function searchMulti(
  query: string,
  page: number = 1
): Promise<SearchMultiResponse> {
  const { data, error } = await supabase.functions.invoke<SearchMultiResponse>(
    'search-multi',
    {
      body: { query, page },
    }
  );

  if (!error && data) {
    return data;
  }

  // Graceful fallback: the consolidated fn is unavailable — fan out to the two
  // dedicated fns. Settle them independently so a single-endpoint outage
  // (e.g. TV search failing) still renders the other side's results instead of
  // blanking everything; only when BOTH fail do we surface the error.
  const [movieRes, tvRes] = await Promise.allSettled([
    searchMovies(query, page, 'title'),
    searchTvShows(query, page),
  ]);

  if (movieRes.status === 'rejected' && tvRes.status === 'rejected') {
    throw movieRes.reason;
  }

  const errors: { movies?: string; tvShows?: string } = {};
  if (movieRes.status === 'rejected') {
    errors.movies = movieRes.reason?.message || 'movie search failed';
  }
  if (tvRes.status === 'rejected') {
    errors.tvShows = tvRes.reason?.message || 'tv search failed';
  }

  const movie = movieRes.status === 'fulfilled' ? movieRes.value : null;
  const tv = tvRes.status === 'fulfilled' ? tvRes.value : null;

  return {
    movies: movie?.movies ?? [],
    tvShows: tv?.shows ?? [],
    movieTotal: movie?.totalResults ?? 0,
    tvTotal: tv?.totalResults ?? 0,
    page: movie?.page ?? tv?.page ?? 1,
    ...(Object.keys(errors).length ? { errors } : {}),
  };
}
