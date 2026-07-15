import { searchMovies } from '@/lib/movie-service';
import { supabase } from '@/lib/supabase';
import type { TmdbGateway } from './types';

/** Shape returned by the `find-by-external-id` edge function (see note below). */
interface FindByExternalIdResponse {
  tv: { id: number; name: string } | null;
}

/**
 * Default {@link TmdbGateway} backed by the app's existing Supabase edge
 * functions (the same `supabase.functions.invoke` path the rest of the client
 * uses — no new HTTP client or API key).
 *
 * - Movies reuse the existing `search-movies` edge function via
 *   {@link searchMovies}.
 * - Show lookup calls a `find-by-external-id` edge function that wraps TMDB's
 *   `/find/{id}?external_source=tvdb_id`. **That edge function does not exist
 *   yet — it is a PR-2 dependency.** The pure matcher never touches this
 *   gateway (tests inject a mock), so PR 1 stays green without it; PR 2 adds
 *   the edge function and the bulk-write path that consumes this gateway.
 */
export function createDefaultTmdbGateway(): TmdbGateway {
  return {
    async findTvByTvdbId(tvdbId) {
      const { data, error } = await supabase.functions.invoke<FindByExternalIdResponse>(
        'find-by-external-id',
        { body: { externalId: tvdbId, source: 'tvdb_id', type: 'tv' } }
      );
      if (error) throw new Error(error.message || 'find-by-external-id failed');
      return data?.tv ?? null;
    },

    async searchMovie(title) {
      const response = await searchMovies(title);
      return response.movies;
    },
  };
}
