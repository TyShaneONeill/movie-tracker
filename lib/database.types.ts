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
          is_revocable: boolean
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
          is_revocable?: boolean
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
          is_revocable?: boolean
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
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          reason: string | null
          reporter_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          reason?: string | null
          reporter_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          reason?: string | null
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      first_takes: {
        Row: {
          comment_count: number | null
          created_at: string | null
          episode_number: number | null
          id: string
          is_rewatch: boolean | null
          is_spoiler: boolean | null
          like_count: number | null
          media_type: string
          movie_title: string
          poster_path: string | null
          quote_text: string
          rating: number | null
          reaction_emoji: string
          season_number: number | null
          show_name: string | null
          title: string | null
          tmdb_id: number
          updated_at: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          comment_count?: number | null
          created_at?: string | null
          episode_number?: number | null
          id?: string
          is_rewatch?: boolean | null
          is_spoiler?: boolean | null
          like_count?: number | null
          media_type?: string
          movie_title: string
          poster_path?: string | null
          quote_text: string
          rating?: number | null
          reaction_emoji?: string
          season_number?: number | null
          show_name?: string | null
          title?: string | null
          tmdb_id: number
          updated_at?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          comment_count?: number | null
          created_at?: string | null
          episode_number?: number | null
          id?: string
          is_rewatch?: boolean | null
          is_spoiler?: boolean | null
          like_count?: number | null
          media_type?: string
          movie_title?: string
          poster_path?: string | null
          quote_text?: string
          rating?: number | null
          reaction_emoji?: string
          season_number?: number | null
          show_name?: string | null
          title?: string | null
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
      follow_requests: {
        Row: {
          created_at: string
          id: string
          requester_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_requests_target_id_fkey"
            columns: ["target_id"]
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
      ip_rate_limits: {
        Row: {
          action: string
          ip_address: string
          window_count: number
          window_start: string
        }
        Insert: {
          action: string
          ip_address: string
          window_count?: number
          window_start?: string
        }
        Update: {
          action?: string
          ip_address?: string
          window_count?: number
          window_start?: string
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
          external_ratings_fetched_at: string | null
          genre_ids: number[] | null
          id: number
          imdb_id: string | null
          imdb_rating: number | null
          imdb_votes: number | null
          metacritic_score: number | null
          original_language: string | null
          original_title: string | null
          overview: string | null
          poster_path: string | null
          release_date: string | null
          revenue: number | null
          rotten_tomatoes_score: number | null
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
          external_ratings_fetched_at?: string | null
          genre_ids?: number[] | null
          id?: number
          imdb_id?: string | null
          imdb_rating?: number | null
          imdb_votes?: number | null
          metacritic_score?: number | null
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          revenue?: number | null
          rotten_tomatoes_score?: number | null
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
          external_ratings_fetched_at?: string | null
          genre_ids?: number[] | null
          id?: number
          imdb_id?: string | null
          imdb_rating?: number | null
          imdb_votes?: number | null
          metacritic_score?: number | null
          original_language?: string | null
          original_title?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          revenue?: number | null
          rotten_tomatoes_score?: number | null
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
      notification_preferences: {
        Row: {
          created_at: string
          enabled: boolean
          feature: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature?: string
          id?: string
          updated_at?: string
          user_id?: string
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
          calendar_default_filters: Json | null
          content_mode: string
          created_at: string
          crop_ticket_photos: boolean
          default_collection_view: string
          feed_last_seen_at: string | null
          first_take_prompt_enabled: boolean | null
          followers_count: number | null
          following_count: number | null
          full_name: string | null
          id: string
          is_private: boolean
          onboarding_completed: boolean | null
          pending_followers_count: number
          review_visibility: string
          rewarded_ad_credits: number
          show_continue_watching: boolean
          theme_preference: string | null
          tier_expires_at: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          account_tier?: string
          avatar_url?: string | null
          bio?: string | null
          calendar_default_filters?: Json | null
          content_mode?: string
          created_at?: string
          crop_ticket_photos?: boolean
          default_collection_view?: string
          feed_last_seen_at?: string | null
          first_take_prompt_enabled?: boolean | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id: string
          is_private?: boolean
          onboarding_completed?: boolean | null
          pending_followers_count?: number
          review_visibility?: string
          rewarded_ad_credits?: number
          show_continue_watching?: boolean
          theme_preference?: string | null
          tier_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          account_tier?: string
          avatar_url?: string | null
          bio?: string | null
          calendar_default_filters?: Json | null
          content_mode?: string
          created_at?: string
          crop_ticket_photos?: boolean
          default_collection_view?: string
          feed_last_seen_at?: string | null
          first_take_prompt_enabled?: boolean | null
          followers_count?: number | null
          following_count?: number | null
          full_name?: string | null
          id?: string
          is_private?: boolean
          onboarding_completed?: boolean | null
          pending_followers_count?: number
          review_visibility?: string
          rewarded_ad_credits?: number
          show_continue_watching?: boolean
          theme_preference?: string | null
          tier_expires_at?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      push_notification_log: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          error_message: string | null
          feature: string
          id: string
          receipt_checked_at: string | null
          sent_at: string | null
          status: string
          ticket_id: string | null
          title: string
          token: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          error_message?: string | null
          feature: string
          id?: string
          receipt_checked_at?: string | null
          sent_at?: string | null
          status?: string
          ticket_id?: string | null
          title: string
          token: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          error_message?: string | null
          feature?: string
          id?: string
          receipt_checked_at?: string | null
          sent_at?: string | null
          status?: string
          ticket_id?: string | null
          title?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          id: string
          last_used_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_used_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: string
          last_used_at?: string
          platform?: string
          token?: string
          user_id?: string
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
      release_date_cache: {
        Row: {
          certification: string | null
          fetched_at: string | null
          id: string
          note: string | null
          region: string
          release_date: string
          release_type: number
          tmdb_id: number
        }
        Insert: {
          certification?: string | null
          fetched_at?: string | null
          id?: string
          note?: string | null
          region?: string
          release_date: string
          release_type: number
          tmdb_id: number
        }
        Update: {
          certification?: string | null
          fetched_at?: string | null
          id?: string
          note?: string | null
          region?: string
          release_date?: string
          release_type?: number
          tmdb_id?: number
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          reason: string
          reporter_id: string
          status: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      review_comments: {
        Row: {
          body: string
          created_at: string | null
          first_take_id: string | null
          id: string
          is_hidden: boolean | null
          is_spoiler: boolean | null
          like_count: number
          liked_by_author: boolean
          parent_comment_id: string | null
          report_count: number | null
          review_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          first_take_id?: string | null
          id?: string
          is_hidden?: boolean | null
          is_spoiler?: boolean | null
          like_count?: number
          liked_by_author?: boolean
          parent_comment_id?: string | null
          report_count?: number | null
          review_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          first_take_id?: string | null
          id?: string
          is_hidden?: boolean | null
          is_spoiler?: boolean | null
          like_count?: number
          liked_by_author?: boolean
          parent_comment_id?: string | null
          report_count?: number | null
          review_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_first_take_id_fkey"
            columns: ["first_take_id"]
            isOneToOne: false
            referencedRelation: "first_takes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "review_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_likes: {
        Row: {
          created_at: string | null
          first_take_id: string | null
          id: string
          review_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          first_take_id?: string | null
          id?: string
          review_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          first_take_id?: string | null
          id?: string
          review_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_likes_first_take_id_fkey"
            columns: ["first_take_id"]
            isOneToOne: false
            referencedRelation: "first_takes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_likes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment_count: number | null
          created_at: string
          id: string
          is_rewatch: boolean
          is_spoiler: boolean
          like_count: number | null
          media_type: string
          movie_title: string
          poster_path: string | null
          rating: number
          review_text: string
          title: string
          tmdb_id: number
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          comment_count?: number | null
          created_at?: string
          id?: string
          is_rewatch?: boolean
          is_spoiler?: boolean
          like_count?: number | null
          media_type?: string
          movie_title: string
          poster_path?: string | null
          rating: number
          review_text: string
          title: string
          tmdb_id: number
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          comment_count?: number | null
          created_at?: string
          id?: string
          is_rewatch?: boolean
          is_spoiler?: boolean
          like_count?: number | null
          media_type?: string
          movie_title?: string
          poster_path?: string | null
          rating?: number
          review_text?: string
          title?: string
          tmdb_id?: number
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string | null
          entitlement_id: string
          environment: string | null
          expires_at: string | null
          grace_period_expires_at: string | null
          id: string
          is_trial: boolean | null
          product_id: string
          raw_event: Json | null
          revenuecat_customer_id: string
          started_at: string
          status: string
          store: string
          store_transaction_id: string | null
          trial_end_at: string | null
          trial_start_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string | null
          entitlement_id?: string
          environment?: string | null
          expires_at?: string | null
          grace_period_expires_at?: string | null
          id?: string
          is_trial?: boolean | null
          product_id: string
          raw_event?: Json | null
          revenuecat_customer_id: string
          started_at?: string
          status?: string
          store: string
          store_transaction_id?: string | null
          trial_end_at?: string | null
          trial_start_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string | null
          entitlement_id?: string
          environment?: string | null
          expires_at?: string | null
          grace_period_expires_at?: string | null
          id?: string
          is_trial?: boolean | null
          product_id?: string
          raw_event?: Json | null
          revenuecat_customer_id?: string
          started_at?: string
          status?: string
          store?: string
          store_transaction_id?: string | null
          trial_end_at?: string | null
          trial_start_at?: string | null
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
          ticket_image_url: string | null
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
          ticket_image_url?: string | null
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
          ticket_image_url?: string | null
          ticket_type?: string | null
          tmdb_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ticket_scans: {
        Row: {
          barcode_data: string | null
          created_at: string
          id: string
          journey_id: string | null
          user_id: string
        }
        Insert: {
          barcode_data?: string | null
          created_at?: string
          id?: string
          journey_id?: string | null
          user_id: string
        }
        Update: {
          barcode_data?: string | null
          created_at?: string
          id?: string
          journey_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_scans_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "user_movies"
            referencedColumns: ["id"]
          },
        ]
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
          mpaa_rating: string | null
          overview: string | null
          poster_path: string | null
          release_date: string | null
          seat_location: string | null
          status: string
          theater_chain: string | null
          ticket_id: string | null
          ticket_price: number | null
          ticket_type: string | null
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
          mpaa_rating?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          seat_location?: string | null
          status?: string
          theater_chain?: string | null
          ticket_id?: string | null
          ticket_price?: number | null
          ticket_type?: string | null
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
          mpaa_rating?: string | null
          overview?: string | null
          poster_path?: string | null
          release_date?: string | null
          seat_location?: string | null
          status?: string
          theater_chain?: string | null
          ticket_id?: string | null
          ticket_price?: number | null
          ticket_type?: string | null
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
      user_popcorn: {
        Row: {
          achievement_id: string | null
          action_type: string
          earned_at: string
          id: string
          is_milestone: boolean
          is_retroactive: boolean
          reference_id: string | null
          seed: number
          user_id: string
        }
        Insert: {
          achievement_id?: string | null
          action_type: string
          earned_at?: string
          id?: string
          is_milestone?: boolean
          is_retroactive?: boolean
          reference_id?: string | null
          seed: number
          user_id: string
        }
        Update: {
          achievement_id?: string | null
          action_type?: string
          earned_at?: string
          id?: string
          is_milestone?: boolean
          is_retroactive?: boolean
          reference_id?: string | null
          seed?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_popcorn_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
        ]
      }
      user_streaming_services: {
        Row: {
          created_at: string | null
          id: string
          provider_id: number
          provider_logo_path: string | null
          provider_name: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          provider_id: number
          provider_logo_path?: string | null
          provider_name: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          provider_id?: number
          provider_logo_path?: string | null
          provider_name?: string
          user_id?: string
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
          metadata_refreshed_at: string | null
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
          metadata_refreshed_at?: string | null
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
          metadata_refreshed_at?: string | null
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
      award_popcorn_retroactive: {
        Args: { p_user_id: string }
        Returns: number
      }
      can_view_user_content: {
        Args: { content_user_id: string; content_visibility?: string }
        Returns: boolean
      }
      check_and_increment_scan: {
        Args: { p_daily_limit?: number; p_user_id: string }
        Returns: Json
      }
      check_daily_ai_spend: {
        Args: { p_daily_limit_usd?: number }
        Returns: Json
      }
      check_ip_rate_limit: {
        Args: {
          p_action: string
          p_ip_address: string
          p_max_requests: number
          p_window_seconds: number
        }
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
      create_journey_with_next_number: {
        Args: {
          p_backdrop_path?: string
          p_genre_ids?: number[]
          p_overview?: string
          p_poster_path?: string
          p_release_date?: string
          p_title: string
          p_tmdb_id: number
          p_user_id: string
          p_vote_average?: number
        }
        Returns: {
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
          mpaa_rating: string | null
          overview: string | null
          poster_path: string | null
          release_date: string | null
          seat_location: string | null
          status: string
          theater_chain: string | null
          ticket_id: string | null
          ticket_price: number | null
          ticket_type: string | null
          title: string
          tmdb_id: number
          updated_at: string
          user_id: string
          vote_average: number | null
          watch_format: string | null
          watch_time: string | null
          watched_at: string | null
          watched_with: string[] | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_movies"
          isOneToOne: false
          isSetofReturn: true
        }
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
          total_episodes_watched: number
          total_first_takes: number
          total_tv_watched: number
          total_watch_time_minutes: number
          total_watched: number
        }[]
      }
      increment_bonus_scans: { Args: { p_user_id: string }; Returns: Json }
      reorder_list_movies: {
        Args: { p_list_id: string; p_ordered_tmdb_ids: number[] }
        Returns: undefined
      }
      sync_profile_tier: { Args: { p_user_id: string }; Returns: undefined }
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
