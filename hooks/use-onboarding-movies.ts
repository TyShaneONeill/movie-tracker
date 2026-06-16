import { useQuery } from '@tanstack/react-query';

import { getMovieList, discoverMoviesByGenre } from '@/lib/movie-service';
import type { TMDBMovie } from '@/lib/tmdb.types';
import { genreSlugsToTmdbIds } from '@/components/onboarding/v2/data/genres';

const MAX_RESULTS = 18;
const MAX_GENRE_QUERIES = 2;

/**
 * Personalized + popular movie set for the onboarding Watchlist step.
 *
 * Pulls trending plus discover-by-genre for the user's top picked genres,
 * dedupes, drops posterless rows, then stable-sorts so titles whose genres
 * intersect the user's picks float to the top (the design's personalization
 * rule). No new backend — reuses existing edge-function-backed services.
 */
export function useOnboardingMovies(genreSlugs: string[]) {
  const tmdbIds = genreSlugsToTmdbIds(genreSlugs);

  return useQuery({
    queryKey: ['onboarding-movies', tmdbIds],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TMDBMovie[]> => {
      const [trending, ...genreResults] = await Promise.all([
        getMovieList('trending', 1),
        ...tmdbIds.slice(0, MAX_GENRE_QUERIES).map((id) => discoverMoviesByGenre(id, 1)),
      ]);

      // Genre matches first in the merge so they win ties on stable sort.
      const merged = [...genreResults.flatMap((r) => r.movies), ...trending.movies];

      const seen = new Set<number>();
      const unique: TMDBMovie[] = [];
      for (const movie of merged) {
        if (!movie.poster_path || seen.has(movie.id)) continue;
        seen.add(movie.id);
        unique.push(movie);
      }

      const pickedGenres = new Set(tmdbIds);
      return unique
        .map((movie, i) => ({ movie, i }))
        .sort((a, b) => {
          const aMatch = a.movie.genre_ids.some((g) => pickedGenres.has(g)) ? 0 : 1;
          const bMatch = b.movie.genre_ids.some((g) => pickedGenres.has(g)) ? 0 : 1;
          return aMatch - bMatch || a.i - b.i; // stable within each group
        })
        .map((x) => x.movie)
        .slice(0, MAX_RESULTS);
    },
  });
}
