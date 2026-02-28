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
      achievement_levels: {
        Row: {
          achievement_id: string
          created_at: string
          criteria_value: number
          description: string
          id: string
          image_url: string | null
          level: number
        }
        Insert: {
          achievement_id: string
          created_at?: string
          criteria_value: number
          description: string
          id?: string
          image_url?: string | null
          level: number
        }
        Update: {
          achievement_id?: string
          created_at?: string
          criteria_value?: number
          description?: string
          id?: string
          image_url?: string | null
          level?: number
        }
        Relationships: [
          {
            foreignKeyName: "achievement_levels_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      achievements: {
        Row: {
          created_at: string
          criteria_type: string
          criteria_value: number
          description: string
          icon: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          criteria_type: string
          criteria_value?: number
          description: string
          icon?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          criteria_type?: string
          criteria_value?: number
          description?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      ai_usage_costs: {
        Row: {
          created_at: string
          estimated_cost_usd: number
          function_name: string
          id: string
          model: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_cost_usd: number
          function_name: string
          id?: string
          model: string
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_cost_usd?: number
          function_name?: string
          id?: string
          model?: string
          user_id?: string
        }
        Relationships: []
      }
      first_takes: {
        Row: {
          created_at: string | null
          episode_number: number | null
          id: string
          is_spoiler: boolean | null
          media_type: string
          movie_title: string
          poster_path: string | null
          quote_text: string
          rating: number | null
          reaction_emoji: string
          season_number: number | null
          show_name: string | null
          tmdb_id: number
          updated_at: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string | null
          episode_number?: number | null
          id?: string
          is_spoiler?: boolean | null
          media_type?: string
          movie_title: string
          poster_path?: string | null
          quote_text: string
          rating?: number | null
          reaction_emoji?: string
          season_number?: number | null
          show_name?: string | null
          tmdb_id: number
          updated_at?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string | null
          episode_number?: number | null
          id?: string
          is_spoiler?: boolean | null
          media_type?: string
          movie_title?: string
          poster_path?: string | null
          quote_text?: string
          rating?: number | null
          reaction_emoji?: string
          season_number?: number | null
          show_name?: string | null
          tmdb_id?: number
          updated_at?: string | null
          user_id?: string
          visibility?: string
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
          media_type: string
          name: string
          slug: string
        }
        Insert: {
          id: number
          media_type?: string
          name: string
          slug: string
        }
        Update: {
          id?: number
          media_type?: string
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
          media_type: string
          notes: string | null
          position: number
          poster_path: string | null
          title: string
          tmdb_id: number
        }
        Insert: {
          added_at?: string | null
          id?: string
          list_id: string
          media_type?: string
          notes?: string | null
          position?: number
          poster_path?: string | null
          title: string
          tmdb_id: number
        }
        Update: {
          added_at?: string | null
          id?: string
          list_id?: string
          media_type?: string
          notes?: string | null
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
      profiles: {
        Row: {
          account_tier: string
          avatar_url: string | null
          bio: string | null
          content_mode: string
          created_at: string
          default_collection_view: string
          feed_last_seen_at: string | null
          show_continue_watching: boolean
          first_take_prompt_enabled: boolean | null
          followers_count: number | null
          following_count: number | null
          full_name: string | null
          id: string
          onboarding_completed: boolean | null
          review_visibility: string
          theme_preference: string | null
          tier_expires_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          account_tier?: string
          avatar_url?: string | null
          bio?: string | null
          content_mode?: string
          created_at?: string
          default_collection_view?: string
          feed_last_seen_at?: string | null
          first_take_prompt_enabled?: boolean | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id: string
          show_continue_watching?: boolean
          onboarding_completed?: boolean | null
          review_visibility?: string
          theme_preference?: string | null
          tier_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          account_tier?: string
          avatar_url?: string | null
          bio?: string | null
          content_mode?: string
          created_at?: string
          default_collection_view?: string
          feed_last_seen_at?: string | null
          first_take_prompt_enabled?: boolean | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          show_continue_watching?: boolean
          onboarding_completed?: boolean | null
          review_visibility?: string
          theme_preference?: string | null
          tier_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          user_id: string
          window_count: number
          window_start: string
        }
        Insert: {
          action: string
          user_id: string
          window_count?: number
          window_start?: string
        }
        Update: {
          action?: string
          user_id?: string
          window_count?: number
          window_start?: string
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
      tv_episodes_cache: {
        Row: {
          air_date: string | null
          created_at: string | null
          episode_number: number
          guest_stars: Json | null
          id: number
          name: string | null
          overview: string | null
          runtime: number | null
          season_number: number
          still_path: string | null
          tmdb_fetched_at: string | null
          tmdb_show_id: number
          tmdb_vote_average: number | null
          tmdb_vote_count: number | null
        }
        Insert: {
          air_date?: string | null
          created_at?: string | null
          episode_number: number
          guest_stars?: Json | null
          id?: never
          name?: string | null
          overview?: string | null
          runtime?: number | null
          season_number: number
          still_path?: string | null
          tmdb_fetched_at?: string | null
          tmdb_show_id: number
          tmdb_vote_average?: number | null
          tmdb_vote_count?: number | null
        }
        Update: {
          air_date?: string | null
          created_at?: string | null
          episode_number?: number
          guest_stars?: Json | null
          id?: never
          name?: string | null
          overview?: string | null
          runtime?: number | null
          season_number?: number
          still_path?: string | null
          tmdb_fetched_at?: string | null
          tmdb_show_id?: number
          tmdb_vote_average?: number | null
          tmdb_vote_count?: number | null
        }
        Relationships: []
      }
      tv_shows: {
        Row: {
          adult: boolean | null
          backdrop_path: string | null
          cached_cast: Json | null
          cached_crew: Json | null
          cached_seasons: Json | null
          created_at: string | null
          created_by: Json | null
          episode_run_time: number[] | null
          first_air_date: string | null
          genre_ids: number[] | null
          id: number
          in_production: boolean | null
          last_air_date: string | null
          name: string
          networks: Json | null
          number_of_episodes: number | null
          number_of_seasons: number | null
          origin_country: string[] | null
          original_language: string | null
          original_name: string | null
          overview: string | null
          poster_path: string | null
          status: string | null
          tagline: string | null
          tmdb_fetched_at: string | null
          tmdb_id: number
          tmdb_popularity: number | null
          tmdb_vote_average: number | null
          tmdb_vote_count: number | null
          trailer_name: string | null
          trailer_youtube_key: string | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          adult?: boolean | null
          backdrop_path?: string | null
          cached_cast?: Json | null
          cached_crew?: Json | null
          cached_seasons?: Json | null
          created_at?: string | null
          created_by?: Json | null
          episode_run_time?: number[] | null
          first_air_date?: string | null
          genre_ids?: number[] | null
          id?: never
          in_production?: boolean | null
          last_air_date?: string | null
          name: string
          networks?: Json | null
          number_of_episodes?: number | null
          number_of_seasons?: number | null
          origin_country?: string[] | null
          original_language?: string | null
          original_name?: string | null
          overview?: string | null
          poster_path?: string | null
          status?: string | null
          tagline?: string | null
          tmdb_fetched_at?: string | null
          tmdb_id: number
          tmdb_popularity?: number | null
          tmdb_vote_average?: number | null
          tmdb_vote_count?: number | null
          trailer_name?: string | null
          trailer_youtube_key?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          adult?: boolean | null
          backdrop_path?: string | null
          cached_cast?: Json | null
          cached_crew?: Json | null
          cached_seasons?: Json | null
          created_at?: string | null
          created_by?: Json | null
          episode_run_time?: number[] | null
          first_air_date?: string | null
          genre_ids?: number[] | null
          id?: never
          in_production?: boolean | null
          last_air_date?: string | null
          name?: string
          networks?: Json | null
          number_of_episodes?: number | null
          number_of_seasons?: number | null
          origin_country?: string[] | null
          original_language?: string | null
          original_name?: string | null
          overview?: string | null
          poster_path?: string | null
          status?: string | null
          tagline?: string | null
          tmdb_fetched_at?: string | null
          tmdb_id?: number
          tmdb_popularity?: number | null
          tmdb_vote_average?: number | null
          tmdb_vote_count?: number | null
          trailer_name?: string | null
          trailer_youtube_key?: string | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          level: number
          unlocked_at: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          level?: number
          unlocked_at?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          level?: number
          unlocked_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_episode_watches: {
        Row: {
          created_at: string | null
          episode_name: string | null
          episode_number: number
          episode_runtime: number | null
          id: string
          notes: string | null
          season_number: number
          still_path: string | null
          tmdb_show_id: number
          user_id: string
          user_tv_show_id: string
          watch_number: number | null
          watched_at: string | null
        }
        Insert: {
          created_at?: string | null
          episode_name?: string | null
          episode_number: number
          episode_runtime?: number | null
          id?: string
          notes?: string | null
          season_number: number
          still_path?: string | null
          tmdb_show_id: number
          user_id: string
          user_tv_show_id: string
          watch_number?: number | null
          watched_at?: string | null
        }
        Update: {
          created_at?: string | null
          episode_name?: string | null
          episode_number?: number
          episode_runtime?: number | null
          id?: string
          notes?: string | null
          season_number?: number
          still_path?: string | null
          tmdb_show_id?: number
          user_id?: string
          user_tv_show_id?: string
          watch_number?: number | null
          watched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_episode_watches_user_tv_show_id_fkey"
            columns: ["user_tv_show_id"]
            isOneToOne: false
            referencedRelation: "user_tv_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lists: {
        Row: {
          cover_image_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cover_image_url?: string | null
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
      user_tv_show_likes: {
        Row: {
          created_at: string | null
          id: string
          name: string
          poster_path: string | null
          tmdb_id: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          poster_path?: string | null
          tmdb_id: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          poster_path?: string | null
          tmdb_id?: number
          user_id?: string
        }
        Relationships: []
      }
      user_tv_shows: {
        Row: {
          added_at: string | null
          backdrop_path: string | null
          current_episode: number | null
          current_season: number | null
          episodes_watched: number | null
          finished_at: string | null
          first_air_date: string | null
          genre_ids: number[] | null
          id: string
          is_liked: boolean | null
          name: string
          number_of_episodes: number | null
          number_of_seasons: number | null
          overview: string | null
          poster_path: string | null
          started_watching_at: string | null
          status: string
          tmdb_id: number
          updated_at: string | null
          user_id: string
          user_rating: number | null
          vote_average: number | null
        }
        Insert: {
          added_at?: string | null
          backdrop_path?: string | null
          current_episode?: number | null
          current_season?: number | null
          episodes_watched?: number | null
          finished_at?: string | null
          first_air_date?: string | null
          genre_ids?: number[] | null
          id?: string
          is_liked?: boolean | null
          name: string
          number_of_episodes?: number | null
          number_of_seasons?: number | null
          overview?: string | null
          poster_path?: string | null
          started_watching_at?: string | null
          status?: string
          tmdb_id: number
          updated_at?: string | null
          user_id: string
          user_rating?: number | null
          vote_average?: number | null
        }
        Update: {
          added_at?: string | null
          backdrop_path?: string | null
          current_episode?: number | null
          current_season?: number | null
          episodes_watched?: number | null
          finished_at?: string | null
          first_air_date?: string | null
          genre_ids?: number[] | null
          id?: string
          is_liked?: boolean | null
          name?: string
          number_of_episodes?: number | null
          number_of_seasons?: number | null
          overview?: string | null
          poster_path?: string | null
          started_watching_at?: string | null
          status?: string
          tmdb_id?: number
          updated_at?: string | null
          user_id?: string
          user_rating?: number | null
          vote_average?: number | null
        }
        Relationships: []
      }
      watchlist_comments: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_comments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist_likes: {
        Row: {
          created_at: string
          owner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          owner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          owner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_likes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watchlist_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      check_daily_ai_spend: {
        Args: { p_daily_limit_usd?: number }
        Returns: Json
      }
      check_rate_limit: {
        Args: {
          p_action: string
          p_max_requests: number
          p_user_id: string
          p_window_seconds: number
        }
        Returns: Json
      }
      cleanup_stale_movie_cache: { Args: never; Returns: number }
      cleanup_stale_tv_cache: { Args: never; Returns: undefined }
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
      get_season_progress: {
        Args: { p_tmdb_show_id: number; p_user_tv_show_id: string }
        Returns: {
          episodes_watched: number
          season_number: number
          total_episodes: number
        }[]
      }
      get_suggested_users: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          followers_count: number
          full_name: string
          id: string
          is_active: boolean
          mutual_count: number
          mutual_usernames: string[]
          shared_movie_count: number
          username: string
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
          total_tv_watched: number
          total_watched: number
        }[]
      }
      increment_bonus_scans: { Args: { p_user_id: string }; Returns: Json }
      sync_tv_show_progress: {
        Args: { p_user_tv_show_id: string }
        Returns: undefined
      }
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
export type TvShowStatus = 'watchlist' | 'watching' | 'watched' | 'dropped' | 'on_hold';
export type ContentMode = 'movies' | 'tv_shows' | 'both';
export type MediaType = 'movie' | 'tv_show';
export type FirstTakeMediaType = 'movie' | 'tv_show' | 'tv_season' | 'tv_episode';
export type ThemePreference = 'light' | 'dark' | 'system';
export type ReviewVisibility = 'public' | 'followers_only' | 'private';

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

// Helper types for achievements
export type Achievement = Database['public']['Tables']['achievements']['Row'];
export type AchievementLevel = Database['public']['Tables']['achievement_levels']['Row'];
export type UserAchievement = Database['public']['Tables']['user_achievements']['Row'];

// Helper types for genres
export type Genre = Database['public']['Tables']['genres']['Row'];

// Helper types for movies cache
export type CachedMovie = Database['public']['Tables']['movies']['Row'];
export type CachedMovieInsert = Database['public']['Tables']['movies']['Insert'];
export type CachedMovieUpdate = Database['public']['Tables']['movies']['Update'];

// Helper types for TV shows cache
export type CachedTvShow = Database['public']['Tables']['tv_shows']['Row'];
export type CachedTvShowInsert = Database['public']['Tables']['tv_shows']['Insert'];
export type CachedTvShowUpdate = Database['public']['Tables']['tv_shows']['Update'];

// Helper types for TV episodes cache
export type CachedTvEpisode = Database['public']['Tables']['tv_episodes_cache']['Row'];
export type CachedTvEpisodeInsert = Database['public']['Tables']['tv_episodes_cache']['Insert'];
export type CachedTvEpisodeUpdate = Database['public']['Tables']['tv_episodes_cache']['Update'];

// Helper types for user TV shows
export type UserTvShow = Database['public']['Tables']['user_tv_shows']['Row'];
export type UserTvShowInsert = Database['public']['Tables']['user_tv_shows']['Insert'];
export type UserTvShowUpdate = Database['public']['Tables']['user_tv_shows']['Update'];

// Helper types for user episode watches
export type UserEpisodeWatch = Database['public']['Tables']['user_episode_watches']['Row'];
export type UserEpisodeWatchInsert = Database['public']['Tables']['user_episode_watches']['Insert'];
export type UserEpisodeWatchUpdate = Database['public']['Tables']['user_episode_watches']['Update'];

// Helper types for user TV show likes
export type UserTvShowLike = Database['public']['Tables']['user_tv_show_likes']['Row'];
export type UserTvShowLikeInsert = Database['public']['Tables']['user_tv_show_likes']['Insert'];

// User stats types (from get-user-stats Edge Function)
export interface UserStatsResponse {
  summary: {
    totalWatched: number;
    totalTvWatched: number;
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

// Helper types for watchlist social features
export type WatchlistLike = Database['public']['Tables']['watchlist_likes']['Row'];
export type WatchlistLikeInsert = Database['public']['Tables']['watchlist_likes']['Insert'];
export type WatchlistComment = Database['public']['Tables']['watchlist_comments']['Row'];
export type WatchlistCommentInsert = Database['public']['Tables']['watchlist_comments']['Insert'];

/** Watchlist comment joined with the commenter's profile */
export interface WatchlistCommentWithProfile extends WatchlistComment {
  profiles: {
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
}
