export type MovieStatus = 'watchlist' | 'watching' | 'watched';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          first_take_prompt_enabled: boolean | null;
          theme_preference: string | null;
          onboarding_completed: boolean | null;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          first_take_prompt_enabled?: boolean | null;
          theme_preference?: string | null;
          onboarding_completed?: boolean | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          first_take_prompt_enabled?: boolean | null;
          theme_preference?: string | null;
          onboarding_completed?: boolean | null;
        };
      };
      genres: {
        Row: {
          id: number;
          name: string;
          slug: string;
        };
        Insert: {
          id: number;
          name: string;
          slug: string;
        };
        Update: {
          id?: number;
          name?: string;
          slug?: string;
        };
      };
      movies: {
        Row: {
          id: number;
          tmdb_id: number;
          imdb_id: string | null;
          title: string;
          original_title: string | null;
          tagline: string | null;
          overview: string | null;
          release_date: string | null;
          runtime_minutes: number | null;
          status: string | null;
          tmdb_vote_average: number | null;
          tmdb_vote_count: number | null;
          genre_ids: number[] | null;
          adult: boolean | null;
          original_language: string | null;
          poster_path: string | null;
          backdrop_path: string | null;
          tmdb_popularity: number | null;
          budget: number | null;
          revenue: number | null;
          tmdb_fetched_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: number;
          tmdb_id: number;
          imdb_id?: string | null;
          title: string;
          original_title?: string | null;
          tagline?: string | null;
          overview?: string | null;
          release_date?: string | null;
          runtime_minutes?: number | null;
          status?: string | null;
          tmdb_vote_average?: number | null;
          tmdb_vote_count?: number | null;
          genre_ids?: number[] | null;
          adult?: boolean | null;
          original_language?: string | null;
          poster_path?: string | null;
          backdrop_path?: string | null;
          tmdb_popularity?: number | null;
          budget?: number | null;
          revenue?: number | null;
          tmdb_fetched_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: number;
          tmdb_id?: number;
          imdb_id?: string | null;
          title?: string;
          original_title?: string | null;
          tagline?: string | null;
          overview?: string | null;
          release_date?: string | null;
          runtime_minutes?: number | null;
          status?: string | null;
          tmdb_vote_average?: number | null;
          tmdb_vote_count?: number | null;
          genre_ids?: number[] | null;
          adult?: boolean | null;
          original_language?: string | null;
          poster_path?: string | null;
          backdrop_path?: string | null;
          tmdb_popularity?: number | null;
          budget?: number | null;
          revenue?: number | null;
          tmdb_fetched_at?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      user_movies: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: number;
          status: string;
          title: string;
          overview: string | null;
          poster_path: string | null;
          backdrop_path: string | null;
          release_date: string | null;
          vote_average: number | null;
          genre_ids: number[] | null;
          is_liked: boolean | null;
          added_at: string;
          updated_at: string;
          // Journey fields
          journey_number: number;
          watched_at: string | null;
          watch_time: string | null;
          location_type: 'theater' | 'home' | 'airplane' | 'outdoor' | 'other' | null;
          location_name: string | null;
          auditorium: string | null;
          seat_location: string | null;
          ticket_price: number | null;
          ticket_id: string | null;
          watch_format: 'standard' | 'imax' | 'dolby' | '3d' | '4k' | 'screenx' | '4dx' | null;
          watched_with: string[] | null;
          journey_notes: string | null;
          journey_tagline: string | null;
          journey_photos: string[] | null;
          cover_photo_index: number;
          journey_created_at: string | null;
          journey_updated_at: string | null;
          // AI poster fields
          ai_poster_url: string | null;
          ai_poster_rarity: 'common' | 'holographic' | null;
          display_poster: 'original' | 'ai_generated';
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: number;
          status?: string;
          title: string;
          overview?: string | null;
          poster_path?: string | null;
          backdrop_path?: string | null;
          release_date?: string | null;
          vote_average?: number | null;
          genre_ids?: number[] | null;
          is_liked?: boolean | null;
          added_at?: string;
          updated_at?: string;
          // Journey fields
          journey_number?: number;
          watched_at?: string | null;
          watch_time?: string | null;
          location_type?: 'theater' | 'home' | 'airplane' | 'outdoor' | 'other' | null;
          location_name?: string | null;
          auditorium?: string | null;
          seat_location?: string | null;
          ticket_price?: number | null;
          ticket_id?: string | null;
          watch_format?: 'standard' | 'imax' | 'dolby' | '3d' | '4k' | 'screenx' | '4dx' | null;
          watched_with?: string[] | null;
          journey_notes?: string | null;
          journey_tagline?: string | null;
          journey_photos?: string[] | null;
          cover_photo_index?: number;
          journey_created_at?: string | null;
          journey_updated_at?: string | null;
          // AI poster fields
          ai_poster_url?: string | null;
          ai_poster_rarity?: 'common' | 'holographic' | null;
          display_poster?: 'original' | 'ai_generated';
        };
        Update: {
          id?: string;
          user_id?: string;
          tmdb_id?: number;
          status?: string;
          title?: string;
          overview?: string | null;
          poster_path?: string | null;
          backdrop_path?: string | null;
          release_date?: string | null;
          vote_average?: number | null;
          genre_ids?: number[] | null;
          is_liked?: boolean | null;
          added_at?: string;
          updated_at?: string;
          // Journey fields
          journey_number?: number;
          watched_at?: string | null;
          watch_time?: string | null;
          location_type?: 'theater' | 'home' | 'airplane' | 'outdoor' | 'other' | null;
          location_name?: string | null;
          auditorium?: string | null;
          seat_location?: string | null;
          ticket_price?: number | null;
          ticket_id?: string | null;
          watch_format?: 'standard' | 'imax' | 'dolby' | '3d' | '4k' | 'screenx' | '4dx' | null;
          watched_with?: string[] | null;
          journey_notes?: string | null;
          journey_tagline?: string | null;
          journey_photos?: string[] | null;
          cover_photo_index?: number;
          journey_created_at?: string | null;
          journey_updated_at?: string | null;
          // AI poster fields
          ai_poster_url?: string | null;
          ai_poster_rarity?: 'common' | 'holographic' | null;
          display_poster?: 'original' | 'ai_generated';
        };
      };
      user_movie_likes: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: number;
          title: string;
          poster_path: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: number;
          title: string;
          poster_path?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          tmdb_id?: number;
          title?: string;
          poster_path?: string | null;
          created_at?: string | null;
        };
      };
      user_lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          is_public: boolean | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          is_public?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          is_public?: boolean | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      list_movies: {
        Row: {
          id: string;
          list_id: string;
          tmdb_id: number;
          title: string;
          poster_path: string | null;
          position: number;
          added_at: string | null;
        };
        Insert: {
          id?: string;
          list_id: string;
          tmdb_id: number;
          title: string;
          poster_path?: string | null;
          position?: number;
          added_at?: string | null;
        };
        Update: {
          id?: string;
          list_id?: string;
          tmdb_id?: number;
          title?: string;
          poster_path?: string | null;
          position?: number;
          added_at?: string | null;
        };
      };
      first_takes: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: number;
          movie_title: string;
          poster_path: string | null;
          reaction_emoji: string;
          quote_text: string;
          is_spoiler: boolean | null;
          rating: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: number;
          movie_title: string;
          poster_path?: string | null;
          reaction_emoji?: string;
          quote_text: string;
          is_spoiler?: boolean | null;
          rating?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          tmdb_id?: number;
          movie_title?: string;
          poster_path?: string | null;
          reaction_emoji?: string;
          quote_text?: string;
          is_spoiler?: boolean | null;
          rating?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
      scan_usage: {
        Row: {
          user_id: string;
          daily_count: number | null;
          last_scan_date: string | null;
          lifetime_scans: number | null;
          updated_at: string | null;
          bypass_rate_limit: boolean | null;
        };
        Insert: {
          user_id: string;
          daily_count?: number | null;
          last_scan_date?: string | null;
          lifetime_scans?: number | null;
          updated_at?: string | null;
          bypass_rate_limit?: boolean | null;
        };
        Update: {
          user_id?: string;
          daily_count?: number | null;
          last_scan_date?: string | null;
          lifetime_scans?: number | null;
          updated_at?: string | null;
          bypass_rate_limit?: boolean | null;
        };
      };
      theater_visits: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: number;
          movie_title: string;
          theater_name: string | null;
          theater_chain: string | null;
          show_date: string | null;
          show_time: string | null;
          seat_row: string | null;
          seat_number: string | null;
          auditorium: string | null;
          format: string | null;
          price_amount: number | null;
          price_currency: string | null;
          ticket_type: string | null;
          confirmation_number: string | null;
          is_verified: boolean | null;
          confidence_score: number | null;
          scan_notes: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: number;
          movie_title: string;
          theater_name?: string | null;
          theater_chain?: string | null;
          show_date?: string | null;
          show_time?: string | null;
          seat_row?: string | null;
          seat_number?: string | null;
          auditorium?: string | null;
          format?: string | null;
          price_amount?: number | null;
          price_currency?: string | null;
          ticket_type?: string | null;
          confirmation_number?: string | null;
          is_verified?: boolean | null;
          confidence_score?: number | null;
          scan_notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          tmdb_id?: number;
          movie_title?: string;
          theater_name?: string | null;
          theater_chain?: string | null;
          show_date?: string | null;
          show_time?: string | null;
          seat_row?: string | null;
          seat_number?: string | null;
          auditorium?: string | null;
          format?: string | null;
          price_amount?: number | null;
          price_currency?: string | null;
          ticket_type?: string | null;
          confirmation_number?: string | null;
          is_verified?: boolean | null;
          confidence_score?: number | null;
          scan_notes?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: {
      check_and_increment_scan: {
        Args: { p_daily_limit?: number; p_user_id: string };
        Returns: unknown;
      };
      get_user_monthly_activity: {
        Args: { p_user_id: string };
        Returns: Array<{
          count: number;
          month: string;
          month_label: string;
        }>;
      };
      get_user_stats_summary: {
        Args: { p_user_id: string };
        Returns: Array<{
          avg_rating: number;
          total_first_takes: number;
          total_watched: number;
        }>;
      };
    };
    Enums: Record<string, never>;
  };
}

// Helper types for user movies
export type UserMovie = Database['public']['Tables']['user_movies']['Row'];
export type UserMovieInsert = Database['public']['Tables']['user_movies']['Insert'];
export type UserMovieUpdate = Database['public']['Tables']['user_movies']['Update'];

// Helper types for user movie likes
export type UserMovieLike = Database['public']['Tables']['user_movie_likes']['Row'];
export type UserMovieLikeInsert = Database['public']['Tables']['user_movie_likes']['Insert'];

// Helper types for user lists
export type UserList = Database['public']['Tables']['user_lists']['Row'];
export type UserListInsert = Database['public']['Tables']['user_lists']['Insert'];
export type UserListUpdate = Database['public']['Tables']['user_lists']['Update'];

// Helper types for list movies
export type ListMovie = Database['public']['Tables']['list_movies']['Row'];
export type ListMovieInsert = Database['public']['Tables']['list_movies']['Insert'];
export type ListMovieUpdate = Database['public']['Tables']['list_movies']['Update'];

// Composite type for list with movies
export interface UserListWithMovies extends UserList {
  movies: ListMovie[];
  movie_count: number;
}

// Helper types for first takes
export type FirstTake = Database['public']['Tables']['first_takes']['Row'];
export type FirstTakeInsert = Database['public']['Tables']['first_takes']['Insert'];
export type FirstTakeUpdate = Database['public']['Tables']['first_takes']['Update'];

// Helper types for profiles
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

// Helper types for genres
export type Genre = Database['public']['Tables']['genres']['Row'];

// Helper types for movies cache
export type CachedMovie = Database['public']['Tables']['movies']['Row'];
export type CachedMovieInsert = Database['public']['Tables']['movies']['Insert'];
export type CachedMovieUpdate = Database['public']['Tables']['movies']['Update'];

// User stats types (from get-user-stats Edge Function)
export interface UserStatsResponse {
  summary: {
    totalWatched: number;
    totalFirstTakes: number;
    averageRating: number | null;
  };
  genres: Array<{
    genreId: number;
    genreName: string;
    count: number;
    percentage: number;
  }>;
  monthlyActivity: Array<{
    month: string;
    monthLabel: string;
    count: number;
  }>;
}

// Location type enum for journey cards
export type LocationType = 'theater' | 'home' | 'airplane' | 'outdoor' | 'other';

// Watch format enum for journey cards
export type WatchFormat = 'standard' | 'imax' | 'dolby' | '3d' | '4k' | 'screenx' | '4dx';

// Helper type for journey updates
export interface JourneyUpdate {
  watched_at?: string | null;
  watch_time?: string | null;
  location_type?: LocationType | null;
  location_name?: string | null;
  auditorium?: string | null;
  seat_location?: string | null;
  ticket_price?: number | null;
  ticket_id?: string | null;
  watch_format?: WatchFormat | null;
  watched_with?: string[] | null;
  journey_notes?: string | null;
  journey_tagline?: string | null;
  display_poster?: 'original' | 'ai_generated';
}

// AI poster rarity type
export type AiPosterRarity = 'common' | 'holographic';

// Display poster type
export type DisplayPoster = 'original' | 'ai_generated';

// Grouped user movie for collection grid (deduped by tmdb_id)
export interface GroupedUserMovie extends UserMovie {
  journeyCount: number;
}
