export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      first_takes: {
        Row: {
          created_at: string | null
          id: string
          is_spoiler: boolean | null
          movie_title: string
          poster_path: string | null
          quote_text: string
          rating: number | null
          reaction_emoji: string
          tmdb_id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_spoiler?: boolean | null
          movie_title: string
          poster_path?: string | null
          quote_text: string
          rating?: number | null
          reaction_emoji?: string
          tmdb_id: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_spoiler?: boolean | null
          movie_title?: string
          poster_path?: string | null
          quote_text?: string
          rating?: number | null
          reaction_emoji?: string
          tmdb_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "first_takes_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      genres: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id: number
          name: string
          slug: string
        }
        Update: {
          id?: number
          name?: string
          slug?: string
        }
        Relationships: []
      }
      list_movies: {
        Row: {
          added_at: string | null
          id: string
          list_id: string
          position: number
          poster_path: string | null
          title: string
          tmdb_id: number
        }
        Insert: {
          added_at?: string | null
          id?: string
          list_id: string
          position?: number
          poster_path?: string | null
          title: string
          tmdb_id: number
        }
        Update: {
          added_at?: string | null
          id?: string
          list_id?: string
          position?: number
          poster_path?: string | null
          title?: string
          tmdb_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "list_movies_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "user_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      movies: {
        Row: {
          adult: boolean | null
          backdrop_path: string | null
          budget: number | null
          cached_cast: Json | null
          cached_crew: Json | null
          created_at: string | null
          genre_ids: number[] | null
          id: number
          imdb_id: string | null
          original_language: string | null
          original_title: string | null
          overview: string | null
          poster_path: string | null
          release_date: string | null
          revenue: number | null
          runtime_minutes: number | null
          status: string | null
          tagline: string | null
          title: string
          tmdb_fetched_at: string | null
          tmdb_id: number
          tmdb_popularity: number | null
          tmdb_vote_average: number | null
          tmdb_vote_count: number | null
          trailer_name: string | null
          trailer_youtube_key: string | null
          updated_at: string | null
        }
        Insert: {
          adult?: boolean | null
          backdrop_path?: string | null
          budget?: number | null
          cached_cast?: Json | null
          cached_crew?: Json | null
          created_at?: string | null
          genre_ids?: number[] | null
          id?: number
          imdb_id?: string | null
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          revenue?: number | null
          runtime_minutes?: number | null
          status?: string | null
          tagline?: string | null
          title: string
          tmdb_fetched_at?: string | null
          tmdb_id: number
          tmdb_popularity?: number | null
          tmdb_vote_average?: number | null
          tmdb_vote_count?: number | null
          trailer_name?: string | null
          trailer_youtube_key?: string | null
          updated_at?: string | null
        }
        Update: {
          adult?: boolean | null
          backdrop_path?: string | null
          budget?: number | null
          cached_cast?: Json | null
          cached_crew?: Json | null
          created_at?: string | null
          genre_ids?: number[] | null
          id?: number
          imdb_id?: string | null
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          revenue?: number | null
          runtime_minutes?: number | null
          status?: string | null
          tagline?: string | null
          title?: string
          tmdb_fetched_at?: string | null
          tmdb_id?: number
          tmdb_popularity?: number | null
          tmdb_vote_average?: number | null
          tmdb_vote_count?: number | null
          trailer_name?: string | null
          trailer_youtube_key?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string | null
          data: Json | null
          id: string
          read: boolean | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read?: boolean | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          read?: boolean | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          user_id: string
          action: string
          window_count: number
          window_start: string
        }
        Insert: {
          user_id: string
          action: string
          window_count?: number
          window_start?: string
        }
        Update: {
          user_id?: string
          action?: string
          window_count?: number
          window_start?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_tier: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          first_take_prompt_enabled: boolean | null
          followers_count: number | null
          following_count: number | null
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          theme_preference: string | null
          tier_expires_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          account_tier?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          first_take_prompt_enabled?: boolean | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id: string
          onboarding_completed?: boolean | null
          theme_preference?: string | null
          tier_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          account_tier?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          first_take_prompt_enabled?: boolean | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean | null
          theme_preference?: string | null
          tier_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      scan_usage: {
        Row: {
          bonus_scans: number | null
          bypass_rate_limit: boolean | null
          daily_count: number | null
          last_scan_date: string | null
          lifetime_scans: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          bonus_scans?: number | null
          bypass_rate_limit?: boolean | null
          daily_count?: number | null
          last_scan_date?: string | null
          lifetime_scans?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          bonus_scans?: number | null
          bypass_rate_limit?: boolean | null
          daily_count?: number | null
          last_scan_date?: string | null
          lifetime_scans?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      theater_visits: {
        Row: {
          auditorium: string | null
          confidence_score: number | null
          confirmation_number: string | null
          created_at: string | null
          format: string | null
          id: string
          is_verified: boolean | null
          movie_title: string
          price_amount: number | null
          price_currency: string | null
          scan_notes: string | null
          seat_number: string | null
          seat_row: string | null
          show_date: string | null
          show_time: string | null
          theater_chain: string | null
          theater_name: string | null
          ticket_type: string | null
          tmdb_id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          auditorium?: string | null
          confidence_score?: number | null
          confirmation_number?: string | null
          created_at?: string | null
          format?: string | null
          id?: string
          is_verified?: boolean | null
          movie_title: string
          price_amount?: number | null
          price_currency?: string | null
          scan_notes?: string | null
          seat_number?: string | null
          seat_row?: string | null
          show_date?: string | null
          show_time?: string | null
          theater_chain?: string | null
          theater_name?: string | null
          ticket_type?: string | null
          tmdb_id: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          auditorium?: string | null
          confidence_score?: number | null
          confirmation_number?: string | null
          created_at?: string | null
          format?: string | null
          id?: string
          is_verified?: boolean | null
          movie_title?: string
          price_amount?: number | null
          price_currency?: string | null
          scan_notes?: string | null
          seat_number?: string | null
          seat_row?: string | null
          show_date?: string | null
          show_time?: string | null
          theater_chain?: string | null
          theater_name?: string | null
          ticket_type?: string | null
          tmdb_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_lists: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_movie_likes: {
        Row: {
          created_at: string | null
          id: string
          poster_path: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          poster_path?: string | null
          title: string
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          poster_path?: string | null
          title?: string
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
      user_movies: {
        Row: {
          added_at: string
          ai_poster_rarity: string | null
          ai_poster_url: string | null
          auditorium: string | null
          backdrop_path: string | null
          cover_photo_index: number | null
          display_poster: string | null
          genre_ids: number[] | null
          id: string
          is_liked: boolean | null
          journey_created_at: string | null
          journey_notes: string | null
          journey_number: number | null
          journey_photos: string[] | null
          journey_tagline: string | null
          journey_updated_at: string | null
          location_name: string | null
          location_type: string | null
          overview: string | null
          poster_path: string | null
          release_date: string | null
          seat_location: string | null
          status: string
          ticket_id: string | null
          ticket_price: number | null
          title: string
          tmdb_id: number
          updated_at: string
          user_id: string
          vote_average: number | null
          watch_format: string | null
          watch_time: string | null
          watched_at: string | null
          watched_with: string[] | null
        }
        Insert: {
          added_at?: string
          ai_poster_rarity?: string | null
          ai_poster_url?: string | null
          auditorium?: string | null
          backdrop_path?: string | null
          cover_photo_index?: number | null
          display_poster?: string | null
          genre_ids?: number[] | null
          id?: string
          is_liked?: boolean | null
          journey_created_at?: string | null
          journey_notes?: string | null
          journey_number?: number | null
          journey_photos?: string[] | null
          journey_tagline?: string | null
          journey_updated_at?: string | null
          location_name?: string | null
          location_type?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          seat_location?: string | null
          status?: string
          ticket_id?: string | null
          ticket_price?: number | null
          title: string
          tmdb_id: number
          updated_at?: string
          user_id: string
          vote_average?: number | null
          watch_format?: string | null
          watch_time?: string | null
          watched_at?: string | null
          watched_with?: string[] | null
        }
        Update: {
          added_at?: string
          ai_poster_rarity?: string | null
          ai_poster_url?: string | null
          auditorium?: string | null
          backdrop_path?: string | null
          cover_photo_index?: number | null
          display_poster?: string | null
          genre_ids?: number[] | null
          id?: string
          is_liked?: boolean | null
          journey_created_at?: string | null
          journey_notes?: string | null
          journey_number?: number | null
          journey_photos?: string[] | null
          journey_tagline?: string | null
          journey_updated_at?: string | null
          location_name?: string | null
          location_type?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          seat_location?: string | null
          status?: string
          ticket_id?: string | null
          ticket_price?: number | null
          title?: string
          tmdb_id?: number
          updated_at?: string
          user_id?: string
          vote_average?: number | null
          watch_format?: string | null
          watch_time?: string | null
          watched_at?: string | null
          watched_with?: string[] | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_increment_scan: {
        Args: { p_daily_limit?: number; p_user_id: string }
        Returns: Json
      }
      get_journey_for_movie: {
        Args: { p_tmdb_id: number }
        Returns: {
          added_at: string
          ai_poster_rarity: string
          ai_poster_url: string
          backdrop_path: string
          cinema_location: string
          display_poster: string
          first_viewing: boolean
          genre_ids: number[]
          id: string
          journey_created_at: string
          journey_number: number
          journey_updated_at: string
          notes: string
          overview: string
          poster_path: string
          rating: number
          release_date: string
          status: string
          theater_name: string
          title: string
          tmdb_id: number
          user_id: string
          vote_average: number
          watch_provider: string
          watched_with: string[]
        }[]
      }
      get_journey_with_movie: {
        Args: { p_journey_id: string }
        Returns: {
          added_at: string
          ai_poster_rarity: string
          ai_poster_url: string
          backdrop_path: string
          cinema_location: string
          display_poster: string
          first_viewing: boolean
          genre_ids: number[]
          id: string
          journey_created_at: string
          journey_number: number
          journey_updated_at: string
          notes: string
          overview: string
          poster_path: string
          rating: number
          release_date: string
          status: string
          theater_name: string
          title: string
          tmdb_id: number
          user_id: string
          vote_average: number
          watch_provider: string
          watched_with: string[]
        }[]
      }
      get_movie_journeys: {
        Args: { p_tmdb_id: number }
        Returns: {
          added_at: string
          ai_poster_rarity: string
          ai_poster_url: string
          backdrop_path: string
          cinema_location: string
          display_poster: string
          first_viewing: boolean
          genre_ids: number[]
          id: string
          journey_created_at: string
          journey_number: number
          journey_updated_at: string
          notes: string
          overview: string
          poster_path: string
          rating: number
          release_date: string
          status: string
          theater_name: string
          title: string
          tmdb_id: number
          user_id: string
          vote_average: number
          watch_provider: string
          watched_with: string[]
        }[]
      }
      get_user_monthly_activity: {
        Args: { p_user_id: string }
        Returns: {
          count: number
          month: string
          month_label: string
        }[]
      }
      get_user_stats_summary: {
        Args: { p_user_id: string }
        Returns: {
          avg_rating: number
          total_first_takes: number
          total_watched: number
        }[]
      }
      increment_bonus_scans: { Args: { p_user_id: string }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ============================================
// Custom Helper Types
// ============================================

export type MovieStatus = 'watchlist' | 'watching' | 'watched';
export type ThemePreference = 'light' | 'dark' | 'system';

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

// Helper types for follows
export type Follow = Database['public']['Tables']['follows']['Row'];
export type FollowInsert = Database['public']['Tables']['follows']['Insert'];
export type FollowUpdate = Database['public']['Tables']['follows']['Update'];

// Helper types for notifications
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type NotificationInsert = Database['public']['Tables']['notifications']['Insert'];
export type NotificationUpdate = Database['public']['Tables']['notifications']['Update'];

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
