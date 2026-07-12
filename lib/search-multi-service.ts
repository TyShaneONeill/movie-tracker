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
  // dedicated fns exactly as the pre-consolidation client did.
  const [movieRes, tvRes] = await Promise.all([
    searchMovies(query, page, 'title'),
    searchTvShows(query, page),
  ]);

  return {
    movies: movieRes.movies,
    tvShows: tvRes.shows,
    movieTotal: movieRes.totalResults,
    tvTotal: tvRes.totalResults,
    page: movieRes.page,
  };
}
