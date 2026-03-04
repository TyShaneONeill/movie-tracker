import { supabase } from './supabase';

export interface ExternalRatingsResponse {
  ratings: {
    imdb: { rating: number; votes: number } | null;
    rottenTomatoes: { score: number } | null;
    metacritic: { score: number } | null;
  } | null;
  source: 'cache' | 'omdb' | 'unavailable';
}

// Fetch external ratings (IMDb, Rotten Tomatoes, Metacritic) for a movie
export async function fetchExternalRatings(
  tmdbId: number
): Promise<ExternalRatingsResponse> {
  const { data, error } = await supabase.functions.invoke<ExternalRatingsResponse>(
    'get-movie-ratings',
    {
      body: { tmdb_id: tmdbId },
    }
  );

  if (error) {
    throw new Error(error.message || 'Failed to fetch external ratings');
  }

  if (!data) {
    throw new Error('No data returned from external ratings');
  }

  return data;
}
