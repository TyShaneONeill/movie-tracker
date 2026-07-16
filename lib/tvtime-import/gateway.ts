import { searchMovies } from '@/lib/movie-service';
import { getTvShowDetails } from '@/lib/tv-show-service';
import { supabase } from '@/lib/supabase';
import type { TmdbGateway, TmdbShowLookup } from './types';

/** Shape returned by the extended `find-by-external-id` edge function. `id`/
 *  `name` are always present; the metadata fields come from TMDB's
 *  `/find` `tv_results[0]` and let imported shows render posters + feed stats. */
interface FindByExternalIdResponse {
  tv:
    | {
        id: number;
        name: string;
        poster_path?: string | null;
        backdrop_path?: string | null;
        genre_ids?: number[] | null;
        first_air_date?: string | null;
        vote_average?: number | null;
        overview?: string | null;
      }
    | null;
}

/**
 * Default {@link TmdbGateway} backed by the app's existing Supabase edge
 * functions (the same `supabase.functions.invoke` path the rest of the client
 * uses — no new HTTP client or API key).
 *
 * - Movies reuse the existing `search-movies` edge function via
 *   {@link searchMovies}; its results already carry poster/backdrop/genre_ids.
 * - Show lookup calls `find-by-external-id` (extended to return poster/genre
 *   metadata alongside id+name) for the cheap poster fix; episode/season counts
 *   aren't in TMDB `/find`, so {@link TmdbGateway.getShowEpisodeCounts} fetches
 *   them best-effort via the existing `get-tv-show-details` service.
 */
export function createDefaultTmdbGateway(): TmdbGateway {
  return {
    async findTvByTvdbId(tvdbId) {
      const { data, error } = await supabase.functions.invoke<FindByExternalIdResponse>(
        'find-by-external-id',
        { body: { externalId: tvdbId, source: 'tvdb_id', type: 'tv' } }
      );
      if (error) throw new Error(error.message || 'find-by-external-id failed');
      const tv = data?.tv;
      if (!tv) return null;
      const lookup: TmdbShowLookup = {
        id: tv.id,
        name: tv.name,
        posterPath: tv.poster_path ?? null,
        backdropPath: tv.backdrop_path ?? null,
        genreIds: tv.genre_ids ?? [],
        firstAirDate: tv.first_air_date ?? null,
        voteAverage: tv.vote_average ?? null,
        overview: tv.overview ?? null,
      };
      return lookup;
    },

    async searchMovie(title) {
      const response = await searchMovies(title);
      return response.movies;
    },

    async getShowEpisodeCounts(tmdbId) {
      // Best-effort: a details failure must never fail the whole import — the
      // show still imports with its poster; counts just stay null.
      try {
        const { show } = await getTvShowDetails(tmdbId);
        return {
          numberOfEpisodes: show?.number_of_episodes ?? null,
          numberOfSeasons: show?.number_of_seasons ?? null,
        };
      } catch {
        return null;
      }
    },
  };
}
