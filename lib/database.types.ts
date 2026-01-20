export type MovieStatus = 'watchlist' | 'watching' | 'watched';

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
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
        };
      };
      user_movies: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: number;
          status: MovieStatus;
          title: string;
          overview: string | null;
          poster_path: string | null;
          backdrop_path: string | null;
          release_date: string | null;
          vote_average: number | null;
          genre_ids: number[];
          is_liked: boolean;
          added_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: number;
          status?: MovieStatus;
          title: string;
          overview?: string | null;
          poster_path?: string | null;
          backdrop_path?: string | null;
          release_date?: string | null;
          vote_average?: number | null;
          genre_ids?: number[];
          is_liked?: boolean;
          added_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tmdb_id?: number;
          status?: MovieStatus;
          title?: string;
          overview?: string | null;
          poster_path?: string | null;
          backdrop_path?: string | null;
          release_date?: string | null;
          vote_average?: number | null;
          genre_ids?: number[];
          is_liked?: boolean;
          added_at?: string;
          updated_at?: string;
        };
      };
      user_movie_likes: {
        Row: {
          id: string;
          user_id: string;
          tmdb_id: number;
          title: string;
          poster_path: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: number;
          title: string;
          poster_path?: string | null;
          created_at?: string;
        };
        Delete: {
          id?: string;
          user_id?: string;
          tmdb_id?: number;
        };
      };
      user_lists: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          description?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
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
          added_at: string;
        };
        Insert: {
          id?: string;
          list_id: string;
          tmdb_id: number;
          title: string;
          poster_path?: string | null;
          position?: number;
          added_at?: string;
        };
        Update: {
          id?: string;
          list_id?: string;
          tmdb_id?: number;
          title?: string;
          poster_path?: string | null;
          position?: number;
          added_at?: string;
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
          is_spoiler: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tmdb_id: number;
          movie_title: string;
          poster_path?: string | null;
          reaction_emoji?: string;
          quote_text: string;
          is_spoiler?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tmdb_id?: number;
          movie_title?: string;
          poster_path?: string | null;
          reaction_emoji?: string;
          quote_text?: string;
          is_spoiler?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
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
